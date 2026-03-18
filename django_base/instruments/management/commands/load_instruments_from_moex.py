"""
Django management команда для загрузки торговых инструментов из API Мосбиржи.

Использование:
    python manage.py load_instruments_from_moex
    python manage.py load_instruments_from_moex --update-existing
    python manage.py load_instruments_from_moex --instrument-type STOCK
"""

import logging

import requests
import pandas as pd
from pathlib import Path
from decimal import Decimal, InvalidOperation
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from instruments.models import (
    DEFAULT_TICKER_ICON_PATH,
    Instrument,
    SubIndustry,
)

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
            choices=['STOCK'],
            default='STOCK',
            help='Тип инструментов для загрузки (доступно: STOCK)',
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
            instruments_data = self._fetch_stocks()
            logger.info("load_instruments_from_moex: получен список, записей=%s", len(instruments_data))

            enrichment_map = self._load_csv_enrichment()
            sub_industry_lookup = self._load_sub_industry_lookup()

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
                        _, created = self._create_or_update_instrument(
                            instrument_data,
                            instrument_type,
                            update_existing,
                            enrichment_map,
                            sub_industry_lookup,
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

    @staticmethod
    def _csv_default_path() -> Path:
        return (
            Path(__file__).resolve().parents[4]
            / 'uploads'
            / 'data_instruments'
            / 'moex_stocks_enriched.csv'
        )

    @staticmethod
    def _clean_csv_value(value):
        if value is None:
            return ''
        text = str(value).strip()
        if text.lower() == 'nan':
            return ''
        return text

    def _load_csv_enrichment(self):
        path = self._csv_default_path()
        if not path.exists():
            self.stdout.write(self.style.WARNING(f'CSV файл не найден: {path}. Обогащение отключено.'))
            return {}

        required_columns = {
            'ticker',
            'sector',
            'industry_group',
            'industry',
            'sub_industry',
            'description',
            'logolink',
            'og_logo',
        }

        try:
            df = pd.read_csv(path, dtype=str)
        except Exception as exc:
            raise CommandError(f'Не удалось прочитать CSV с обогащением: {exc}') from exc

        missing_columns = sorted(required_columns - set(df.columns))
        if missing_columns:
            raise CommandError(
                f'CSV не содержит обязательные колонки: {", ".join(missing_columns)}'
            )

        enrichment_map = {}
        for row in df.itertuples(index=False):
            row_dict = row._asdict()
            ticker = self._clean_csv_value(row_dict.get('ticker'))
            if not ticker:
                continue

            enrichment_map[ticker] = {
                'sector': self._clean_csv_value(row_dict.get('sector'))[:100],
                'industry_group': self._clean_csv_value(row_dict.get('industry_group')),
                'industry': self._clean_csv_value(row_dict.get('industry')),
                'sub_industry': self._clean_csv_value(row_dict.get('sub_industry')),
                'description': self._clean_csv_value(row_dict.get('description')),
                'logolink': self._clean_csv_value(row_dict.get('logolink')),
                'og_logo': self._clean_csv_value(row_dict.get('og_logo')),
            }

        self.stdout.write(f'Загружено записей обогащения из CSV: {len(enrichment_map)}')
        return enrichment_map

    @staticmethod
    def _load_sub_industry_lookup():
        lookup = {}
        queryset = SubIndustry.objects.select_related('industry__industry_group__sector').all()
        for sub_industry in queryset:
            key = (
                sub_industry.industry.industry_group.sector.name,
                sub_industry.industry.industry_group.name,
                sub_industry.industry.name,
                sub_industry.name,
            )
            lookup[key] = sub_industry
        return lookup

    def _create_or_update_instrument(
        self,
        instrument_data,
        instrument_type,
        update_existing,
        enrichment_map,
        sub_industry_lookup,
    ):
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

        enrichment = enrichment_map.get(ticker, {})
        sector = enrichment.get('sector', '')

        sub_industry = None
        key = (
            enrichment.get('sector', ''),
            enrichment.get('industry_group', ''),
            enrichment.get('industry', ''),
            enrichment.get('sub_industry', ''),
        )
        if all(key):
            sub_industry = sub_industry_lookup.get(key)

        description = enrichment.get('description', '')
        logolink = enrichment.get('logolink', '') or DEFAULT_TICKER_ICON_PATH
        og_logo = enrichment.get('og_logo', '') or DEFAULT_TICKER_ICON_PATH

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
            'sub_industry': sub_industry,
            'description': description,
            'logolink': logolink,
            'og_logo': og_logo,
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
