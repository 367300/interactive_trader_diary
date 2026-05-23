// Динамическое изменение цвета навбара
(function() {
    // Конфигурация
    const config = {
        colorMixRatio: 0.25,        // Доля найденного цвета (0.05 = 5%)
        whiteMixRatio: 0.75,        // Доля белого цвета (0.95 = 95%)
        opacity: 0.85,              // Непрозрачность фона
        samplePoints: 3,            // Количество точек для проверки
        pointOffsetY: 5,            // Смещение точек по Y от нижнего края навбара (px)
        maxDepth: 10,               // Максимальная глубина поиска по родительским элементам
        initDelay: 200              // Задержка инициализации (ms)
    };

    const navbar = document.querySelector('.navbar-container');
    if (!navbar) return;

    function getColorFromPoint(x, y) {
        const navElement = navbar.closest('nav');
        const temp = navbar.style.pointerEvents;
        navbar.style.pointerEvents = 'none';
        const elements = document.elementsFromPoint(x, y);
        navbar.style.pointerEvents = temp;
        
        if (!elements || elements.length === 0) return null;
        
        for (const el of elements) {
            if (el === navbar || el === navElement || navbar.contains(el) || (navElement && navElement.contains(el))) {
                continue;
            }
            
            let current = el;
            let depth = 0;
            while (current && current !== document.body && depth < config.maxDepth) {
                if (current === navbar || current === navElement || navbar.contains(current) || (navElement && navElement.contains(current))) {
                    current = current.parentElement;
                    depth++;
                    continue;
                }
                
                const style = window.getComputedStyle(current);
                const bgImage = style.backgroundImage;
                
                if (bgImage && bgImage !== 'none' && bgImage.includes('gradient')) {
                    const gradientMatch = bgImage.match(/(?:rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)|rgb\((\d+),\s*(\d+),\s*(\d+)\)|#([0-9a-fA-F]{3,6}))/);
                    if (gradientMatch) {
                        let r, g, b;
                        if (gradientMatch[1]) {
                            r = parseInt(gradientMatch[1]);
                            g = parseInt(gradientMatch[2]);
                            b = parseInt(gradientMatch[3]);
                        } else if (gradientMatch[4]) {
                            r = parseInt(gradientMatch[4]);
                            g = parseInt(gradientMatch[5]);
                            b = parseInt(gradientMatch[6]);
                        } else if (gradientMatch[7]) {
                            const hex = gradientMatch[7];
                            if (hex.length === 3) {
                                r = parseInt(hex[0] + hex[0], 16);
                                g = parseInt(hex[1] + hex[1], 16);
                                b = parseInt(hex[2] + hex[2], 16);
                            } else {
                                r = parseInt(hex.substring(0, 2), 16);
                                g = parseInt(hex.substring(2, 4), 16);
                                b = parseInt(hex.substring(4, 6), 16);
                            }
                        }
                        if (r !== undefined && g !== undefined && b !== undefined) {
                            return [r, g, b];
                        }
                    }
                }
                
                const bg = style.backgroundColor;
                const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (match) {
                    const r = parseInt(match[1]);
                    const g = parseInt(match[2]);
                    const b = parseInt(match[3]);
                    if (r !== 0 || g !== 0 || b !== 0 || bg.includes('255')) {
                        return [r, g, b];
                    }
                }
                current = current.parentElement;
                depth++;
            }
        }
        return null;
    }

    function getAverageColor() {
        const rect = navbar.getBoundingClientRect();
        const points = [];
        
        // Генерируем точки в зависимости от конфигурации
        if (config.samplePoints === 1) {
            points.push([rect.left + rect.width / 2, rect.bottom + config.pointOffsetY]);
        } else if (config.samplePoints === 2) {
            points.push(
                [rect.left + rect.width / 3, rect.bottom + config.pointOffsetY],
                [rect.left + rect.width * 2 / 3, rect.bottom + config.pointOffsetY]
            );
        } else {
            points.push(
                [rect.left + rect.width / 2, rect.bottom + config.pointOffsetY],
                [rect.left + rect.width / 4, rect.bottom + config.pointOffsetY],
                [rect.left + rect.width * 3 / 4, rect.bottom + config.pointOffsetY]
            );
        }
        
        let r = 0, g = 0, b = 0, count = 0;
        points.forEach(([x, y]) => {
            const color = getColorFromPoint(x, y);
            if (color) {
                r += color[0];
                g += color[1];
                b += color[2];
                count++;
            }
        });
        
        if (count > 0) {
            const avgR = Math.round(r / count);
            const avgG = Math.round(g / count);
            const avgB = Math.round(b / count);
            // Смешиваем с белым согласно конфигурации
            const finalR = Math.round(255 * config.whiteMixRatio + avgR * config.colorMixRatio);
            const finalG = Math.round(255 * config.whiteMixRatio + avgG * config.colorMixRatio);
            const finalB = Math.round(255 * config.whiteMixRatio + avgB * config.colorMixRatio);
            return `rgba(${finalR}, ${finalG}, ${finalB}, ${config.opacity})`;
        }
        return null;
    }

    let ticking = false;
    function update() {
        if (!ticking) {
            requestAnimationFrame(() => {
                const color = getAverageColor();
                if (color) {
                    navbar.style.setProperty('background', color, 'important');
                }
                ticking = false;
            });
            ticking = true;
        }
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    setTimeout(update, config.initDelay);
})();
