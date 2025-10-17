import json
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async

class TaskStatusConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.task_id = self.scope['url_route']['kwargs']['task_id']
        self.group_name = f'task_{self.task_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        # Отправить начальный статус
        status, result = await self.get_status()
        await self.send(json.dumps({'status': status, 'result': result}))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        pass  # Клиент ничего не отправляет

    async def task_status_update(self, event):
        await self.send(json.dumps({
            'status': event['status'],
            'result': event.get('result', None)
        }))

    @sync_to_async
    def get_status(self):
        try:
            from .models import TaskStatus
            task = TaskStatus.objects.get(id=self.task_id)
            return task.status, task.result
        except TaskStatus.DoesNotExist:
            return 'NOT_FOUND', None 