from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = 'trades'

router = DefaultRouter()
router.register('', views.TradeViewSet, basename='trade')

urlpatterns = [
    path('analytics/', views.TradeAnalyticsView.as_view(), name='analytics'),
    path('chart/', views.TradesChartView.as_view(), name='chart'),
    path(
        '<uuid:trade_id>/screenshots/',
        views.TradeScreenshotViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='screenshots',
    ),
    path(
        '<uuid:trade_id>/screenshots/<int:pk>/',
        views.TradeScreenshotViewSet.as_view(
            {'get': 'retrieve', 'patch': 'partial_update', 'delete': 'destroy'}
        ),
        name='screenshot_detail',
    ),
    path('', include(router.urls)),
]
