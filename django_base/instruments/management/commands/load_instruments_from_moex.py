"""
Django management команда для загрузки торговых инструментов из API Мосбиржи.

Использование:
    python manage.py load_instruments_from_moex
    python manage.py load_instruments_from_moex --update-existing
    python manage.py load_instruments_from_moex --instrument-type STOCK
    python manage.py load_instruments_from_moex --instrument-type FUTURES
"""

import logging
from datetime import date
from typing import Any

import requests
import pandas as pd
from pathlib import Path
from decimal import Decimal, InvalidOperation
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from instruments.models import (
    DEFAULT_TICKER_ICON_PATH,
    Futures,
    FuturesAssetCodeMapping,
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
            choices=['STOCK', 'FUTURES'],
            default='STOCK',
            help='Тип инструментов для загрузки: STOCK — акции, FUTURES — фьючерсы FORTS с базовым активом из БД',
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
                self._handle_stocks(
                    update_existing=update_existing,
                    limit=limit,
                )
            elif instrument_type == 'FUTURES':
                self._handle_futures(
                    update_existing=update_existing,
                    limit=limit,
                )
            else:
                raise CommandError(f'Неподдерживаемый тип: {instrument_type}')

        except Exception as e:
            raise CommandError(f'Ошибка при загрузке данных: {str(e)}')

    def _handle_stocks(self, update_existing, limit):
        instruments_data = [
            item for item in self._fetch_stocks()
            if item.get('BOARDID') == 'TQBR'
            and item.get('BOARDNAME') == 'Т+: Акции и ДР - безадрес.'
        ]
        logger.info("load_instruments_from_moex: получен список акций, записей=%s", len(instruments_data))

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
                        'STOCK',
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

    def _handle_futures(self, update_existing, limit):
        rows = self._fetch_futures()
        logger.info("load_instruments_from_moex: получен список фьючерсов, записей=%s", len(rows))

        if limit:
            rows = rows[:limit]

        asset_codes = set()
        for row in rows:
            code = self._futures_row_asset_code(row)
            if code:
                asset_codes.add(code)

        base_by_ticker = {
            inst.ticker: inst
            for inst in Instrument.objects.filter(ticker__in=asset_codes)
        }

        manual_base_by_asset_code = {
            m.asset_code: m.base_instrument
            for m in FuturesAssetCodeMapping.objects.filter(
                is_active=True,
                asset_code__in=asset_codes,
            ).select_related('base_instrument')
        }
        self.stdout.write(
            f'Ручных сопоставлений ASSETCODE для этой выборки: {len(manual_base_by_asset_code)}'
        )

        created_count = 0
        updated_count = 0
        error_count = 0
        skipped_no_base = 0
        skipped_empty_asset = 0
        skipped_existing = 0

        today = timezone.now().date()

        self.stdout.write(f'Найдено строк в ответе API: {len(rows)}; уникальных ASSETCODE: {len(asset_codes)}')
        verbose_each = len(rows) <= 100

        with transaction.atomic():
            for idx, row in enumerate(rows, 1):
                shortname = row[0] if len(row) > 0 else None
                if idx % 200 == 0:
                    self.stdout.write(f'Обработано: {idx}/{len(rows)}')

                asset_code = self._futures_row_asset_code(row)
                if not asset_code:
                    skipped_empty_asset += 1
                    continue

                base = manual_base_by_asset_code.get(asset_code) or base_by_ticker.get(
                    asset_code
                )
                if base is None:
                    skipped_no_base += 1
                    continue

                try:
                    _, created = self._create_or_update_future(
                        row,
                        base,
                        update_existing,
                        today,
                    )
                    if created:
                        created_count += 1
                        if verbose_each:
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f'✓ Создан фьючерс: {shortname} → база {asset_code}'
                                )
                            )
                    else:
                        if update_existing:
                            updated_count += 1
                            if verbose_each:
                                self.stdout.write(
                                    self.style.SUCCESS(f'↻ Обновлён: {shortname}')
                                )
                        else:
                            skipped_existing += 1
                except ValueError as e:
                    error_count += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f'✗ Ошибка валидации для {shortname}: {str(e)}'
                        )
                    )
                except Exception as e:
                    error_count += 1
                    self.stdout.write(
                        self.style.ERROR(
                            f'✗ Ошибка при обработке {shortname}: {str(e)}'
                        )
                    )

            # Просроченные контракты помечаем неактивными (в т.ч. не попавшие в текущий ответ API)
            expired_qs = Futures.objects.filter(expiration_date__lt=today)
            deactivated = expired_qs.update(is_active=False)

        self.stdout.write(
            self.style.SUCCESS(
                f'\n{"="*50}\n'
                f'Загрузка фьючерсов завершена!\n'
                f'{"="*50}\n'
                f'Создано: {created_count}\n'
                f'Обновлено: {updated_count}\n'
                f'Пропущено (нет базового актива в БД по ASSETCODE): {skipped_no_base}\n'
                f'Пропущено (пустой ASSETCODE): {skipped_empty_asset}\n'
                f'Пропущено (уже есть в БД, без --update-existing): {skipped_existing}\n'
                f'Деактивировано просроченных контрактов: {deactivated}\n'
                f'Ошибок: {error_count}\n'
                f'Всего строк API: {len(rows)}'
            )
        )

    @staticmethod
    def _futures_row_asset_code(row: list[Any]) -> str | None:
        """ASSETCODE — второй столбец; пустой или отсутствующий — нет сопоставления с базой."""
        if len(row) < 2:
            return None
        code = row[1]
        if code is None:
            return None
        code = str(code).strip()
        return code or None

    def _create_or_update_future(
        self,
        row: list[Any],
        base_asset: Instrument,
        update_existing: bool,
        today: date,
    ):
        contract_ticker = row[0]
        if not contract_ticker:
            raise ValueError('Пустой тикер контракта (SHORTNAME)')
        contract_ticker = str(contract_ticker).strip()
        if len(contract_ticker) > 50:
            raise ValueError(f'Слишком длинный тикер: {contract_ticker}')

        secname = row[2] if len(row) > 2 else ''
        name = (str(secname).strip() if secname else '')[:200] or contract_ticker

        minstep = row[3] if len(row) > 3 else None
        try:
            min_price_step = Decimal(str(minstep)) if minstep is not None else Decimal('0.0001')
        except (InvalidOperation, ValueError):
            min_price_step = Decimal('0.0001')

        lastdel = row[4] if len(row) > 4 else None
        expiration_date = None
        if lastdel:
            raw = str(lastdel).strip()
            if raw:
                try:
                    expiration_date = date.fromisoformat(raw)
                except ValueError:
                    expiration_date = None

        lot_raw = row[5] if len(row) > 5 else None
        lot_size = None
        if lot_raw is not None:
            try:
                lot_size = int(lot_raw)
            except (ValueError, TypeError):
                lot_size = None

        is_active = True
        if expiration_date is not None and expiration_date < today:
            is_active = False

        currency = (base_asset.currency or 'RUB')[:3]

        defaults = {
            'name': name,
            'min_price_step': min_price_step,
            'lot_size': lot_size,
            'currency': currency,
            'expiration_date': expiration_date,
            'is_active': is_active,
        }

        if update_existing:
            return Futures.objects.update_or_create(
                base_asset=base_asset,
                ticker=contract_ticker,
                defaults=defaults,
            )
        return Futures.objects.get_or_create(
            base_asset=base_asset,
            ticker=contract_ticker,
            defaults=defaults,
        )

    def _fetch_futures(self):
        """
        Список фьючерсов FORTS (поля SHORTNAME, ASSETCODE, SECNAME, MINSTEP, LASTDELDATE, LOTVOLUME).

        Сопоставление с базовым активом: Instrument.ticker == ASSETCODE.
        """
        base_url = 'https://iss.moex.com/iss'
        url = f'{base_url}/engines/futures/markets/forts/securities.json'

        params = {
            'iss.meta': 'off',
            'iss.only': 'securities',
            'limit': 'unlimited',
            'securities.columns': 'SHORTNAME,ASSETCODE,SECNAME,MINSTEP,LASTDELDATE,LOTVOLUME',
        }

        try:
            logger.info("load_instruments_from_moex: запрос списка фьючерсов FORTS...")
            response = requests.get(url, params=params, timeout=60)
            response.raise_for_status()
            data = response.json()
            securities = data.get('securities', {}).get('data', [])
            if not securities:
                self.stdout.write(self.style.WARNING('Не получены данные по фьючерсам'))
                return []
            logger.info("load_instruments_from_moex: фьючерсы получены, строк=%s", len(securities))
            return securities
        except requests.RequestException as e:
            raise CommandError(f'Ошибка при запросе фьючерсов к API Мосбиржи: {str(e)}')

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
        try:
            min_price_step = Decimal(str(min_price_step))
        except (InvalidOperation, ValueError):
            min_price_step = Decimal('0.0001')

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
