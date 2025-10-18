from django.urls import path
from . import views

app_name = 'instruments'

urlpatterns = [
    path('', views.InstrumentListView.as_view(), name='instrument_list'),
    path('stats/', views.InstrumentStatsView.as_view(), name='instrument_stats'),
]
