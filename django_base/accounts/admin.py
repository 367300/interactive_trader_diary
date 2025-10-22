from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import TraderProfile


class TraderProfileInline(admin.StackedInline):
    model = TraderProfile
    can_delete = False
    verbose_name_plural = 'Профиль трейдера'


class UserAdmin(BaseUserAdmin):
    inlines = (TraderProfileInline,)


# Перерегистрируем UserAdmin
admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(TraderProfile)
class TraderProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('user',)
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )