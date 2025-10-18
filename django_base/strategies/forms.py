from django import forms
from .models import TradingStrategy


class TradingStrategyForm(forms.ModelForm):
    """Форма для создания и редактирования торговой стратегии"""
    
    class Meta:
        model = TradingStrategy
        fields = ['name', 'description', 'strategy_type', 'instruments', 'is_active']
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Название стратегии'
            }),
            'description': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 4,
                'placeholder': 'Описание стратегии, правила входа и выхода...'
            }),
            'strategy_type': forms.Select(attrs={'class': 'form-select'}),
            'instruments': forms.Select(attrs={'class': 'form-select'}),
            'is_active': forms.CheckboxInput(attrs={'class': 'form-check-input'})
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['name'].required = True
        self.fields['strategy_type'].required = True
        self.fields['instruments'].required = True
        
        # Добавляем help_text
        self.fields['description'].help_text = "Подробное описание стратегии поможет в анализе"
        self.fields['strategy_type'].help_text = "Выберите тип торговой стратегии"
        self.fields['instruments'].help_text = "Какие инструменты используются в стратегии"
        self.fields['is_active'].help_text = "Активные стратегии доступны при создании сделок"
    
    def clean_name(self):
        name = self.cleaned_data.get('name')
        if name and len(name.strip()) < 3:
            raise forms.ValidationError('Название стратегии должно содержать минимум 3 символа')
        return name.strip()
    
    def clean_description(self):
        description = self.cleaned_data.get('description')
        if description and len(description.strip()) < 10:
            raise forms.ValidationError('Описание стратегии должно содержать минимум 10 символов')
        return description.strip()
