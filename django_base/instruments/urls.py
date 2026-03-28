from django.urls import path
from . import views

app_name = 'instruments'

urlpatterns = [
    path('', views.InstrumentListView.as_view(), name='instrument_list'),
    path(
        'api/list/',
        views.InstrumentListFragmentView.as_view(),
        name='instrument_list_fragment',
    ),
    path('stats/', views.InstrumentStatsView.as_view(), name='instrument_stats'),
    path(
        'futures/<str:ticker>/',
        views.FuturesDetailView.as_view(),
        name='futures_detail',
    ),
    path('<str:ticker>/', views.InstrumentDetailView.as_view(), name='instrument_detail'),
]
