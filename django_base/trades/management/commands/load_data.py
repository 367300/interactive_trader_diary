import json
import os
import sys

sys.path.append('/path/to/your/django/project')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'your_project.settings')

import django
django.setup()

from django_base.trades.models import FinancialInstrument

def load_data_from_json(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        data = json.load(file)

    analytics_data = data.get("analytics", {}).get("data", [])

    for item in analytics_data:
        # Пример: создание записи для каждого инструмента
        # Заполните поля в соответствии с вашим JSON
        ticker = item[2]  # тикер
        short_name = item[3]  # короткое название
        currency = item[20]  # валюта

        # Здесь вы должны определить, как получить остальные поля
        # Например, если их нет в JSON, можно оставить значения по умолчанию или запросить у пользователя
        instrument_type = 'акция'  # Пример, укажите тип вручную или добавьте в JSON
        economic_sector = ''  # Пример, добавьте сектор экономики вручную или в JSON
        lot_size = 1  # Пример, добавьте размер лота
        min_price_step = 0.01  # Пример, добавьте минимальный шаг цены

        FinancialInstrument.objects.create(
            ticker=ticker,
            full_name=short_name,
            instrument_type=instrument_type,
            economic_sector=economic_sector,
            lot_size=lot_size,
            min_price_step=min_price_step,
            currency=currency
        )

    print("Данные успешно загружены!")

if __name__ == "__main__":
    file_path = 'imoex.json'  # укажите путь к вашему JSON-файлу
    load_data_from_json(file_path)