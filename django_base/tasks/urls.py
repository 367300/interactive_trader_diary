from django.urls import path
from . import views

app_name = 'tasks'

urlpatterns = [
    path('', views.task_form, name='task_form'),
    path('status/<uuid:task_id>/', views.task_status, name='task_status'),
]