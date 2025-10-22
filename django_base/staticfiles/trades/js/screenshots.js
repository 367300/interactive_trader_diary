/**
 * JavaScript для работы со скриншотами
 * Анимации модальных окон, эффекты наведения, drag & drop
 */

class ScreenshotManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupThumbnailEffects();
        this.setupModalAnimations();
        this.setupCardEffects();
    }

    /**
     * Настройка эффектов для миниатюр скриншотов
     */
    setupThumbnailEffects() {
        const thumbnails = document.querySelectorAll('.screenshot-thumbnail');
        
        thumbnails.forEach(thumbnail => {
            // Эффект при клике
            thumbnail.addEventListener('click', (e) => {
                // Плавное уменьшение при клике
                e.target.style.transform = 'scale(0.95)';
                e.target.style.transition = 'transform 0.15s ease';
                
                setTimeout(() => {
                    e.target.style.transform = 'scale(1)';
                }, 150);
            });

            // Эффект при наведении
            thumbnail.addEventListener('mouseenter', () => {
                thumbnail.style.transform = 'scale(1.05)';
                thumbnail.style.transition = 'transform 0.3s ease';
            });

            thumbnail.addEventListener('mouseleave', () => {
                thumbnail.style.transform = 'scale(1)';
            });
        });
    }

    /**
     * Настройка анимаций модальных окон
     */
    setupModalAnimations() {
        const modals = document.querySelectorAll('.modal');
        
        modals.forEach(modal => {
            // Анимация открытия
            modal.addEventListener('show.bs.modal', (e) => {
                const modalBody = e.target.querySelector('.modal-body');
                if (modalBody) {
                    // Начальное состояние
                    modalBody.style.opacity = '0';
                    modalBody.style.transform = 'scale(0.8) translateY(20px)';
                    modalBody.style.transition = 'none';
                    
                    // Анимация появления
                    setTimeout(() => {
                        modalBody.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                        modalBody.style.opacity = '1';
                        modalBody.style.transform = 'scale(1) translateY(0)';
                    }, 50);
                }
            });

            // Анимация закрытия
            modal.addEventListener('hide.bs.modal', (e) => {
                const modalBody = e.target.querySelector('.modal-body');
                if (modalBody) {
                    modalBody.style.transition = 'all 0.3s ease';
                    modalBody.style.opacity = '0';
                    modalBody.style.transform = 'scale(0.8) translateY(20px)';
                }
            });

            // Анимация фона
            modal.addEventListener('show.bs.modal', (e) => {
                const backdrop = e.target.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.style.opacity = '0';
                    backdrop.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => {
                        backdrop.style.opacity = '0.5';
                    }, 10);
                }
            });
        });
    }

    /**
     * Настройка эффектов для карточек скриншотов
     */
    setupCardEffects() {
        const cards = document.querySelectorAll('.screenshot-card');
        
        cards.forEach(card => {
            // Эффект при наведении на карточку
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-8px)';
                card.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
                card.style.transition = 'all 0.3s ease';
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            });
        });
    }

    /**
     * Плавное появление элементов
     */
    fadeInElements() {
        const elements = document.querySelectorAll('.screenshot-card, .screenshot-thumbnail');
        
        elements.forEach((element, index) => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                element.style.transition = 'all 0.5s ease';
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    new ScreenshotManager();
    
    // Инициализируем скрытые поля для существующих скриншотов
    initializeExistingScreenshots();
});

/**
 * Функция для управления всеми аккордеонами
 */
function toggleAllAccordions() {
    const accordion = document.getElementById('childTradesAccordion');
    const expandBtn = document.getElementById('expandAllBtn');
    const collapseBtn = document.getElementById('collapseAllBtn');
    
    if (!accordion) return;
    
    const accordionItems = accordion.querySelectorAll('.accordion-collapse');
    const isExpanded = expandBtn.style.display === 'none';
    
    if (isExpanded) {
        // Сворачиваем все
        accordionItems.forEach(item => {
            const bsCollapse = new bootstrap.Collapse(item, { toggle: false });
            bsCollapse.hide();
        });
        
        expandBtn.style.display = 'inline-block';
        collapseBtn.style.display = 'none';
    } else {
        // Разворачиваем все
        accordionItems.forEach(item => {
            const bsCollapse = new bootstrap.Collapse(item, { toggle: false });
            bsCollapse.show();
        });
        
        expandBtn.style.display = 'none';
        collapseBtn.style.display = 'inline-block';
    }
}

// Дополнительные эффекты для кнопок
document.addEventListener('DOMContentLoaded', function() {
    // Эффект для кнопок "Открыть в новой вкладке"
    const openButtons = document.querySelectorAll('a[target="_blank"]');
    
    openButtons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.05)';
            this.style.transition = 'transform 0.2s ease';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
        });
    });

    // Эффект для кнопок удаления
    const deleteButtons = document.querySelectorAll('.btn-outline-danger');
    
    deleteButtons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.05)';
            this.style.transition = 'transform 0.2s ease';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
        });
    });
});

/**
 * Функция для сохранения описания скриншота
 */
function saveScreenshotDescription(screenshotId) {
    const descriptionField = document.getElementById(`screenshotDescription${screenshotId}`);
    const saveButton = document.getElementById(`saveBtn${screenshotId}`);
    
    if (!descriptionField || !saveButton) {
        console.error('Элементы для сохранения не найдены');
        return;
    }
    
    const description = descriptionField.value.trim();
    
    // Создаем или обновляем скрытые поля в форме
    updateHiddenFields(screenshotId, description);
    
    // Показываем индикатор загрузки
    const originalText = saveButton.innerHTML;
    saveButton.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Сохранение...';
    saveButton.disabled = true;
    
    // Показываем успех
    setTimeout(() => {
        saveButton.innerHTML = '<i class="bi bi-check-lg me-1"></i>Сохранено!';
        saveButton.classList.remove('btn-success');
        saveButton.classList.add('btn-outline-success');
        
        // Обновляем заголовок модального окна
        const modalTitle = document.getElementById(`screenshotModalLabel${screenshotId}`);
        if (modalTitle) {
            if (description) {
                modalTitle.innerHTML = `<i class="bi bi-image me-2"></i>${description}`;
            } else {
                modalTitle.innerHTML = `<i class="bi bi-image me-2"></i>Скриншот от ${new Date().toLocaleDateString('ru-RU')}`;
            }
        }
        
        // Возвращаем кнопку в исходное состояние через 2 секунды
        setTimeout(() => {
            saveButton.innerHTML = originalText;
            saveButton.classList.remove('btn-outline-success');
            saveButton.classList.add('btn-success');
            saveButton.disabled = false;
        }, 2000);
    }, 500);
}

/**
 * Функция для обновления скрытых полей в форме
 */
function updateHiddenFields(screenshotId, description) {
    const container = document.getElementById('screenshot-hidden-fields');
    if (!container) {
        console.error('Контейнер для скрытых полей не найден');
        return;
    }
    
    
    // Ищем существующее поле описания для этого скриншота
    const existingDescField = container.querySelector(`input[name="screenshot_descriptions"][data-screenshot-id="${screenshotId}"]`);
    
    if (existingDescField) {
        // Обновляем существующее поле
        existingDescField.value = description;
    } else {
        // Создаем новые поля (для существующих скриншотов)
        const idField = document.createElement('input');
        idField.type = 'hidden';
        idField.name = 'screenshot_id';
        idField.value = screenshotId;
        
        const descField = document.createElement('input');
        descField.type = 'hidden';
        descField.name = 'screenshot_descriptions';
        descField.value = description;
        descField.setAttribute('data-screenshot-id', screenshotId);
        
        container.appendChild(idField);
        container.appendChild(descField);
        
    }
    
}

/**
 * Инициализация скрытых полей для существующих скриншотов
 */
function initializeExistingScreenshots() {
    // Находим все поля описания скриншотов
    const descriptionFields = document.querySelectorAll('.screenshot-description-field');
    
    descriptionFields.forEach(field => {
        const screenshotId = field.getAttribute('data-screenshot-id');
        const description = field.value;
        
        if (screenshotId) {
            updateHiddenFields(screenshotId, description);
        }
    });
}
