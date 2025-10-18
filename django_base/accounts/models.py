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
    
    initial_deposit = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Начальный депозит (руб.)'
    )
    
    current_deposit = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Текущий депозит (руб.)'
    )
    
    use_default_deposit = models.BooleanField(
        default=False,
        verbose_name='Использовать дефолтный депозит (1 млн руб.)'
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
    
    def get_effective_deposit(self):
        """Получить эффективный депозит для расчетов"""
        if self.current_deposit is not None:
            return self.current_deposit
        elif self.initial_deposit is not None:
            return self.initial_deposit
        elif self.use_default_deposit:
            return 1000000.00  # 1 млн рублей по умолчанию
        return None