"""
URL configuration for django_base project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, re_path, include
from django.views.generic import RedirectView
from django.views.static import serve as static_serve

from core.views import AboutView, HelpView, IndexView

urlpatterns = [
    # Публичные SEO-страницы (Django-шаблоны)
    path('', IndexView.as_view(), name='index'),
    path('about/', AboutView.as_view(), name='about'),
    path('help/', HelpView.as_view(), name='help'),

    # REST API (единственная точка взаимодействия с SPA и мобильными клиентами)
    path('api/auth/', include('accounts.urls', namespace='accounts')),
    path('api/strategies/', include('strategies.urls', namespace='strategies')),
    path('api/instruments/', include('instruments.urls', namespace='instruments')),
    path('api/trades/', include('trades.urls', namespace='trades')),
    path('api/', include('core.urls', namespace='core')),
    path('favicon.ico', RedirectView.as_view(url=f'{settings.STATIC_URL}favicon.svg', permanent=True)),
    # Django admin-панель
    path('admin/', admin.site.urls),
]

if settings.DEBUG:
    from django.contrib.staticfiles.urls import staticfiles_urlpatterns
    urlpatterns += staticfiles_urlpatterns()
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )
else:
    # В prod static раздаёт WhiteNoise (см. settings.MIDDLEWARE/STORAGES),
    # а пользовательские медиа отдаём Django-вью static.serve: nginx-контейнера
    # больше нет, перед сервисом стоит только Traefik, который файлы не отдаёт.
    urlpatterns += [
        re_path(
            r'^media/(?P<path>.*)$',
            static_serve,
            {'document_root': settings.MEDIA_ROOT},
        ),
    ]
