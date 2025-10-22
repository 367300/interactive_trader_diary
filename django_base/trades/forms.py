from django import forms
from django.contrib.auth.models import User
from .models import Trade, TradeAnalysis, TradeScreenshot
from strategies.models import TradingStrategy
from instruments.models import Instrument


class TradeForm(forms.ModelForm):
    """Форма для создания и редактирования сделки"""
    
    # Поля для анализа сделки
    analysis = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 4,
            'placeholder': 'Опишите основание для сделки...'
        }),
        label='Основание для сделки'
    )
    
    conclusions = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 3,
            'placeholder': 'Сформулируйте выводы на будущее...'
        }),
        label='Выводы на будущее'
    )
    
    emotional_state = forms.ChoiceField(
        required=False,
        choices=TradeAnalysis.EmotionalState.choices,
        widget=forms.Select(attrs={'class': 'form-select'}),
        label='Эмоциональное состояние'
    )
    
    tags = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'ошибка, хорошая сделка, эмоции (через запятую)'
        }),
        label='Теги',
        help_text='Введите теги через запятую для группировки сделок'
    )
    
    # Поля для скриншотов
    screenshots = forms.FileField(
        required=False,
        widget=forms.FileInput(attrs={
            'class': 'form-control',
            'accept': 'image/*'
        }),
        label='Скриншоты сделки'
    )
    
    
    class Meta:
        model = Trade
        fields = [
            'strategy', 'instrument', 'trade_date', 'direction', 'trade_type',
            'price', 'commission', 'planned_stop_loss', 'planned_take_profit'
        ]
        widgets = {
            'trade_date': forms.DateTimeInput(attrs={
                'type': 'datetime-local',
                'class': 'form-control',
                'step': '1'
            }),
            'direction': forms.Select(attrs={'class': 'form-select'}),
            'trade_type': forms.Select(attrs={'class': 'form-select'}),
            'strategy': forms.Select(attrs={'class': 'form-select'}),
            'instrument': forms.Select(attrs={'class': 'form-select'}),
            'price': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'placeholder': '0.00'
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
            })
        }
    
    def __init__(self, user=None, parent_trade=None, *args, **kwargs):
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
        self.fields['price'].required = True
        
        # Если это дочерняя сделка, копируем данные из родительской
        if parent_trade:
            self.fields['instrument'].initial = parent_trade.instrument
            self.fields['strategy'].initial = parent_trade.strategy
            self.fields['direction'].initial = parent_trade.direction
            # Делаем поля только для чтения
            self.fields['instrument'].widget.attrs['readonly'] = True
            self.fields['strategy'].widget.attrs['readonly'] = True
            self.fields['direction'].widget.attrs['readonly'] = True
        
        # Настройка полей анализа
        self.fields['emotional_state'].empty_label = "Выберите эмоциональное состояние"
        
        # Добавляем help_text
        self.fields['commission'].help_text = "Комиссия брокера в рублях (необязательно)"
        self.fields['planned_stop_loss'].help_text = "Плановый стоп-лосс (цена)"
        self.fields['planned_take_profit'].help_text = "Плановый тейк-профит (цена)"
        
        # Настройка поля даты только для новых сделок
        if not (self.instance and self.instance.pk):
            # Только при создании новой сделки устанавливаем текущую дату
            from django.utils import timezone
            now = timezone.now()
            formatted_date = now.strftime('%Y-%m-%dT%H:%M')
            self.fields['trade_date'].widget.attrs['value'] = formatted_date
    
    def clean(self):
        cleaned_data = super().clean()
        price = cleaned_data.get('price')
        
        # Проверяем, что цена положительная
        if price and price <= 0:
            raise forms.ValidationError('Цена должна быть положительной')
        
        # Обработка тегов
        tags = cleaned_data.get('tags')
        if tags:
            # Разделяем теги по запятым и очищаем от пробелов
            tag_list = [tag.strip() for tag in tags.split(',') if tag.strip()]
            cleaned_data['tags'] = tag_list
        
        return cleaned_data


class TradeAnalysisForm(forms.ModelForm):
    """Форма для анализа сделки"""
    
    class Meta:
        model = TradeAnalysis
        fields = [
            'analysis', 'conclusions',
            'emotional_state', 'tags'
        ]
        widgets = {
            'analysis': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 4,
                'placeholder': 'Опишите основание для сделки...'
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
        self.fields['emotional_state'].empty_label = "Выберите эмоциональное состояние"
        
        # Добавляем help_text
        self.fields['tags'].help_text = "Введите теги через запятую для группировки сделок"
