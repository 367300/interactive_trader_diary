from django.shortcuts import render, redirect, get_object_or_404
from .models import TaskStatus
from .tasks import long_task

def task_form(request):
    if request.method == 'POST':
        action = request.POST.get('action')
        # Создаём объект статуса задачи
        task_status = TaskStatus.objects.create()  # type: ignore
        if action == 'sync':
            # Синхронное выполнение
            long_task(str(task_status.id))
            return redirect('tasks:task_status', task_id=task_status.id)
        elif action == 'async':
            # Асинхронное выполнение через Celery
            long_task.delay(str(task_status.id))
            return redirect('tasks:task_status', task_id=task_status.id)
    return render(request, 'tasks/task_form.html')

def task_status(request, task_id):
    task = get_object_or_404(TaskStatus, id=task_id)  # type: ignore
    return render(request, 'tasks/task_status.html', {'task': task})
