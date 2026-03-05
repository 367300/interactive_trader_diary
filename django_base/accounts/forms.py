from django.contrib.auth import authenticate
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.models import User


class LoginUsernameOrEmailForm(AuthenticationForm):
    """Форма входа: принимает имя пользователя или email."""

    def clean(self):
        username = self.cleaned_data.get('username')
        password = self.cleaned_data.get('password')

        if username and password:
            # Если введено похоже на email — ищем пользователя по email
            if '@' in username:
                try:
                    user = User.objects.get(email__iexact=username)
                    username = user.username
                except User.DoesNotExist:
                    pass  # authenticate() вернёт None — покажет "Неверный логин или пароль"

            self.user_cache = authenticate(
                self.request, username=username, password=password
            )
            if self.user_cache is None:
                raise self.get_invalid_login_error()
            self.confirm_login_allowed(self.user_cache)

        return self.cleaned_data
