from django.core.exceptions import ValidationError
from django_base import settings


def validate_file_size(value):
    """Проверка на размер скриншота."""
    limit = settings.LIMIT_SIZE_MB * 1024 * 1024
    if value.size > limit:
        raise ValidationError(
            f"Файл слишком большой. Размер не должен превышать {settings.LIMIT_SIZE_MB} МБ."
        )
