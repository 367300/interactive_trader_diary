import os
from django.db.models.signals import pre_delete, post_delete
from django.dispatch import receiver
from easy_thumbnails.files import get_thumbnailer
from easy_thumbnails.models import Thumbnail
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


@receiver(post_delete, sender=TradeScreenshot)
def delete_screenshot_thumbnails(sender, instance, **kwargs):
    """Удаление миниатюр скриншота при удалении объекта"""
    if instance.image:
        try:
            # Получаем thumbnailer для изображения
            thumbnailer = get_thumbnailer(instance.image)
            
            # Удаляем все миниатюры для этого изображения
            # Это безопасный способ удаления миниатюр через easy_thumbnails
            thumbnailer.delete_thumbnails()
            
        except (ValueError, OSError, AttributeError):
            # Игнорируем ошибки при удалении миниатюр
            pass
