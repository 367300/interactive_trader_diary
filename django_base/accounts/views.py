from django.shortcuts import render, redirect
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from django.views.generic import TemplateView
from django.urls import reverse_lazy
from django.contrib.auth.views import LoginView
from .models import TraderProfile


class CustomLoginView(LoginView):
    """Кастомная страница входа"""
    template_name = 'accounts/login.html'
    redirect_authenticated_user = True
    
    def get_success_url(self):
        return reverse_lazy('core:dashboard')
    
    def form_valid(self, form):
        messages.success(self.request, f'Добро пожаловать, {form.get_user().username}!')
        return super().form_valid(form)


@require_http_methods(["GET", "POST"])
def register_view(request):
    """Регистрация нового пользователя"""
    if request.user.is_authenticated:
        return redirect('core:dashboard')
    
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password1 = request.POST.get('password1')
        password2 = request.POST.get('password2')
        
        # Валидация
        errors = {}
        
        if not username:
            errors['username'] = 'Имя пользователя обязательно'
        elif User.objects.filter(username=username).exists():
            errors['username'] = 'Пользователь с таким именем уже существует'
        
        if not email:
            errors['email'] = 'Email обязателен'
        elif User.objects.filter(email=email).exists():
            errors['email'] = 'Пользователь с таким email уже существует'
        
        if not password1:
            errors['password1'] = 'Пароль обязателен'
        elif len(password1) < 8:
            errors['password1'] = 'Пароль должен содержать минимум 8 символов'
        
        if password1 != password2:
            errors['password2'] = 'Пароли не совпадают'
        
        if not errors:
            # Создаем пользователя
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password1
            )
            
            # Создаем профиль трейдера
            TraderProfile.objects.create(
                user=user,
                use_default_deposit=True  # По умолчанию используем дефолтный депозит
            )
            
            # Авторизуем пользователя
            login(request, user)
            messages.success(request, 'Регистрация прошла успешно! Добро пожаловать!')
            return redirect('core:dashboard')
        
        # Если есть ошибки, показываем их
        for field, error in errors.items():
            messages.error(request, f'{field}: {error}')
    
    return render(request, 'accounts/register.html')


@login_required
def logout_view(request):
    """Выход из системы"""
    logout(request)
    messages.info(request, 'Вы успешно вышли из системы')
    return redirect('core:index')


@method_decorator(login_required, name='dispatch')
class ProfileView(TemplateView):
    """Профиль пользователя"""
    template_name = 'accounts/profile.html'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        
        try:
            profile = user.trader_profile
        except TraderProfile.DoesNotExist:
            profile = TraderProfile.objects.create(user=user)
        
        context['profile'] = profile
        return context
    
    def post(self, request, *args, **kwargs):
        profile = request.user.trader_profile
        
        # Обновляем данные профиля
        initial_deposit = request.POST.get('initial_deposit')
        current_deposit = request.POST.get('current_deposit')
        use_default_deposit = request.POST.get('use_default_deposit') == 'on'
        
        if initial_deposit:
            try:
                profile.initial_deposit = float(initial_deposit)
            except ValueError:
                messages.error(request, 'Неверный формат начального депозита')
        else:
            profile.initial_deposit = None
        
        if current_deposit:
            try:
                profile.current_deposit = float(current_deposit)
            except ValueError:
                messages.error(request, 'Неверный формат текущего депозита')
        else:
            profile.current_deposit = None
        
        profile.use_default_deposit = use_default_deposit
        profile.save()
        
        messages.success(request, 'Профиль успешно обновлен')
        return redirect('accounts:profile')