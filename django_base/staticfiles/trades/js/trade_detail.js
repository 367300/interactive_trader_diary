/**
 * JavaScript для детального просмотра сделок
 * Обработка вкладок, аккордеонов, модальных окон
 */

class TradeDetailManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupTabs();
        this.setupAccordion();
        this.setupModals();
        this.setupScreenshots();
        this.setupAnimations();
    }

    /**
     * Настройка вкладок
     */
    setupTabs() {
        const tabLinks = document.querySelectorAll('.nav-tabs .nav-link');
        
        tabLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // Убираем активный класс со всех вкладок
                tabLinks.forEach(l => l.classList.remove('active'));
                // Добавляем активный класс к текущей вкладке
                e.target.classList.add('active');
            });
        });
    }

    /**
     * Настройка аккордеона
     */
    setupAccordion() {
        const accordionButtons = document.querySelectorAll('.accordion-button');
        
        accordionButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Добавляем анимацию для иконки
                const icon = button.querySelector('i');
                if (icon) {
                    icon.style.transform = button.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
                }
            });
        });
    }

    /**
     * Настройка модальных окон
     */
    setupModals() {
        const modals = document.querySelectorAll('.modal');
        
        modals.forEach(modal => {
            // Эффект открытия
            modal.addEventListener('show.bs.modal', (e) => {
                const modalBody = e.target.querySelector('.modal-body');
                if (modalBody) {
                    modalBody.style.opacity = '0';
                    modalBody.style.transform = 'scale(0.8)';
                    
                    setTimeout(() => {
                        modalBody.style.transition = 'all 0.3s ease';
                        modalBody.style.opacity = '1';
                        modalBody.style.transform = 'scale(1)';
                    }, 100);
                }
            });

            // Эффект закрытия
            modal.addEventListener('hide.bs.modal', (e) => {
                const modalBody = e.target.querySelector('.modal-body');
                if (modalBody) {
                    modalBody.style.transition = 'all 0.2s ease';
                    modalBody.style.opacity = '0';
                    modalBody.style.transform = 'scale(0.8)';
                }
            });
        });
    }

    /**
     * Настройка скриншотов
     */
    setupScreenshots() {
        const thumbnails = document.querySelectorAll('.screenshot-thumbnail');
        
        thumbnails.forEach(thumbnail => {
            thumbnail.addEventListener('click', (e) => {
                // Эффект нажатия
                e.target.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    e.target.style.transform = 'scale(1)';
                }, 150);
            });
        });

        const cards = document.querySelectorAll('.screenshot-card');
        
        cards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-4px)';
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
            });
        });
    }

    /**
     * Настройка анимаций
     */
    setupAnimations() {
        // Анимация появления карточек
        const cards = document.querySelectorAll('.card');
        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });

        // Анимация для кнопок
        const buttons = document.querySelectorAll('.btn');
        buttons.forEach(button => {
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'translateY(-2px)';
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.transform = 'translateY(0)';
            });
        });
    }

    /**
     * Подтверждение удаления дочерней сделки
     */
    static confirmDeleteChildTrade(tradeId, tradeType, tradeDate) {
        const message = `Вы уверены, что хотите удалить ${tradeType} от ${tradeDate}?\n\nЭто действие нельзя отменить!`;
        
        if (confirm(message)) {
            // Создаем форму для отправки DELETE запроса
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = `/trades/${tradeId}/delete/`;
            
            // Добавляем CSRF токен
            const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
            if (csrfToken) {
                const csrfInput = document.createElement('input');
                csrfInput.type = 'hidden';
                csrfInput.name = 'csrfmiddlewaretoken';
                csrfInput.value = csrfToken.value;
                form.appendChild(csrfInput);
            }
            
            // Добавляем скрытое поле для метода DELETE
            const methodInput = document.createElement('input');
            methodInput.type = 'hidden';
            methodInput.name = '_method';
            methodInput.value = 'DELETE';
            form.appendChild(methodInput);
            
            // Добавляем форму в документ и отправляем
            document.body.appendChild(form);
            form.submit();
        }
    }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    new TradeDetailManager();
});

// Глобальная функция для совместимости
window.confirmDeleteChildTrade = TradeDetailManager.confirmDeleteChildTrade;
