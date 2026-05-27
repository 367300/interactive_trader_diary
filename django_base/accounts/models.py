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

    _tinkoff_token = models.TextField(
        "T-Invest API токен (зашифрованный)",
        blank=True,
        default="",
        db_column="tinkoff_token",
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

    @property
    def tinkoff_token(self) -> str:
        from accounts.encryption import decrypt
        return decrypt(self._tinkoff_token)

    @tinkoff_token.setter
    def tinkoff_token(self, value: str):
        from accounts.encryption import encrypt
        self._tinkoff_token = encrypt(value) if value else ""

    @property
    def tinkoff_token_masked(self) -> str | None:
        token = self.tinkoff_token
        if not token:
            return None
        return token[:4] + "***" + token[-4:] if len(token) > 8 else "***"

    @property
    def has_tinkoff_token(self) -> bool:
        return bool(self._tinkoff_token)
