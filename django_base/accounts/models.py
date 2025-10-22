from django.db import models
from django.contrib.auth.models import User


class TraderProfile(models.Model):
    """Профиль трейдера с дополнительными данными"""
    
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='trader_profile',
        verbose_name='Пользователь'
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления'
    )
    
    class Meta:
        verbose_name = 'Профиль трейдера'
        verbose_name_plural = 'Профили трейдеров'
        db_table = 'accounts_trader_profile'
    
    def __str__(self):
        return f'Профиль {self.user.username}'