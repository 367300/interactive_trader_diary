"""
Django management команда для загрузки торговых инструментов из API Мосбиржи.

Использование:
    python manage.py load_instruments_from_moex
    python manage.py load_instruments_from_moex --update-existing
    python manage.py load_instruments_from_moex --instrument-type STOCK
"""

import logging

import requests
from decimal import Decimal, InvalidOperation
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from instruments.models import Instrument

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Загружает торговые инструменты из открытого API Мосбиржи'

    def add_arguments(self, parser):
        parser.add_argument(
            '--update-existing',
            action='store_true',
            help='Обновить существующие инструменты',
        )
        parser.add_argument(
            '--instrument-type',
            type=str,
            choices=['STOCK', 'FUTURES'],
            default='STOCK',
            help='Тип инструментов для загрузки (по умолчанию: STOCK)',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Ограничить количество загружаемых инструментов (для тестирования)',
        )

    def handle(self, *args, **options):
        instrument_type = options['instrument_type']
        update_existing = options['update_existing']
        limit = options['limit']

        self.stdout.write(
            self.style.SUCCESS(
                f'Начинаю загрузку инструментов типа {instrument_type} из API Мосбиржи...'
            )
        )
        logger.info("load_instruments_from_moex: начало загрузки, тип=%s", instrument_type)

        try:
            if instrument_type == 'STOCK':
                instruments_data = self._fetch_stocks()
            else:
                instruments_data = self._fetch_futures()
            logger.info("load_instruments_from_moex: получен список, записей=%s", len(instruments_data))

            if limit:
                instruments_data = instruments_data[:limit]

            created_count = 0
            updated_count = 0
            error_count = 0
            skipped_count = 0

            self.stdout.write(f'Найдено инструментов для обработки: {len(instruments_data)}')

            with transaction.atomic():
                for idx, instrument_data in enumerate(instruments_data, 1):
                    ticker = instrument_data.get('SECID') or instrument_data.get('ticker', 'unknown')
                    
                    if idx % 50 == 0:
                        self.stdout.write(f'Обработано: {idx}/{len(instruments_data)}')
                    
                    try:
                        instrument, created = self._create_or_update_instrument(
                            instrument_data, instrument_type, update_existing
                        )
                        if created:
                            created_count += 1
                            self.stdout.write(
                                self.style.SUCCESS(f'✓ Создан: {ticker}')
                            )
                        else:
                            if update_existing:
                                updated_count += 1
                                self.stdout.write(
                                    self.style.SUCCESS(f'↻ Обновлен: {ticker}')
                                )
                            else:
                                skipped_count += 1
                    except ValueError as e:
                        error_count += 1
                        self.stdout.write(
                            self.style.WARNING(
                                f'✗ Ошибка валидации для {ticker}: {str(e)}'
                            )
                        )
                    except Exception as e:
                        error_count += 1
                        self.stdout.write(
                            self.style.ERROR(
                                f'✗ Ошибка при обработке {ticker}: {str(e)}'
                            )
                        )

            self.stdout.write(
                self.style.SUCCESS(
                    f'\n{"="*50}\n'
                    f'Загрузка завершена!\n'
                    f'{"="*50}\n'
                    f'Создано: {created_count}\n'
                    f'Обновлено: {updated_count}\n'
                    f'Пропущено: {skipped_count}\n'
                    f'Ошибок: {error_count}\n'
                    f'Всего обработано: {len(instruments_data)}'
                )
            )

        except Exception as e:
            raise CommandError(f'Ошибка при загрузке данных: {str(e)}')

    def _fetch_stocks(self):
        """
        Получает список акций с Мосбиржи.
        
        API эндпоинт: https://iss.moex.com/iss/engines/stock/markets/shares/securities.json
        """
        base_url = 'https://iss.moex.com/iss'
        securities_url = f'{base_url}/engines/stock/markets/shares/securities.json'
        
        params = {
            'iss.meta': 'off',  # Отключаем метаданные для упрощения
            'iss.only': 'securities',
            'limit': 'unlimited'
        }

        try:
            logger.info("load_instruments_from_moex: запрос списка акций (limit=unlimited)...")
            response = requests.get(securities_url, params=params, timeout=30)
            response.raise_for_status()
            logger.info("load_instruments_from_moex: ответ получен, разбор JSON...")
            data = response.json()

            securities = data.get('securities', {}).get('data', [])
            columns = data.get('securities', {}).get('columns', [])
            
            if not securities or not columns:
                self.stdout.write(self.style.WARNING('Не получены данные об акциях'))
                return []

            # Преобразуем список списков в список словарей
            instruments = []
            total = len(securities)
            for i, sec in enumerate(securities, 1):
                instrument_dict = dict(zip(columns, sec))

                if 'RU000' not in instrument_dict['SECID']:
                    instruments.append(instrument_dict)
                if i % 50 == 0:
                    logger.info("load_instruments_from_moex: загружены детали %s/%s", i, total)

            return instruments

        except requests.RequestException as e:
            raise CommandError(f'Ошибка при запросе к API Мосбиржи: {str(e)}')

    def _fetch_futures(self):
        """
        Получает список фьючерсов с Мосбиржи.
        
        API эндпоинт: https://iss.moex.com/iss/engines/futures/markets/forts/securities.json
        """
        base_url = 'https://iss.moex.com/iss'
        securities_url = f'{base_url}/engines/futures/markets/forts/securities.json'
        
        params = {
            'iss.meta': 'off',
            'iss.only': 'securities',
            'limit': 'unlimited'
        }

        try:
            response = requests.get(securities_url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            securities = data.get('securities', {}).get('data', [])
            columns = data.get('securities', {}).get('columns', [])
            
            if not securities or not columns:
                self.stdout.write(self.style.WARNING('Не получены данные о фьючерсах'))
                return []

            instruments = []
            for sec in securities:
                instrument_dict = dict(zip(columns, sec))
                
                instruments.append(instrument_dict)

            return instruments

        except requests.RequestException as e:
            raise CommandError(f'Ошибка при запросе к API Мосбиржи: {str(e)}')

    def _create_or_update_instrument(self, instrument_data, instrument_type, update_existing):
        """
        Создает или обновляет инструмент в базе данных.
        """
        ticker = instrument_data.get('SECID') or instrument_data.get('ticker')
        if not ticker:
            raise ValueError('Тикер не найден в данных')
        
        # Проверяем, что тикер не пустой и не слишком длинный
        ticker = str(ticker).strip()
        if not ticker or len(ticker) > 50:
            raise ValueError(f'Некорректный тикер: {ticker}')

        name = (
            instrument_data.get('SHORTNAME') or 
            instrument_data.get('NAME') or 
            instrument_data.get('name') or
            ticker
        )

        # Получаем дополнительные данные
        min_price_step = instrument_data.get('MINSTEP')
        if min_price_step is not None and str(min_price_step).strip() == "0.000001":
            min_price_step = "0.01"
        if min_price_step is None:
            # Пробуем найти в основных данных
            min_price_step = (
                instrument_data.get('min_price_step') or 
                instrument_data.get('MIN_STEP') or
                instrument_data.get('STEPPRICE') or
                instrument_data.get('STEP_PRICE')
            )
            if min_price_step:
                try:
                    min_price_step = Decimal(str(min_price_step))
                    # Проверяем, что значение положительное
                    if min_price_step <= 0:
                        min_price_step = Decimal('0.01')
                except (InvalidOperation, ValueError):
                    min_price_step = Decimal('0.01')  # Значение по умолчанию
            else:
                min_price_step = Decimal('0.01')  # Значение по умолчанию
        else:
            # Убеждаемся, что это Decimal
            if not isinstance(min_price_step, Decimal):
                try:
                    min_price_step = Decimal(str(min_price_step))
                except (InvalidOperation, ValueError):
                    min_price_step = Decimal('0.01')

        lot_size = instrument_data.get('lot_size') or instrument_data.get('LOTSIZE')
        if lot_size:
            try:
                lot_size = int(lot_size)
            except (ValueError, TypeError):
                lot_size = 1
        else:
            lot_size = 1

        currency = instrument_data.get('currency') or instrument_data.get('CURRENCYID')
        if currency:
            currency = str(currency).upper()[:3]
        else:
            currency = 'RUB'

        sector = instrument_data.get('sector') or instrument_data.get('SECTOR')
        if sector:
            sector = str(sector)[:100]
        else:
            sector = ''

        # Проверяем, активен ли инструмент
        is_active = True
        status = instrument_data.get('STATUS') or instrument_data.get('status')
        if status:
            # Если статус указывает на неактивность
            if status != 'A':
                is_active = False

        defaults = {
            'name': name[:200],  # Ограничиваем длину
            'instrument_type': instrument_type,
            'min_price_step': min_price_step,
            'lot_size': lot_size,
            'currency': currency,
            'sector': sector,
            'is_active': is_active,
        }

        if update_existing:
            instrument, created = Instrument.objects.update_or_create(
                ticker=ticker,
                defaults=defaults
            )
        else:
            instrument, created = Instrument.objects.get_or_create(
                ticker=ticker,
                defaults=defaults
            )

        return instrument, created
