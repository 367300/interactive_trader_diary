// Основной JavaScript для дневника трейдера

document.addEventListener('DOMContentLoaded', function() {
    // Инициализация компонентов
    initSidebar();
    initTooltips();
    initAlerts();
    initForms();
});

// Инициализация сайдбара для мобильных устройств
function initSidebar() {
    const sidebarToggle = document.querySelector('[data-bs-target="#navbarNav"]');
    const sidebar = document.querySelector('.sidebar-wrapper');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            if (window.innerWidth < 992) {
                sidebar.classList.toggle('show');
            }
        });
        
        // Закрытие сайдбара при клике вне его
        document.addEventListener('click', function(e) {
            if (window.innerWidth < 992 && 
                !sidebar.contains(e.target) && 
                !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        });
    }
}

// Инициализация тултипов Bootstrap
function initTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// Автоматическое скрытие алертов
function initAlerts() {
    const alerts = document.querySelectorAll('.alert:not(.alert-info):not([id*="parentTradeInfo"])');
    alerts.forEach(function(alert) {
        // Проверяем, что это не информационный блок о родительской сделке
        if (!alert.id.includes('parentTradeInfo') && 
            !alert.querySelector('.alert-heading')?.textContent.includes('родительской сделке') &&
            !alert.querySelector('.alert-heading')?.textContent.includes('Усреднение позиции') &&
            !alert.querySelector('.alert-heading')?.textContent.includes('Закрытие позиции')) {
        }
    });
}

// Инициализация форм
function initForms() {
    // Автофокус на первое поле формы
    const forms = document.querySelectorAll('form');
    forms.forEach(function(form) {
        const firstInput = form.querySelector('input[type="text"], input[type="email"], input[type="password"], select, textarea');
        if (firstInput) {
            firstInput.focus();
        }
    });
    
    // Валидация форм
    const formsToValidate = document.querySelectorAll('.needs-validation');
    formsToValidate.forEach(function(form) {
        form.addEventListener('submit', function(event) {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        });
    });
}

// Утилиты для работы с числами
function formatCurrency(amount, currency = 'RUB') {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
    }).format(amount);
}

function formatNumber(number, decimals = 2) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(number);
}

// Утилиты для работы с датами
function formatDate(date, options = {}) {
    const defaultOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    return new Intl.DateTimeFormat('ru-RU', { ...defaultOptions, ...options }).format(new Date(date));
}

function formatDateTime(date) {
    return formatDate(date, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// AJAX утилиты
function makeAjaxRequest(url, options = {}) {
    const defaultOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        }
    };
    
    return fetch(url, { ...defaultOptions, ...options })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .catch(error => {
            console.error('AJAX request failed:', error);
            showNotification('Ошибка при выполнении запроса', 'danger');
        });
}

// Получение CSRF токена
function getCSRFToken() {
    return document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
}

// Показ уведомлений
function showNotification(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.querySelector('.container-fluid');
    if (container) {
        container.insertBefore(alertDiv, container.firstChild);
        
        // Автоматическое скрытие через 5 секунд
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alertDiv);
            bsAlert.close();
        }, 5000);
    }
}

// Подтверждение удаления
function confirmDelete(message = 'Вы уверены, что хотите удалить этот элемент?') {
    return confirm(message);
}

// Анимация загрузки
function showLoading(element) {
    if (element) {
        element.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status"></span>
            Загрузка...
        `;
        element.disabled = true;
    }
}

function hideLoading(element, originalText) {
    if (element) {
        element.innerHTML = originalText;
        element.disabled = false;
    }
}

// Экспорт функций для использования в других скриптах
window.TraderDiary = {
    formatCurrency,
    formatNumber,
    formatDate,
    formatDateTime,
    makeAjaxRequest,
    showNotification,
    confirmDelete,
    showLoading,
    hideLoading
};
