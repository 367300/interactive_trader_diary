import os
from django.db.models.signals import pre_delete
from django.dispatch import receiver
from .models import TradeScreenshot


@receiver(pre_delete, sender=TradeScreenshot)
def delete_screenshot_file(sender, instance, **kwargs):
    """Удаление файла скриншота при удалении объекта"""
    if instance.image:
        try:
            if os.path.isfile(instance.image.path):
                os.remove(instance.image.path)
        except (ValueError, OSError):
            # Игнорируем ошибки при удалении файла
            pass
