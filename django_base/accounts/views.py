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
from trades.models import Trade
from strategies.models import TradingStrategy

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
            TraderProfile.objects.create(user=user)
            
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

        # Статистика
        trades = Trade.objects.filter(user=user)
        context['total_trades'] = trades.count()
        context['closed_trades'] = trades.filter(trade_type='CLOSE').count()
        context['open_trades'] = context['total_trades'] - context['closed_trades']

        context['count_strategies'] = TradingStrategy.objects.filter(user=user, is_active=True).count()
        
        context['profile'] = profile
        return context
    
    def post(self, request, *args, **kwargs):
        messages.success(request, 'Профиль успешно обновлен')
        return redirect('accounts:profile')