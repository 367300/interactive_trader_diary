from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = 'strategies'

router = DefaultRouter()
router.register('', views.TradingStrategyViewSet, basename='strategy')

urlpatterns = [
    path('choices/', views.StrategyChoicesView.as_view(), name='choices'),
    path('', include(router.urls)),
]
