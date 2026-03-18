from pathlib import Path

import pandas as pd
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from instruments.models import Sector, IndustryGroup, Industry, SubIndustry


class Command(BaseCommand):
    help = (
        'Загружает и обновляет справочники Sector/IndustryGroup/Industry/SubIndustry '
        'из файла moex_stocks_enriched.csv'
    )

    REQUIRED_COLUMNS = (
        'ticker',
        'sector',
        'industry_group',
        'industry',
        'sub_industry',
        'sub_industry_desc',
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--csv-path',
            type=str,
            default=None,
            help='Путь к CSV файлу (по умолчанию uploads/data_instruments/moex_stocks_enriched.csv)',
        )

    def handle(self, *args, **options):
        csv_path = self._resolve_csv_path(options.get('csv_path'))
        df = self._read_csv(csv_path)

        missing_columns = [col for col in self.REQUIRED_COLUMNS if col not in df.columns]
        if missing_columns:
            raise CommandError(
                f'В CSV отсутствуют обязательные колонки: {", ".join(missing_columns)}'
            )

        for col in self.REQUIRED_COLUMNS:
            df[col] = df[col].fillna('').astype(str).str.strip()

        df = df[df['ticker'] != ''].copy()
        if df.empty:
            raise CommandError('CSV не содержит строк с заполненным ticker.')

        created_sector = 0
        created_group = 0
        created_industry = 0
        created_sub_industry = 0
        updated_sub_industry = 0

        sectors_cache = {}
        groups_cache = {}
        industries_cache = {}

        with transaction.atomic():
            for sector_name in sorted(x for x in df['sector'].unique() if x):
                sector, created = Sector.objects.get_or_create(name=sector_name)
                sectors_cache[sector_name] = sector
                if created:
                    created_sector += 1

            groups_df = (
                df[['sector', 'industry_group']]
                .drop_duplicates()
                .sort_values(['sector', 'industry_group'])
            )
            for row in groups_df.itertuples(index=False):
                sector_name = row.sector
                group_name = row.industry_group
                if not sector_name or not group_name:
                    continue

                sector = sectors_cache[sector_name]
                group, created = IndustryGroup.objects.get_or_create(
                    name=group_name,
                    sector=sector,
                )
                groups_cache[(sector_name, group_name)] = group
                if created:
                    created_group += 1

            industries_df = (
                df[['sector', 'industry_group', 'industry']]
                .drop_duplicates()
                .sort_values(['sector', 'industry_group', 'industry'])
            )
            for row in industries_df.itertuples(index=False):
                sector_name = row.sector
                group_name = row.industry_group
                industry_name = row.industry
                if not sector_name or not group_name or not industry_name:
                    continue

                group = groups_cache.get((sector_name, group_name))
                if group is None:
                    continue

                industry, created = Industry.objects.get_or_create(
                    name=industry_name,
                    industry_group=group,
                )
                industries_cache[(sector_name, group_name, industry_name)] = industry
                if created:
                    created_industry += 1

            sub_industries_df = (
                df[['sector', 'industry_group', 'industry', 'sub_industry', 'sub_industry_desc']]
                .drop_duplicates()
                .sort_values(['sector', 'industry_group', 'industry', 'sub_industry'])
            )
            for row in sub_industries_df.itertuples(index=False):
                sector_name = row.sector
                group_name = row.industry_group
                industry_name = row.industry
                sub_industry_name = row.sub_industry
                description = row.sub_industry_desc or ''
                if not sector_name or not group_name or not industry_name or not sub_industry_name:
                    continue

                industry = industries_cache.get((sector_name, group_name, industry_name))
                if industry is None:
                    continue

                sub_industry, created = SubIndustry.objects.get_or_create(
                    name=sub_industry_name,
                    industry=industry,
                    defaults={'description': description},
                )
                if created:
                    created_sub_industry += 1
                elif description and sub_industry.description != description:
                    sub_industry.description = description
                    sub_industry.save(update_fields=['description'])
                    updated_sub_industry += 1

        self.stdout.write(self.style.SUCCESS('Справочники отраслей успешно загружены.'))
        self.stdout.write(
            'Создано: '
            f'Sector={created_sector}, '
            f'IndustryGroup={created_group}, '
            f'Industry={created_industry}, '
            f'SubIndustry={created_sub_industry}; '
            f'обновлено SubIndustry.description={updated_sub_industry}'
        )

    @staticmethod
    def _resolve_csv_path(raw_path: str | None) -> Path:
        if raw_path:
            path = Path(raw_path)
        else:
            path = (
                Path(__file__).resolve().parents[4]
                / 'uploads'
                / 'data_instruments'
                / 'moex_stocks_enriched.csv'
            )
        return path.resolve()

    @staticmethod
    def _read_csv(path: Path) -> pd.DataFrame:
        if not path.exists():
            raise CommandError(f'CSV файл не найден: {path}')

        try:
            return pd.read_csv(path, dtype=str)
        except Exception as exc:
            raise CommandError(f'Не удалось прочитать CSV: {exc}') from exc
