from django.urls import path

from . import views

app_name = 'core'

urlpatterns = [
    path('dashboard/', views.DashboardView.as_view(), name='dashboard'),
    path(
        'admin/instruments/load/',
        views.AdminInstrumentsLoadView.as_view(),
        name='admin_instruments_load',
    ),
]
