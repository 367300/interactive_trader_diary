from django.urls import path
from . import views

app_name = 'strategies'

urlpatterns = [
    path('', views.TradingStrategyListView.as_view(), name='strategy_list'),
    path('create/', views.TradingStrategyCreateView.as_view(), name='strategy_create'),
    path('<int:pk>/', views.TradingStrategyDetailView.as_view(), name='strategy_detail'),
    path('<int:pk>/edit/', views.TradingStrategyUpdateView.as_view(), name='strategy_update'),
    path('<int:pk>/delete/', views.TradingStrategyDeleteView.as_view(), name='strategy_delete'),
]
