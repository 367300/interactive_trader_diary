/**
 * Tutorial.js - Библиотека для создания интерактивных элементов обучения
 * 
 * Использование:
 * const tutorial = new Tutorial([
 *   {
 *     target: '#element1',  // CSS селектор элемента
 *     text: 'Это первый элемент',
 *     image: '/static/core/img/example.jpg',  // опционально
 *     position: 'bottom'  // 'top', 'bottom', 'left', 'right', 'auto'
 *   },
 *   {
 *     target: '#element2',
 *     text: 'Это второй элемент',
 *     position: 'top'
 *   }
 * ]);
 * tutorial.start();
 */
class Tutorial {
    constructor(steps = [], storageKey = 'tutorial_completed', repeat = false) {
        this.steps = steps;
        this.currentStep = 0;
        this.overlay = null;
        this.tooltip = null;
        this.highlightedElements = [];
        this.isActive = false;
        this.onComplete = null;
        this.onStepChange = null;
        this.storageKey = storageKey;
        this.isRepeat = repeat;
        
        // Создаем элементы при инициализации
        this._createOverlay();
        this._createTooltip();
    }

    /**
     * Проверяет, прошел ли пользователь обучение
     */
    isCompleted() {
        try {
            return localStorage.getItem(this.storageKey) === 'true';
        } catch (e) {
            return false;
        }
    }

    /**
     * Отмечает обучение как пройденное
     */
    markCompleted() {
        try {
            localStorage.setItem(this.storageKey, 'true');
        } catch (e) {
            console.warn('Tutorial: не удалось сохранить в localStorage', e);
        }
    }

    /**
     * Создает затемняющий overlay
     */
    _createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay';
        this.overlay.style.display = 'none';
        this.overlay.style.position = 'fixed';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.zIndex = '9998';
        document.body.appendChild(this.overlay);
    }

    /**
     * Создает элемент подсказки
     */
    _createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tutorial-tooltip';
        this.tooltip.innerHTML = `
            <div class="tutorial-tooltip-content">
                <div class="tutorial-tooltip-image-container"></div>
                <div class="tutorial-tooltip-text"></div>
                <div class="tutorial-tooltip-buttons">
                    <button class="tutorial-tooltip-button tutorial-tooltip-button-skip">Пропустить</button>
                    <button class="tutorial-tooltip-button tutorial-tooltip-button-next">Понятно</button>
                </div>
            </div>
        `;
        this.tooltip.style.display = 'none';
        document.body.appendChild(this.tooltip);

        // Обработчик кнопки "Понятно"
        const nextButton = this.tooltip.querySelector('.tutorial-tooltip-button-next');
        nextButton.addEventListener('click', () => this.next());

        // Обработчик кнопки "Пропустить"
        const skipButton = this.tooltip.querySelector('.tutorial-tooltip-button-skip');
        skipButton.addEventListener('click', () => this.skip());
    }

    /**
     * Находит элемент по селектору
     */
    _findElement(selector) {
        if (typeof selector === 'string') {
            return document.querySelector(selector);
        }
        return selector;
    }

    /**
     * Вычисляет позицию подсказки относительно целевого элемента
     */
    _calculateTooltipPosition(targetElement, position = 'auto') {
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 20;

        let top, left;

        if (position === 'auto') {
            // Автоматическое определение позиции
            const spaceTop = targetRect.top;
            const spaceBottom = viewportHeight - targetRect.bottom;
            const spaceLeft = targetRect.left;
            const spaceRight = viewportWidth - targetRect.right;

            if (spaceBottom >= tooltipRect.height + padding) {
                position = 'bottom';
            } else if (spaceTop >= tooltipRect.height + padding) {
                position = 'top';
            } else if (spaceRight >= tooltipRect.width + padding) {
                position = 'right';
            } else {
                position = 'left';
            }
        }

        switch (position) {
            case 'top':
                top = targetRect.top - tooltipRect.height - padding;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'bottom':
                top = targetRect.bottom + padding;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.left - tooltipRect.width - padding;
                break;
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.right + padding;
                break;
            default:
                top = targetRect.bottom + padding;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        }

        // Проверка границ viewport
        if (left < padding) left = padding;
        if (left + tooltipRect.width > viewportWidth - padding) {
            left = viewportWidth - tooltipRect.width - padding;
        }
        if (top < padding) top = padding;
        if (top + tooltipRect.height > viewportHeight - padding) {
            top = viewportHeight - tooltipRect.height - padding;
        }

        return { top, left, position };
    }

    /**
     * Создает "вырез" в overlay для выделения элемента
     */
    _createHighlight(element) {
        this.highlightedElements.push({ element: element });
        this._updateOverlay();
    }

    /**
     * Обновляет overlay с учетом выделенных элементов
     */
    _updateOverlay() {
        if (!this.overlay || this.highlightedElements.length === 0) return;

        // Получаем размеры viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Удаляем старый SVG если есть
        const oldSvg = this.overlay.querySelector('.tutorial-overlay-svg');
        if (oldSvg) {
            oldSvg.remove();
        }

        // Создаем SVG для вырезов
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'tutorial-overlay-svg');
        svg.setAttribute('width', viewportWidth);
        svg.setAttribute('height', viewportHeight);
        svg.style.position = 'fixed';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '9998';

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
        mask.setAttribute('id', 'tutorial-mask-' + Date.now());

        // Белый прямоугольник (затемнение видно везде)
        // В SVG маске: белый = видимый, черный = невидимый
        const whiteRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        whiteRect.setAttribute('x', '0');
        whiteRect.setAttribute('y', '0');
        whiteRect.setAttribute('width', viewportWidth);
        whiteRect.setAttribute('height', viewportHeight);
        whiteRect.setAttribute('fill', 'white');
        mask.appendChild(whiteRect);

        // Черные прямоугольники (вырезы для выделенных элементов - затемнение НЕ видно)
        this.highlightedElements.forEach((highlight) => {
            const element = highlight.element;
            if (!element) return;
            
            const rect = element.getBoundingClientRect();
            
            // Проверяем, что элемент видим
            if (rect.width === 0 || rect.height === 0) return;
            
            // Вычисляем координаты и размеры с учетом границ viewport
            const x = Math.max(0, rect.left);
            const y = Math.max(0, rect.top);
            const width = Math.min(rect.width, viewportWidth - x);
            const height = Math.min(rect.height, viewportHeight - y);
            
            // Проверяем, что вырез находится в пределах viewport
            if (width <= 0 || height <= 0 || x >= viewportWidth || y >= viewportHeight) return;
            
            const blackRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            blackRect.setAttribute('x', x);
            blackRect.setAttribute('y', y);
            blackRect.setAttribute('width', width);
            blackRect.setAttribute('height', height);
            blackRect.setAttribute('fill', 'black');
            blackRect.setAttribute('rx', '8');
            mask.appendChild(blackRect);
        });

        defs.appendChild(mask);
        svg.appendChild(defs);

        // Затемняющий прямоугольник с маской
        const overlayRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        overlayRect.setAttribute('x', '0');
        overlayRect.setAttribute('y', '0');
        overlayRect.setAttribute('width', viewportWidth);
        overlayRect.setAttribute('height', viewportHeight);
        overlayRect.setAttribute('fill', 'rgba(0, 0, 0, 0.75)');
        overlayRect.setAttribute('mask', 'url(#' + mask.getAttribute('id') + ')');
        svg.appendChild(overlayRect);

        this.overlay.appendChild(svg);
    }

    /**
     * Скрывает tooltip с анимацией
     */
    _hideTooltip() {
        return new Promise((resolve) => {
            if (this.tooltip && this.tooltip.style.display === 'block') {
                this.tooltip.classList.add('tutorial-tooltip-fade-out');
                setTimeout(() => {
                    this.tooltip.style.display = 'none';
                    this.tooltip.classList.remove('tutorial-tooltip-fade-out');
                    resolve();
                }, 300);
            } else {
                resolve();
            }
        });
    }

    /**
     * Показывает tooltip с анимацией
     */
    _showTooltip() {
        return new Promise((resolve) => {
            this.tooltip.style.display = 'block';
            this.tooltip.classList.add('tutorial-tooltip-fade-in');
            setTimeout(() => {
                this.tooltip.classList.remove('tutorial-tooltip-fade-in');
                resolve();
            }, 300);
        });
    }

    /**
     * Показывает текущий шаг
     */
    async _showStep(stepIndex) {
        if (stepIndex < 0 || stepIndex >= this.steps.length) {
            this.stop();
            return;
        }

        const step = this.steps[stepIndex];
        const targetElement = this._findElement(step.target);

        if (!targetElement) {
            console.warn(`Tutorial: элемент не найден для шага ${stepIndex}:`, step.target);
            this.next();
            return;
        }

        // Скрываем текущий tooltip с анимацией (если он виден)
        const wasVisible = this.tooltip && this.tooltip.style.display === 'block';
        if (wasVisible) {
            await this._hideTooltip();
        }

        // Очищаем предыдущие выделения
        this.highlightedElements = [];

        // Прокручиваем к элементу если нужно
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Обновляем подсказку
        const textContainer = this.tooltip.querySelector('.tutorial-tooltip-text');
        const imageContainer = this.tooltip.querySelector('.tutorial-tooltip-image-container');
        
        textContainer.textContent = step.text || '';

        // Обработка изображения
        if (step.image) {
            imageContainer.innerHTML = `<img src="${step.image}" alt="Tutorial image" class="tutorial-tooltip-image">`;
            imageContainer.style.display = 'block';
        } else {
            imageContainer.innerHTML = '';
            imageContainer.style.display = 'none';
        }

        // Показываем overlay с плавной анимацией
        if (this.overlay.style.display === 'none') {
            this.overlay.style.display = 'block';
            this.overlay.style.opacity = '0';
            setTimeout(() => {
                if (this.overlay) {
                    this.overlay.style.opacity = '1';
                }
            }, 10);
        }

        // Ждем завершения прокрутки и обновляем overlay
        setTimeout(async () => {
            // Создаем выделение после прокрутки
            this._createHighlight(targetElement);
            
            // Показываем tooltip невидимым для расчета размеров
            this.tooltip.style.display = 'block';
            this.tooltip.style.opacity = '0';
            this.tooltip.style.visibility = 'hidden';
            
            // Рассчитываем позицию
            requestAnimationFrame(() => {
                const position = this._calculateTooltipPosition(targetElement, step.position);
                this.tooltip.style.top = position.top + 'px';
                this.tooltip.style.left = position.left + 'px';
                this.tooltip.setAttribute('data-position', position.position);
                
                // Показываем с анимацией
                this.tooltip.style.visibility = 'visible';
                this.tooltip.style.opacity = '1';
                this.tooltip.classList.add('tutorial-tooltip-fade-in');
                setTimeout(() => {
                    this.tooltip.classList.remove('tutorial-tooltip-fade-in');
                }, 300);
            });
        }, 300);

        // Вызываем callback если есть
        if (this.onStepChange) {
            this.onStepChange(stepIndex, step);
        }
    }

    /**
     * Начинает туториал
     */
    start() {
        if (this.steps.length === 0) {
            console.warn('Tutorial: нет шагов для показа');
            return;
        }

        // Проверяем, не прошел ли пользователь уже обучение
        if (this.isCompleted() && !this.isRepeat) {
            return;
        }

        this.isActive = true;
        this.currentStep = 0;
        this._showStep(this.currentStep);

        // Обработка изменения размера окна и скролла
        this._resizeHandler = () => {
            if (this.isActive) {
                // Обновляем overlay с новыми координатами
                this._updateOverlay();
                
                // Обновляем позицию подсказки
                const step = this.steps[this.currentStep];
                if (step) {
                    const targetElement = this._findElement(step.target);
                    if (targetElement) {
                        setTimeout(() => {
                            const position = this._calculateTooltipPosition(targetElement, step.position);
                            this.tooltip.style.top = position.top + 'px';
                            this.tooltip.style.left = position.left + 'px';
                        }, 50);
                    }
                }
            }
        };

        window.addEventListener('resize', this._resizeHandler);
        window.addEventListener('scroll', this._resizeHandler, true);
    }

    /**
     * Переходит к следующему шагу
     */
    async next() {
        if (!this.isActive) return;

        this.currentStep++;
        if (this.currentStep >= this.steps.length) {
            await this._hideTooltip();
            this.stop();
        } else {
            await this._showStep(this.currentStep);
        }
    }

    /**
     * Переходит к предыдущему шагу
     */
    async prev() {
        if (!this.isActive) return;

        this.currentStep--;
        if (this.currentStep < 0) {
            this.currentStep = 0;
        } else {
            await this._showStep(this.currentStep);
        }
    }

    /**
     * Пропускает обучение
     */
    async skip() {
        if (!this.isActive) return;

        // Скрываем tooltip с анимацией
        await this._hideTooltip();
        
        // Останавливаем туториал и помечаем как пройденный
        this.stop();
    }

    /**
     * Останавливает туториал
     */
    stop() {
        this.isActive = false;
        
        // Плавно скрываем overlay
        if (this.overlay) {
            this.overlay.style.opacity = '0';
            setTimeout(() => {
                if (this.overlay) {
                    this.overlay.style.display = 'none';
                    this.overlay.style.opacity = '1';
                }
            }, 300);
        }
        
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
        
        this.highlightedElements = [];

        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            window.removeEventListener('scroll', this._resizeHandler, true);
        }

        // Отмечаем обучение как пройденное
        this.markCompleted();

        if (this.onComplete) {
            this.onComplete();
        }
    }

    /**
     * Переходит к конкретному шагу
     */
    async goToStep(stepIndex) {
        if (stepIndex >= 0 && stepIndex < this.steps.length) {
            this.currentStep = stepIndex;
            if (this.isActive) {
                await this._showStep(this.currentStep);
            }
        }
    }

    /**
     * Устанавливает callback для завершения туториала
     */
    setOnComplete(callback) {
        this.onComplete = callback;
    }

    /**
     * Устанавливает callback для изменения шага
     */
    setOnStepChange(callback) {
        this.onStepChange = callback;
    }

    /**
     * Уничтожает туториал и удаляет элементы из DOM
     */
    destroy() {
        this.stop();
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
    }
}

// Экспорт для использования в модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Tutorial;
}

