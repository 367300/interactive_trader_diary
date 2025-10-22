/**
 * JavaScript для форм сделок
 * Обработка drag & drop, валидации, превью изображений
 */

class TradeFormManager {
    constructor() {
        this.uploadedFiles = [];
        this.init();
    }

    init() {
        this.setupDateField();
        this.setupFormValidation();
        this.setupDragDrop();
        this.setupPasteHandler();
        this.setupFileInput();
        this.setupParentTradeInfo();
    }

    /**
     * Настройка поля даты
     */
    setupDateField() {
        const tradeDateField = document.getElementById('id_trade_date');
        if (tradeDateField) {
            // Проверяем, находимся ли мы на странице редактирования
            const isEditPage = window.location.pathname.includes('/edit/');
            
                     if (isEditPage) {
                         // На странице редактирования устанавливаем правильное значение из Django
                         const djangoDate = tradeDateField.getAttribute('data-django-date');
                         if (djangoDate) {
                             // Конвертируем дату из Django в формат для datetime-local
                             const date = new Date(djangoDate);
                             // Используем локальное время без смещения
                             const year = date.getFullYear();
                             const month = String(date.getMonth() + 1).padStart(2, '0');
                             const day = String(date.getDate()).padStart(2, '0');
                             const hours = String(date.getHours()).padStart(2, '0');
                             const minutes = String(date.getMinutes()).padStart(2, '0');
                             
                             tradeDateField.value = `${year}-${month}-${day}T${hours}:${minutes}`;
                         }
                         return;
                     }
            
            // Только для новых сделок устанавливаем текущую дату, если поле пустое
            if (!tradeDateField.value) {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                tradeDateField.value = now.toISOString().slice(0, 16);
            }
        }
    }

    /**
     * Настройка валидации формы
     */
    setupFormValidation() {
        const form = document.querySelector('.needs-validation');
        if (form) {
            form.addEventListener('submit', (event) => {
                if (!form.checkValidity()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                form.classList.add('was-validated');
            });
        }
    }

    /**
     * Настройка drag & drop области
     */
    setupDragDrop() {
        const dragDropArea = document.getElementById('dragDropArea');
        if (!dragDropArea) return;

        dragDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dragDropArea.classList.add('dragover');
        });

        dragDropArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragDropArea.classList.remove('dragover');
        });

        dragDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dragDropArea.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        dragDropArea.addEventListener('click', () => {
            document.getElementById('id_screenshots').click();
        });
    }

    /**
     * Настройка обработки вставки из буфера обмена
     */
    setupPasteHandler() {
        document.addEventListener('paste', (e) => {
            const items = e.clipboardData.items;
            const files = [];
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    files.push(file);
                }
            }
            
            if (files.length > 0) {
                this.handleFiles(files);
            }
        });
    }

    /**
     * Настройка обработки выбора файлов
     */
    setupFileInput() {
        const fileInput = document.getElementById('id_screenshots');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFiles(e.target.files);
            });
            
            // Добавляем атрибут multiple к input
            fileInput.setAttribute('multiple', 'multiple');
        }
    }

    /**
     * Настройка информации о родительской сделке
     */
    setupParentTradeInfo() {
        const parentTradeInfo = document.getElementById('parentTradeInfo');
        if (parentTradeInfo) {
            // Добавляем стиль, чтобы информация была более заметной
            parentTradeInfo.style.border = '2px solid #0d6efd';
            parentTradeInfo.style.backgroundColor = '#e7f3ff';
        }
    }

    /**
     * Обработка загруженных файлов
     */
    handleFiles(files) {
        Array.from(files).forEach((file) => {
            if (file.type.startsWith('image/')) {
                this.uploadedFiles.push(file);
                this.createImagePreview(file);
                
                // Создаем скрытые поля для новых скриншотов
                this.createHiddenFieldsForNewScreenshot();
            }
        });
        
        // Обновляем поле файла
        this.updateFileInput();
    }

    /**
     * Создание превью изображения
     */
    createImagePreview(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('imagePreview');
            const col = document.createElement('div');
            col.className = 'col-md-3 mb-3';
            
            // Получаем индекс текущего скриншота
            const index = this.uploadedFiles.length - 1;
            
            // Создаем уникальный ID для этого превью
            const previewId = `preview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            col.innerHTML = `
                <div class="image-preview" id="${previewId}">
                    <img src="${e.target.result}" alt="Preview" class="img-fluid" style="cursor: pointer;" onclick="openNewScreenshotModal('${previewId}')">
                    <button type="button" class="remove-image" onclick="removeImagePreview(this)">
                        <i class="bi bi-x"></i>
                    </button>
                    <div class="mt-2">
                        <label class="form-label small">Описание скриншота:</label>
                        <textarea class="form-control form-control-sm screenshot-description-new" 
                                  rows="2" 
                                  placeholder="Введите описание..."
                                  data-preview-id="${previewId}"
                                  data-screenshot-index="${index}"
                                  oninput="updateScreenshotDescriptionByIndex(this.value, ${index})"></textarea>
                    </div>
                </div>
            `;
            
            preview.appendChild(col);
        };
        reader.readAsDataURL(file);
    }

    /**
     * Удаление превью изображения
     */
    removeImagePreview(button) {
        const preview = button.closest('.image-preview');
        const col = preview.closest('.col-md-3');
        col.remove();
        
        // Удаляем файл из массива
        const index = Array.from(document.querySelectorAll('.image-preview')).indexOf(preview);
        if (index > -1) {
            this.uploadedFiles.splice(index, 1);
        }
        
        // Обновляем поле файла
        this.updateFileInput();
    }
    
    /**
     * Обновление поля файла
     */
    updateFileInput() {
        const fileInput = document.getElementById('id_screenshots');
        if (!fileInput) {
            return;
        }
        
        // Создаем новый DataTransfer объект
        const dataTransfer = new DataTransfer();
        
        // Добавляем все файлы из массива uploadedFiles
        this.uploadedFiles.forEach(file => {
            dataTransfer.items.add(file);
        });
        
        // Устанавливаем файлы в input
        fileInput.files = dataTransfer.files;
    }
    
    /**
     * Создание скрытых полей для новых скриншотов
     */
    createHiddenFieldsForNewScreenshot() {
        const container = document.getElementById('screenshot-hidden-fields');
        if (!container) {
            return;
        }
        
        // Используем длину массива uploadedFiles как индекс
        const index = this.uploadedFiles.length - 1;
        
        // Создаем уникальный ID для нового скриншота
        const newScreenshotId = `new_${Date.now()}_${index}`;
        
        // Создаем скрытые поля
        const idField = document.createElement('input');
        idField.type = 'hidden';
        idField.name = 'screenshot_id';
        idField.value = newScreenshotId;
        idField.setAttribute('data-new-screenshot', 'true');
        idField.setAttribute('data-index', index);
        
        const descField = document.createElement('input');
        descField.type = 'hidden';
        descField.name = 'screenshot_descriptions';
        descField.value = '';
        descField.setAttribute('data-screenshot-id', newScreenshotId);
        descField.setAttribute('data-new-screenshot', 'true');
        descField.setAttribute('data-index', index);
        
        container.appendChild(idField);
        container.appendChild(descField);
    }
    
    /**
     * Обновление описания нового скриншота
     */
    updateNewScreenshotDescription(previewId, description) {
        // Находим соответствующие скрытые поля
        const container = document.getElementById('screenshot-hidden-fields');
        if (!container) {
            return;
        }
        
        // Ищем все поля описания для новых скриншотов
        const descFields = container.querySelectorAll('input[data-new-screenshot="true"][name="screenshot_descriptions"]');
        
        // Обновляем первое найденное поле
        if (descFields.length > 0) {
            descFields[0].value = description;
        }
    }

    /**
     * Удаление существующего скриншота
     */
    deleteExistingScreenshot(screenshotId) {
        if (confirm('Вы уверены, что хотите удалить этот скриншот?')) {
            // Создаем скрытое поле для удаления
            const form = document.querySelector('form');
            const deleteInput = document.createElement('input');
            deleteInput.type = 'hidden';
            deleteInput.name = 'delete_screenshots';
            deleteInput.value = screenshotId;
            form.appendChild(deleteInput);
            
            // Удаляем элемент из DOM
            const screenshotElement = document.querySelector(`button[onclick="deleteExistingScreenshot(${screenshotId})"]`).closest('.col-md-3');
            screenshotElement.remove();
        }
    }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    new TradeFormManager();
});

// Глобальная функция для обновления описания нового скриншота
window.updateNewScreenshotDescription = function(previewId, description) {
    const container = document.getElementById('screenshot-hidden-fields');
    if (!container) {
        return;
    }
    
    const descFields = container.querySelectorAll('input[data-new-screenshot="true"][name="screenshot_descriptions"]');
    
    descFields.forEach((field) => {
        field.value = description;
    });
};

// Функция для обновления описания по индексу
window.updateScreenshotDescriptionByIndex = function(description, index) {
    const container = document.getElementById('screenshot-hidden-fields');
    if (!container) {
        return;
    }
    
    // Находим поле описания с нужным индексом
    const descField = container.querySelector(`input[data-new-screenshot="true"][name="screenshot_descriptions"][data-index="${index}"]`);
    
    if (descField) {
        descField.value = description;
    }
};

// Альтернативная функция для обновления описания
window.updateScreenshotDescription = function(description) {
    const container = document.getElementById('screenshot-hidden-fields');
    if (!container) {
        return;
    }
    
    // Находим все поля описания для новых скриншотов
    const newDescFields = container.querySelectorAll('input[data-new-screenshot="true"][name="screenshot_descriptions"]');
    
    // Обновляем только последнее поле (для текущего скриншота)
    if (newDescFields.length > 0) {
        newDescFields[newDescFields.length - 1].value = description;
    }
};

// Функция для открытия модального окна нового скриншота
window.openNewScreenshotModal = function(previewId) {
    // Находим изображение по ID
    const previewElement = document.getElementById(previewId);
    if (!previewElement) {
        return;
    }
    
    const img = previewElement.querySelector('img');
    if (!img) {
        return;
    }
    
    // Создаем модальное окно для нового скриншота
    const modalId = `newScreenshotModal_${previewId}`;
    
    // Проверяем, существует ли уже модальное окно
    let modal = document.getElementById(modalId);
    if (!modal) {
        // Создаем модальное окно
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = modalId;
        modal.setAttribute('tabindex', '-1');
        modal.setAttribute('aria-labelledby', `${modalId}Label`);
        modal.setAttribute('aria-hidden', 'true');
        
        modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="${modalId}Label">
                            <i class="bi bi-image me-2"></i>Просмотр скриншота
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-center mb-3">
                            <img src="${img.src}" class="img-fluid" style="max-height: 70vh; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                        </div>
                        <div class="row">
                            <div class="col-12">
                                <label class="form-label">
                                    <i class="bi bi-pencil me-2"></i>Описание скриншота
                                </label>
                                <textarea class="form-control screenshot-description-new" 
                                          rows="3" 
                                          placeholder="Введите описание для этого скриншота..."
                                          data-preview-id="${previewId}">${previewElement.querySelector('.screenshot-description-new')?.value || ''}</textarea>
                                <div class="form-text">
                                    <i class="bi bi-info-circle me-1"></i>
                                    Описание поможет вам лучше запомнить детали этого скриншота
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <div class="d-flex justify-content-between align-items-center w-100">
                            <small class="text-muted">
                                Новый скриншот
                            </small>
                            <div class="btn-group">
                                <button type="button" 
                                        class="btn btn-success btn-sm" 
                                        onclick="saveNewScreenshotDescription('${previewId}')">
                                    <i class="bi bi-check-lg me-1"></i>Сохранить
                                </button>
                                <a href="${img.src}" target="_blank" class="btn btn-outline-primary btn-sm">
                                    <i class="bi bi-box-arrow-up-right me-1"></i>Открыть в новой вкладке
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    // Показываем модальное окно
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
};

// Функция для сохранения описания нового скриншота
window.saveNewScreenshotDescription = function(previewId) {
    const modal = document.getElementById(`newScreenshotModal_${previewId}`);
    if (!modal) {
        return;
    }
    
    const textarea = modal.querySelector('.screenshot-description-new');
    const description = textarea.value.trim();
    
    // Обновляем описание в превью
    const previewElement = document.getElementById(previewId);
    if (previewElement) {
        const previewTextarea = previewElement.querySelector('.screenshot-description-new');
        if (previewTextarea) {
            previewTextarea.value = description;
        }
    }
    
    // Обновляем скрытые поля
    updateScreenshotDescription(description);
    
    // Показываем уведомление о сохранении
    const saveButton = modal.querySelector('button[onclick*="saveNewScreenshotDescription"]');
    const originalText = saveButton.innerHTML;
    saveButton.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Сохранение...';
    saveButton.disabled = true;
    
    setTimeout(() => {
        saveButton.innerHTML = '<i class="bi bi-check-lg me-1"></i>Сохранено!';
        saveButton.classList.remove('btn-success');
        saveButton.classList.add('btn-outline-success');
        
        setTimeout(() => {
            saveButton.innerHTML = originalText;
            saveButton.classList.remove('btn-outline-success');
            saveButton.classList.add('btn-success');
            saveButton.disabled = false;
        }, 2000);
    }, 500);
};

// Глобальные функции для совместимости
window.removeImagePreview = function(button) {
    const preview = button.closest('.image-preview');
    const col = preview.closest('.col-md-3');
    col.remove();
};

window.deleteExistingScreenshot = function(screenshotId) {
    if (confirm('Вы уверены, что хотите удалить этот скриншот?')) {
        // Создаем скрытое поле для удаления
        const form = document.querySelector('form');
        const deleteInput = document.createElement('input');
        deleteInput.type = 'hidden';
        deleteInput.name = 'delete_screenshots';
        deleteInput.value = screenshotId;
        form.appendChild(deleteInput);
        
        // Удаляем элемент из DOM
        const screenshotElement = document.querySelector(`button[onclick="deleteExistingScreenshot(${screenshotId})"]`).closest('.col-md-3');
        screenshotElement.remove();
    }
};

// Функции для кнопок закрытия по тейку/стопу
window.toggleCloseByTakeProfit = function() {
    const priceField = document.getElementById('id_price');
    const takeProfitField = document.getElementById('id_planned_take_profit');
    const btn = document.getElementById('closeByTakeProfitBtn');
    const stopLossBtn = document.getElementById('closeByStopLossBtn');
    
    if (btn.classList.contains('btn-success')) {
        // Отменяем выбор
        btn.classList.remove('btn-success');
        btn.classList.add('btn-outline-success');
        btn.innerHTML = '<i class="bi bi-check-circle me-2"></i>Закрыта по тейку';
        priceField.disabled = false;
        priceField.value = '';
        // Показываем весь блок с полем
        const priceFieldContainer = priceField.closest('.form-floating');
        if (priceFieldContainer) {
            priceFieldContainer.style.display = 'block';
        }
        
        // Удаляем скрытое поле
        removeHiddenPriceField();
    } else {
        // Выбираем тейк-профит
        btn.classList.remove('btn-outline-success');
        btn.classList.add('btn-success');
        btn.innerHTML = '<i class="bi bi-check-circle-fill me-2"></i>Закрыта по тейку ✓';
        
        // Сбрасываем другую кнопку
        stopLossBtn.classList.remove('btn-danger');
        stopLossBtn.classList.add('btn-outline-danger');
        stopLossBtn.innerHTML = '<i class="bi bi-x-circle me-2"></i>Закрыта по стопу';
        
        // Устанавливаем цену и скрываем поле
        if (takeProfitField && takeProfitField.value) {
            priceField.value = takeProfitField.value;
        }
        priceField.disabled = true;
        // Скрываем весь блок с полем
        const priceFieldContainer = priceField.closest('.form-floating');
        if (priceFieldContainer) {
            priceFieldContainer.style.display = 'none';
        }
        
        // Создаем скрытое поле для отправки формы
        createHiddenPriceField(takeProfitField.value);
    }
};

window.toggleCloseByStopLoss = function() {
    const priceField = document.getElementById('id_price');
    const stopLossField = document.getElementById('id_planned_stop_loss');
    const btn = document.getElementById('closeByStopLossBtn');
    const takeProfitBtn = document.getElementById('closeByTakeProfitBtn');
    
    if (btn.classList.contains('btn-danger')) {
        // Отменяем выбор
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-outline-danger');
        btn.innerHTML = '<i class="bi bi-x-circle me-2"></i>Закрыта по стопу';
        priceField.disabled = false;
        priceField.value = '';
        // Показываем весь блок с полем
        const priceFieldContainer = priceField.closest('.form-floating');
        if (priceFieldContainer) {
            priceFieldContainer.style.display = 'block';
        }
        
        // Удаляем скрытое поле
        removeHiddenPriceField();
    } else {
        // Выбираем стоп-лосс
        btn.classList.remove('btn-outline-danger');
        btn.classList.add('btn-danger');
        btn.innerHTML = '<i class="bi bi-x-circle-fill me-2"></i>Закрыта по стопу ✓';
        
        // Сбрасываем другую кнопку
        takeProfitBtn.classList.remove('btn-success');
        takeProfitBtn.classList.add('btn-outline-success');
        takeProfitBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i>Закрыта по тейку';
        
        // Устанавливаем цену и скрываем поле
        if (stopLossField && stopLossField.value) {
            priceField.value = stopLossField.value;
        }
        priceField.disabled = true;
        // Скрываем весь блок с полем
        const priceFieldContainer = priceField.closest('.form-floating');
        if (priceFieldContainer) {
            priceFieldContainer.style.display = 'none';
        }
        
        // Создаем скрытое поле для отправки формы
        createHiddenPriceField(stopLossField.value);
    }
};

// Функции для работы со скрытыми полями цены
function createHiddenPriceField(value) {
    // Удаляем существующее скрытое поле
    removeHiddenPriceField();
    
    // Создаем новое скрытое поле
    const form = document.querySelector('form');
    const hiddenField = document.createElement('input');
    hiddenField.type = 'hidden';
    hiddenField.name = 'price';
    hiddenField.value = value;
    hiddenField.id = 'hidden_price_field';
    form.appendChild(hiddenField);
}

function removeHiddenPriceField() {
    const hiddenField = document.getElementById('hidden_price_field');
    if (hiddenField) {
        hiddenField.remove();
    }
}
