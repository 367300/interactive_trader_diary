from django import forms
from django.contrib.auth.models import User
from .models import Trade, TradeAnalysis
from strategies.models import TradingStrategy
from instruments.models import Instrument


class TradeForm(forms.ModelForm):
    """Форма для создания и редактирования сделки"""
    
    class Meta:
        model = Trade
        fields = [
            'strategy', 'instrument', 'trade_date', 'trading_session',
            'direction', 'entry_price', 'exit_price', 'quantity',
            'leverage', 'commission', 'planned_stop_loss', 'planned_take_profit',
            'actual_result_points', 'actual_result_rub', 'is_closed'
        ]
        widgets = {
            'trade_date': forms.DateTimeInput(attrs={
                'type': 'datetime-local',
                'class': 'form-control'
            }),
            'trading_session': forms.Select(attrs={'class': 'form-select'}),
            'direction': forms.Select(attrs={'class': 'form-select'}),
            'strategy': forms.Select(attrs={'class': 'form-select'}),
            'instrument': forms.Select(attrs={'class': 'form-select'}),
            'entry_price': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'placeholder': '0.00'
            }),
            'exit_price': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'placeholder': '0.00'
            }),
            'quantity': forms.NumberInput(attrs={
                'class': 'form-control',
                'min': '1',
                'placeholder': '1'
            }),
            'leverage': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'min': '1.0',
                'value': '1.0'
            }),
            'commission': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'value': '0.00'
            }),
            'planned_stop_loss': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'placeholder': '0.00'
            }),
            'planned_take_profit': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'placeholder': '0.00'
            }),
            'actual_result_points': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'placeholder': '0.00'
            }),
            'actual_result_rub': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'placeholder': '0.00'
            }),
            'is_closed': forms.CheckboxInput(attrs={'class': 'form-check-input'})
        }
    
    def __init__(self, user=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        if user:
            # Фильтруем стратегии только для текущего пользователя
            self.fields['strategy'].queryset = TradingStrategy.objects.filter(
                user=user, 
                is_active=True
            )
            self.fields['strategy'].empty_label = "Выберите стратегию (необязательно)"
        
        # Фильтруем только активные инструменты
        self.fields['instrument'].queryset = Instrument.objects.filter(is_active=True)
        
        # Делаем некоторые поля обязательными
        self.fields['instrument'].required = True
        self.fields['trade_date'].required = True
        self.fields['direction'].required = True
        self.fields['entry_price'].required = True
        self.fields['quantity'].required = True
        
        # Добавляем help_text
        self.fields['leverage'].help_text = "Плечо (1.0 = без плеча)"
        self.fields['commission'].help_text = "Комиссия брокера в рублях"
        self.fields['planned_stop_loss'].help_text = "Плановый стоп-лосс в пунктах"
        self.fields['planned_take_profit'].help_text = "Плановый тейк-профит в пунктах"
        self.fields['actual_result_points'].help_text = "Фактический результат в пунктах"
        self.fields['actual_result_rub'].help_text = "Фактический результат в рублях"
    
    def clean(self):
        cleaned_data = super().clean()
        entry_price = cleaned_data.get('entry_price')
        exit_price = cleaned_data.get('exit_price')
        is_closed = cleaned_data.get('is_closed')
        
        # Если сделка закрыта, проверяем наличие цены выхода
        if is_closed and not exit_price:
            raise forms.ValidationError(
                'Для закрытой сделки необходимо указать цену выхода'
            )
        
        # Проверяем, что цены положительные
        if entry_price and entry_price <= 0:
            raise forms.ValidationError('Цена входа должна быть положительной')
        
        if exit_price and exit_price <= 0:
            raise forms.ValidationError('Цена выхода должна быть положительной')
        
        return cleaned_data


class TradeAnalysisForm(forms.ModelForm):
    """Форма для анализа сделки"""
    
    class Meta:
        model = TradeAnalysis
        fields = [
            'entry_reason', 'exit_reason', 'analysis', 'conclusions',
            'emotional_state', 'tags'
        ]
        widgets = {
            'entry_reason': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3,
                'placeholder': 'Опишите основание для входа в сделку...'
            }),
            'exit_reason': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3,
                'placeholder': 'Опишите основание для закрытия сделки...'
            }),
            'analysis': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 4,
                'placeholder': 'Проанализируйте свои действия и эмоции...'
            }),
            'conclusions': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3,
                'placeholder': 'Сформулируйте выводы на будущее...'
            }),
            'emotional_state': forms.Select(attrs={'class': 'form-select'}),
            'tags': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'ошибка, хорошая сделка, эмоции (через запятую)'
            })
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['entry_reason'].required = True
        self.fields['emotional_state'].empty_label = "Выберите эмоциональное состояние"
        
        # Добавляем help_text
        self.fields['tags'].help_text = "Введите теги через запятую для группировки сделок"
