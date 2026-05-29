from django.urls import path

from . import views

app_name = 'instruments'

urlpatterns = [
    path('', views.InstrumentListView.as_view(), name='instrument_list'),
    path('taxonomy/', views.TaxonomyView.as_view(), name='taxonomy'),
    path('stats/', views.InstrumentStatsView.as_view(), name='instrument_stats'),
    path('futures/<str:ticker>/candles/', views.CandleDataView.as_view(), name='futures_candle_data'),
    path('futures/<str:ticker>/', views.FuturesDetailView.as_view(), name='futures_detail'),
    path('<str:ticker>/candles/', views.CandleDataView.as_view(), name='candle_data'),
    path('<str:ticker>/sync-candles/', views.AdminCandleSyncView.as_view(), name='admin_candle_sync'),
    path('<str:ticker>/', views.InstrumentDetailView.as_view(), name='instrument_detail'),
]
