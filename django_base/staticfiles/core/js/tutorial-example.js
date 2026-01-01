/**
 * Пример использования библиотеки Tutorial.js
 * 
 * Этот файл демонстрирует, как использовать библиотеку для создания
 * интерактивных подсказок на странице.
 */

// Пример 1: Простое использование
function example1() {
    const tutorial = new Tutorial([
        {
            target: '#my-button',
            text: 'Это кнопка для выполнения действия',
            position: 'bottom'
        },
        {
            target: '#my-form',
            text: 'Здесь вы можете ввести данные',
            position: 'top'
        }
    ]);

    // Начинаем туториал
    tutorial.start();

    // Опционально: обработчик завершения
    tutorial.setOnComplete(() => {
        console.log('Туториал завершен!');
    });
}

// Пример 2: С изображениями
function example2() {
    const tutorial = new Tutorial([
        {
            target: '#dashboard',
            text: 'Это ваш главный дашборд',
            image: '/static/core/img/dashboard-help.jpg',
            position: 'bottom'
        },
        {
            target: '#settings',
            text: 'Здесь находятся настройки',
            image: '/static/core/img/settings-help.jpg',
            position: 'right'
        }
    ]);

    tutorial.start();
}

// Пример 3: С обработчиками событий
function example3() {
    const tutorial = new Tutorial([
        {
            target: '#step1',
            text: 'Первый шаг обучения',
            position: 'auto'
        },
        {
            target: '#step2',
            text: 'Второй шаг обучения',
            position: 'auto'
        },
        {
            target: '#step3',
            text: 'Третий шаг обучения',
            position: 'auto'
        }
    ]);

    // Обработчик изменения шага
    tutorial.setOnStepChange((stepIndex, step) => {
        console.log(`Текущий шаг: ${stepIndex + 1}`);
        // Можно добавить аналитику или другие действия
    });

    // Обработчик завершения
    tutorial.setOnComplete(() => {
        alert('Обучение завершено!');
    });

    tutorial.start();
}

// Пример 4: Программное управление
function example4() {
    const tutorial = new Tutorial([
        {
            target: '#element1',
            text: 'Элемент 1'
        },
        {
            target: '#element2',
            text: 'Элемент 2'
        },
        {
            target: '#element3',
            text: 'Элемент 3'
        }
    ]);

    // Начинаем туториал
    tutorial.start();

    // Переход к следующему шагу программно
    // tutorial.next();

    // Переход к предыдущему шагу
    // tutorial.prev();

    // Переход к конкретному шагу
    // tutorial.goToStep(1);

    // Остановка туториала
    // tutorial.stop();

    // Уничтожение туториала (удаление из DOM)
    // tutorial.destroy();
}

// Пример использования в Django шаблоне:
/*
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="{% static 'core/css/tutorial.css' %}">
</head>
<body>
    <button id="start-tutorial">Начать обучение</button>
    <button id="my-button">Кнопка</button>
    <form id="my-form">Форма</form>

    <script src="{% static 'core/js/tutorial.js' %}"></script>
    <script>
        document.getElementById('start-tutorial').addEventListener('click', function() {
            const tutorial = new Tutorial([
                {
                    target: '#my-button',
                    text: 'Это кнопка для выполнения действия',
                    position: 'bottom'
                },
                {
                    target: '#my-form',
                    text: 'Здесь вы можете ввести данные',
                    position: 'top'
                }
            ]);
            tutorial.start();
        });
    </script>
</body>
</html>
*/

