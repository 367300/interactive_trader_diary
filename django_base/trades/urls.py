from django.urls import path
from . import views

app_name = 'trades'

urlpatterns = [
    path('', views.TradeListView.as_view(), name='trade_list'),
    path('create/', views.TradeCreateView.as_view(), name='trade_create'),
    path('<uuid:pk>/', views.TradeDetailView.as_view(), name='trade_detail'),
    path('<uuid:pk>/edit/', views.TradeUpdateView.as_view(), name='trade_update'),
    path('<uuid:pk>/delete/', views.TradeDeleteView.as_view(), name='trade_delete'),
    path('<uuid:parent_id>/average/', views.TradeAverageView.as_view(), name='trade_average'),
    path('<uuid:parent_id>/close/', views.TradeCloseView.as_view(), name='trade_close'),
    path('analytics/', views.TradeAnalyticsView.as_view(), name='analytics'),
]
