/**
 * SIMULADORES DE FÍSICA 2026
 * Autor: Dr. Eduardo R. Henquín (Versión original Excel 2005)
 * Implementación Web: 2026
 */

"use strict";

// =============================================================================
// 1. ESTADO GLOBAL Y CONFIGURACIÓN
// =============================================================================

const EPS = 1e-9;

const state = {
    currentSection: 'inicio',
    mrua: {
        a: 10,
        vi: -30,
        xi: 0,
        tMax: 10,
        tEval: 3,
        isPlaying: false,
        speed: 1,
        animationId: null
    },
    encuentro: {
        aA: -10, viA: 100, xiA: 2000,
        aB: 10, viB: 0, xiB: 0,
        tMax: 50,
        tEval: 20,
        isPlaying: false,
        speed: 1,
        animationId: null
    },
    projectile: {
        initialized: false
    }
};

// =============================================================================
// 2. NAVEGACIÓN Y UTILIDADES DOM
// =============================================================================

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.app-section');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    // Manejo de cambio de sección
    const switchSection = (hash) => {
        const id = hash.replace('#', '') || 'inicio';
        state.currentSection = id;

        sections.forEach(sec => {
            sec.classList.toggle('hidden', sec.id !== id);
        });

        navLinks.forEach(link => {
            const linkId = link.getAttribute('href').replace('#', '');
            link.classList.toggle('active', linkId === id);
        });

        navMenu.classList.remove('open');
        window.scrollTo(0, 0);

        if (id === 'mru-mrua') updateMRUA();
        if (id === 'encuentro') updateEncuentro();
        if (id === 'tiro-oblicuo') {
            requestAnimationFrame(() => {
                initProjectileIfNeeded();
                if (projectileSimulator) {
                    projectileSimulator.resizeCanvas();
                    projectileSimulator.simulate();
                }
            });
        }
        if (id === 'caida-libre') {
            requestAnimationFrame(() => {
                initVerticalIfNeeded();
                if (verticalSimulator) {
                    verticalSimulator.resizeCanvas();
                    verticalSimulator.simulate();
                }
            });
        }
    };

    window.addEventListener('hashchange', () => switchSection(location.hash));
    
    // Hamburger Menu
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('open');
    });

    // Carga inicial
    switchSection(location.hash);
}

let projectileSimulator = null;

function initProjectileIfNeeded() {
    if (!projectileSimulator) {
        projectileSimulator = new ProjectileSimulator();
    } else {
        projectileSimulator.simulate();
    }
}

let verticalSimulator = null;

function initVerticalIfNeeded() {
    if (!verticalSimulator) {
        verticalSimulator = new VerticalSimulator();
    } else {
        verticalSimulator.simulate();
    }
}

// Sincronización Slider <-> Número mapeada
function syncInputsMapped(idPrefix, idKey, stateObj, stateKey, callback) {
    const slider = document.getElementById(`${idPrefix}-${idKey}-slider`);
    const num = document.getElementById(`${idPrefix}-${idKey}-num`);

    if (!slider || !num) return;

    const applyValue = (raw) => {
        let val = parseFloat(raw);
        if (isNaN(val)) return;

        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);

        val = Math.max(min, Math.min(max, val));

        slider.value = val;
        num.value = val;
        stateObj[stateKey] = val;
        callback();
    };

    slider.addEventListener('input', e => applyValue(e.target.value));
    num.addEventListener('input', e => applyValue(e.target.value));
}

// Control fino con botones stepper
function initStepperControls() {
    document.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const slider = document.getElementById(`${target}-slider`);
            const num = document.getElementById(`${target}-num`);

            if (!slider || !num) return;

            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            const step = parseFloat(slider.step) || 1;
            const current = parseFloat(slider.value) || 0;

            const direction = btn.classList.contains('step-up') ? 1 : -1;
            let next = current + direction * step;

            next = Math.max(min, Math.min(max, next));

            // Evitar problemas de precisión de coma flotante
            const decimals = step.toString().includes('.') 
                ? step.toString().split('.')[1].length 
                : 0;

            next = Number(next.toFixed(decimals));

            slider.value = next;
            num.value = next;

            // Disparar evento input para que syncInputsMapped lo capture
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
}

// =============================================================================
// 3. MOTOR MATEMÁTICO Y UTILIDADES DE ESCALA
// =============================================================================

/**
 * Resuelve ax² + bx + c = 0
 * Retorna array de raíces reales positivas
 */
function solveQuadratic(a, b, c) {
    if (Math.abs(a) < EPS) {
        // Caso lineal: bx + c = 0
        if (Math.abs(b) < EPS) return [];
        const t = -c / b;
        return t >= -EPS ? [t] : [];
    }

    const disc = b * b - 4 * a * c;
    if (disc < -EPS) return []; // Sin raíces reales

    if (Math.abs(disc) < EPS) {
        const t = -b / (2 * a);
        return t >= -EPS ? [t] : [];
    }

    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b + sqrtDisc) / (2 * a);
    const t2 = (-b - sqrtDisc) / (2 * a);

    const roots = [];
    if (t1 >= -EPS) roots.push(t1);
    if (t2 >= -EPS) roots.push(t2);
    
    return roots.sort((x, y) => x - y);
}

// Utilidades para escalas "lindas" (Nice Numbers)
function niceTickStep(rawStep) {
    if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
    const exponent = Math.floor(Math.log10(rawStep));
    const fraction = rawStep / Math.pow(10, exponent);
    let niceFraction;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * Math.pow(10, exponent);
}

function makeNiceRange(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -10, max: 10 };
    if (Math.abs(max - min) < EPS) {
        const base = Math.max(1, Math.abs(max) || 1);
        min = max - base;
        max = max + base;
    }
    const range = max - min;
    const step = niceTickStep(range / 4);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    return { min: niceMin, max: niceMax, step: step };
}

function formatAxisNumber(value, step) {
    if (Math.abs(value) < EPS) return "0";
    if (step >= 10) return value.toFixed(0);
    if (step >= 1) return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
    if (step >= 0.1) return value.toFixed(1);
    return value.toFixed(2);
}

// Rangos específicos por magnitud
function getAccelerationYRange(a) {
    const absA = Math.abs(a);
    const limit = Math.max(2.5, absA * 1.5);
    return makeNiceRange(-limit, limit);
}

function getVelocityYRange(pointsV) {
    const vals = pointsV.map(p => p.y);
    let min = Math.min(...vals, 0);
    let max = Math.max(...vals, 0);
    const range = max - min || 10;
    return makeNiceRange(min - range * 0.12, max + range * 0.12);
}

function getPositionYRange(pointsX) {
    const vals = pointsX.map(p => p.y);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const rangeRaw = Math.max(max - min, EPS);
    const distToZero = Math.min(Math.abs(min), Math.abs(max));
    // Incluir cero si cruza o está cerca
    if ((min <= 0 && max >= 0) || distToZero < rangeRaw * 0.75) {
        min = Math.min(min, 0);
        max = Math.max(max, 0);
    }
    const range = max - min || 10;
    return makeNiceRange(min - range * 0.12, max + range * 0.12);
}

function getTrackRange(pointsA, pointsB) {
    const vals = [...pointsA.map(p => p.y), ...pointsB.map(p => p.y)];
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (Math.abs(max - min) < EPS) { min -= 100; max += 100; }
    const range = max - min;
    return makeNiceRange(min - range * 0.1, max + range * 0.1);
}

// =============================================================================
// 4. CLASE DE GRÁFICOS SVG (CUSTOM)
// =============================================================================

class SVGGraph {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = Object.assign({
            margin: { top: 20, right: 30, bottom: 40, left: 60 },
            lineColor: '#6366f1',
            xLabel: 't (s)',
            yLabel: 'y',
            gridColor: '#1e293b',
            axisColor: '#475569'
        }, options);
        
        this.svg = null;
        this.width = 0;
        this.height = 0;
        this.init();
    }

    init() {
        this.container.innerHTML = '';
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width || 400;
        this.height = rect.height || 250;

        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("width", "100%");
        this.svg.setAttribute("height", "100%");
        this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
        this.container.appendChild(this.svg);
    }

    render(dataPoints, xRange, yRange, markers = [], options = {}) {
        this.init();
        
        const { margin, lineColor, xLabel, yLabel, gridColor, axisColor } = this.options;
        const chartW = this.width - margin.left - margin.right;
        const chartH = this.height - margin.top - margin.bottom;

        // Escalas
        const scaleX = (val) => margin.left + ((val - xRange.min) / (xRange.max - xRange.min)) * chartW;
        const scaleY = (val) => margin.top + chartH - ((val - yRange.min) / (yRange.max - yRange.min)) * chartH;

        // Grilla y Ejes
        this.drawGrid(scaleX, scaleY, xRange, yRange, chartW, chartH);
        
        // Eje X = 0 y Eje Y = 0
        if (0 >= yRange.min && 0 <= yRange.max) this.drawLine(margin.left, scaleY(0), margin.left + chartW, scaleY(0), '#64748b', 1.4, "", 0.75);
        if (0 >= xRange.min && 0 <= xRange.max) this.drawLine(scaleX(0), margin.top, scaleX(0), margin.top + chartH, axisColor, 1.5);

        // Área sombreada (especial para aceleración y velocidad)
        if (options.baselineY !== undefined) {
            if (options.chartType === 'acceleration') {
                const y0 = scaleY(options.baselineY);
                const ya = scaleY(markers[0] ? markers[0].val : 0);
                const x0 = margin.left;
                const xEnd = scaleX(options.progressT || xRange.max);
                this.drawRect(x0, Math.min(y0, ya), xEnd - x0, Math.abs(y0 - ya), lineColor, 0.12);
            } else if (options.chartType === 'velocity' && options.progressive) {
                // Área sutil bajo la curva de velocidad
                this.drawAreaUnderPath(this.getPastPoints(dataPoints, options.progressT), scaleX, scaleY, options.baselineY, lineColor, 0.08);
            }
        }

        // Dibujar Datos
        if (Array.isArray(dataPoints[0])) {
            // Múltiples series (Encuentro)
            const colors = [this.options.lineColor, '#fb7185'];
            dataPoints.forEach((series, i) => {
                const color = colors[i] || lineColor;
                if (options.progressive) {
                    // Curva Futura (faded)
                    this.drawPath(series, scaleX, scaleY, color, 0.22, 2);
                    // Curva Recorrida (fuerte)
                    const pastPoints = this.getPastPoints(series, options.progressT);
                    this.drawPath(pastPoints, scaleX, scaleY, color, 1, 3.2);
                } else {
                    this.drawPath(series, scaleX, scaleY, color);
                }
            });
        } else {
            if (options.progressive) {
                // Curva Futura (faded)
                this.drawPath(dataPoints, scaleX, scaleY, lineColor, 0.22, 2);
                
                // Curva Recorrida (fuerte)
                const pastPoints = this.getPastPoints(dataPoints, options.progressT);
                this.drawPath(pastPoints, scaleX, scaleY, lineColor, 1, 3.2);
            } else {
                this.drawPath(dataPoints, scaleX, scaleY, lineColor);
            }
        }

        // Marcadores (t_eval)
        markers.forEach(m => {
            const x = scaleX(m.t);
            const y = scaleY(m.val);
            
            // Línea vertical elegante
            this.drawLine(x, margin.top, x, margin.top + chartH, '#fbbf24', 1, "5,5", 0.65);
            
            // Halo pulsante (opacidad variable en CSS)
            this.drawCircle(x, y, 11, m.color || '#fbbf24', 0.18, "pulse-halo");
            
            // Punto actual
            this.drawCircle(x, y, 5, m.color || '#fbbf24', 1);

            // Etiqueta de valor
            if (options.showValueLabel && m.label) {
                this.drawValueLabel(x, y, m.label, m.color || lineColor);
            }
        });

        // Badge informativo para aceleración
        if (options.chartType === 'acceleration' && markers[0]) {
            const a = markers[0].val;
            let text = a > 0 ? "a > 0: Aumenta v" : (a < 0 ? "a < 0: Frena v" : "a = 0: MRU");
            this.drawText(margin.left + 10, margin.top + 20, text, lineColor, '11px', 'start', 0, '600');
        }

        // Etiquetas de ejes
        this.drawText(this.width / 2, this.height - 5, xLabel, '#94a3b8', '12px', 'middle');
        this.drawText(15, this.height / 2, yLabel, '#94a3b8', '12px', 'middle', -90);
    }

    getPastPoints(points, tEval) {
        const past = [];
        for (let i = 0; i < points.length; i++) {
            if (points[i].x <= tEval) {
                past.push(points[i]);
            } else {
                // Interpolar punto exacto en tEval
                if (i > 0) {
                    const p1 = points[i - 1];
                    const p2 = points[i];
                    const ratio = (tEval - p1.x) / (p2.x - p1.x);
                    const yEval = p1.y + ratio * (p2.y - p1.y);
                    past.push({ x: tEval, y: yEval });
                }
                break;
            }
        }
        return past;
    }

    drawGrid(scaleX, scaleY, xRange, yRange, w, h) {
        const { margin, gridColor } = this.options;
        
        // Ticks X (Tiempo)
        const xStep = niceTickStep((xRange.max - xRange.min) / 5);
        const xStart = Math.ceil(xRange.min / xStep) * xStep;
        for (let val = xStart; val <= xRange.max + EPS; val += xStep) {
            const x = scaleX(val);
            this.drawLine(x, margin.top, x, margin.top + h, gridColor, 1);
            this.drawText(x, margin.top + h + 15, formatAxisNumber(val, xStep), '#64748b', '10px', 'middle');
        }

        // Ticks Y (Magnitud)
        const yStep = yRange.step || niceTickStep((yRange.max - yRange.min) / 4);
        const yStart = Math.ceil(yRange.min / yStep) * yStep;
        for (let val = yStart; val <= yRange.max + EPS; val += yStep) {
            const y = scaleY(val);
            this.drawLine(margin.left, y, margin.left + w, y, gridColor, 1);
            this.drawText(margin.left - 10, y + 4, formatAxisNumber(val, yStep), '#64748b', '10px', 'end');
        }
    }

    drawPath(points, scaleX, scaleY, color, opacity = 1, width = 2.5) {
        if (points.length < 2) return;
        let d = `M ${scaleX(points[0].x)} ${scaleY(points[0].y)}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${scaleX(points[i].x)} ${scaleY(points[i].y)}`;
        }
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", width);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("opacity", opacity);
        if (opacity === 1) path.classList.add("graph-path-main");
        this.svg.appendChild(path);
    }

    drawLine(x1, y1, x2, y2, color, width, dash = "", opacity = 1) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", width);
        line.setAttribute("opacity", opacity);
        if (dash) line.setAttribute("stroke-dasharray", dash);
        this.svg.appendChild(line);
    }

    drawCircle(cx, cy, r, color, opacity = 1, className = "") {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", cx);
        circle.setAttribute("cy", cy);
        circle.setAttribute("r", r);
        circle.setAttribute("fill", color);
        if (opacity < 1) circle.setAttribute("stroke", "none");
        else {
            circle.setAttribute("stroke", "#000");
            circle.setAttribute("stroke-width", "1");
        }
        circle.setAttribute("opacity", opacity);
        if (className) circle.classList.add(className);
        this.svg.appendChild(circle);
    }

    drawRect(x, y, w, h, color, opacity) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", x);
        rect.setAttribute("y", y);
        rect.setAttribute("width", w);
        rect.setAttribute("height", h);
        rect.setAttribute("fill", color);
        rect.setAttribute("opacity", opacity);
        this.svg.appendChild(rect);
    }

    drawAreaUnderPath(points, scaleX, scaleY, baselineVal, color, opacity) {
        if (points.length < 2) return;
        const y0 = scaleY(baselineVal);
        let d = `M ${scaleX(points[0].x)} ${y0}`;
        for (const p of points) d += ` L ${scaleX(p.x)} ${scaleY(p.y)}`;
        d += ` L ${scaleX(points[points.length - 1].x)} ${y0} Z`;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", color);
        path.setAttribute("opacity", opacity);
        this.svg.appendChild(path);
    }

    drawValueLabel(x, y, text, color) {
        const paddingW = 10, paddingH = 6;
        const boxW = text.length * 7 + paddingW;
        const boxH = 20;
        
        let boxX = x + 10;
        let boxY = y - 30;

        // Evitar que salga por la derecha
        if (boxX + boxW > this.width - 10) boxX = x - boxW - 10;
        // Evitar que salga por arriba
        if (boxY < 10) boxY = y + 10;

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", boxX);
        rect.setAttribute("y", boxY);
        rect.setAttribute("width", boxW);
        rect.setAttribute("height", boxH);
        rect.setAttribute("fill", "rgba(15, 23, 42, 0.9)");
        rect.setAttribute("stroke", color);
        rect.setAttribute("stroke-width", "1");
        rect.setAttribute("rx", "4");
        this.svg.appendChild(rect);

        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", boxX + boxW/2);
        txt.setAttribute("y", boxY + boxH/2 + 4);
        txt.setAttribute("fill", "#fff");
        txt.setAttribute("font-size", "10px");
        txt.setAttribute("font-weight", "bold");
        txt.setAttribute("text-anchor", "middle");
        txt.textContent = text;
        this.svg.appendChild(txt);
    }

    drawText(x, y, text, color, size, anchor, rotate = 0, weight = 'normal') {
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", x);
        txt.setAttribute("y", y);
        txt.setAttribute("fill", color);
        txt.setAttribute("font-size", size);
        txt.setAttribute("font-weight", weight);
        txt.setAttribute("text-anchor", anchor);
        if (rotate) txt.setAttribute("transform", `rotate(${rotate}, ${x}, ${y})`);
        txt.textContent = text;
        this.svg.appendChild(txt);
    }
}

// Instancias de gráficos
const charts = {
    mruaA: new SVGGraph('graph-a', { yLabel: 'a (m/s²)', lineColor: '#38bdf8' }),
    mruaV: new SVGGraph('graph-v', { yLabel: 'v (m/s)', lineColor: '#fb7185' }),
    mruaX: new SVGGraph('graph-x', { yLabel: 'x (m)', lineColor: '#4ade80' }),
    encuentro: new SVGGraph('graph-encuentro', { yLabel: 'x (m)', lineColor: '#4ade80' }),
    encuentroV: new SVGGraph('graph-encuentro-v', { yLabel: 'v (m/s)', lineColor: '#4ade80' })
};

// =============================================================================
// 5. SIMULADOR MRU - MRUA
// =============================================================================

function updateMRUA() {
    const { a, vi, xi, tMax, tEval } = state.mrua;

    // Ecuaciones
    const v = (t) => vi + a * t;
    const x = (t) => xi + vi * t + 0.5 * a * t * t;

    // Resultados en tarjetas
    document.getElementById('res-mrua-a').textContent = a.toFixed(2);
    document.getElementById('res-mrua-vf').textContent = v(tEval).toFixed(2);
    document.getElementById('res-mrua-xf').textContent = x(tEval).toFixed(2);

    // Eventos Críticos
    const eventsList = document.getElementById('mrua-events-list');
    eventsList.innerHTML = '';

    // v = 0
    if (Math.abs(a) > EPS) {
        const tv0 = -vi / a;
        if (tv0 >= 0 && tv0 <= tMax) {
            const li = document.createElement('li');
            li.textContent = `Se detiene (v=0) en t = ${tv0.toFixed(2)} s`;
            eventsList.appendChild(li);
        } else {
            const li = document.createElement('li');
            li.textContent = "La velocidad no se anula en el intervalo.";
            eventsList.appendChild(li);
        }
    }

    // x = 0
    const rootsX0 = solveQuadratic(0.5 * a, vi, xi);
    const validX0 = rootsX0.filter(r => r >= 0 && r <= tMax);
    if (validX0.length > 0) {
        validX0.forEach(r => {
            const li = document.createElement('li');
            li.textContent = `Pasa por origen (x=0) en t = ${r.toFixed(2)} s`;
            eventsList.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = "No pasa por x=0 en el intervalo.";
        eventsList.appendChild(li);
    }

    // Interpretación
    let interp = "";
    if (Math.abs(a) < EPS) {
        interp = "El movimiento es rectilíneo uniforme (MRU): la velocidad permanece constante.";
    } else {
        if (a > 0) interp = vi >= 0 ? "Aumenta su velocidad en sentido positivo." : "Se frena inicialmente hacia el origen, luego invierte el sentido.";
        else interp = vi <= 0 ? "Aumenta su velocidad en sentido negativo." : "Se frena inicialmente, pudiendo invertir su marcha.";
    }
    document.getElementById('mrua-interpretation').textContent = interp;

    // Generar datos para gráficos y tabla
    const pointsA = [], pointsV = [], pointsX = [];
    const tableBody = document.querySelector('#mrua-table tbody');
    tableBody.innerHTML = '';
    
    const steps = 100;
    const dt = tMax / steps;
    
    for (let i = 0; i <= steps; i++) {
        const t = i * dt;
        const curV = v(t);
        const curX = x(t);
        pointsA.push({ x: t, y: a });
        pointsV.push({ x: t, y: curV });
        pointsX.push({ x: t, y: curX });

        // Llenar tabla (solo 20 filas aprox para rendimiento)
        if (i % 5 === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${t.toFixed(1)}</td><td>${a.toFixed(2)}</td><td>${curV.toFixed(2)}</td><td>${curX.toFixed(2)}</td>`;
            tableBody.appendChild(tr);
        }
    }

    // Renderizar Gráficos con lógica mejorada
    const xRange = { min: 0, max: tMax };
    
    charts.mruaA.render(pointsA, xRange, getAccelerationYRange(a), [
        { t: tEval, val: a, color: '#38bdf8', label: `a = ${a.toFixed(2)} m/s²` }
    ], {
        progressive: true,
        progressT: tEval,
        showValueLabel: true,
        chartType: 'acceleration',
        baselineY: 0
    });

    charts.mruaV.render(pointsV, xRange, getVelocityYRange(pointsV), [
        { t: tEval, val: v(tEval), color: '#fb7185', label: `v = ${v(tEval).toFixed(2)} m/s` }
    ], {
        progressive: true,
        progressT: tEval,
        showValueLabel: true,
        chartType: 'velocity',
        baselineY: 0
    });

    charts.mruaX.render(pointsX, xRange, getPositionYRange(pointsX), [
        { t: tEval, val: x(tEval), color: '#4ade80', label: `x = ${x(tEval).toFixed(2)} m` }
    ], {
        progressive: true,
        progressT: tEval,
        showValueLabel: true,
        chartType: 'position'
    });

    // Sync t_eval slider max
    const tevalSlider = document.getElementById('mrua-teval-slider');
    tevalSlider.max = tMax;
}

// =============================================================================
// 6. SIMULADOR ENCUENTRO EN X
// =============================================================================

function updateEncuentro() {
    const s = state.encuentro;
    
    const xA = (t) => s.xiA + s.viA * t + 0.5 * s.aA * t * t;
    const xB = (t) => s.xiB + s.viB * t + 0.5 * s.aB * t * t;
    const vA = (t) => s.viA + s.aA * t;
    const vB = (t) => s.viB + s.aB * t;

    // Solver Encuentro
    const A = 0.5 * (s.aA - s.aB);
    const B = s.viA - s.viB;
    const C = s.xiA - s.xiB;

    let encuentros = [];
    let note = "";

    if (Math.abs(A) < EPS && Math.abs(B) < EPS) {
        note = Math.abs(C) < EPS ? "Coinciden en todo momento." : "No hay encuentro (separación constante).";
    } else {
        encuentros = solveQuadratic(A, B, C);
        if (encuentros.length === 0) note = "No se detectan encuentros reales.";
    }

    const encList = document.getElementById('encuentros-list');
    encList.innerHTML = '';
    encuentros.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'enc-item';
        const pos = xA(t);
        const inside = (t <= s.tMax) ? "✓" : "out";
        div.textContent = `T${i+1}: ${t.toFixed(2)}s | X: ${pos.toFixed(2)}m [${inside}]`;
        encList.appendChild(div);
    });
    if (note) encList.innerHTML = `<div class="enc-item" style="color: var(--text-muted)">${note}</div>`;

    document.getElementById('encuentro-interpretation').textContent = note || "Se detectaron puntos de intersección en las trayectorias.";

    // Cálculos para el tiempo actual
    const curXA = xA(s.tEval);
    const curXB = xB(s.tEval);
    const curVA = vA(s.tEval);
    const curVB = vB(s.tEval);
    const deltaX = Math.abs(curXA - curXB);

    // Track Visualization
    const markerA = document.getElementById('mobile-a-marker');
    const markerB = document.getElementById('mobile-b-marker');
    const labelA = document.getElementById('mobile-a-label');
    const labelB = document.getElementById('mobile-b-label');
    const sepLine = document.getElementById('track-separation-line');
    const badge = document.getElementById('encounter-badge');
    const trackContainer = document.getElementById('track-container');

    // Gráficos y Tabla
    const pointsA = [], pointsB = [], pointsVA = [], pointsVB = [];
    const tableBody = document.querySelector('#encuentro-table tbody');
    tableBody.innerHTML = '';

    const steps = 100;
    const dt = s.tMax / steps;
    for (let i = 0; i <= steps; i++) {
        const t = i * dt;
        const pA = xA(t);
        const pB = xB(t);
        const velA = vA(t);
        const velB = vB(t);
        
        pointsA.push({ x: t, y: pA });
        pointsB.push({ x: t, y: pB });
        pointsVA.push({ x: t, y: velA });
        pointsVB.push({ x: t, y: velB });

        if (i % 5 === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${t.toFixed(1)}</td><td>${pA.toFixed(2)}</td><td>${pB.toFixed(2)}</td><td>${velA.toFixed(2)}</td><td>${velB.toFixed(2)}</td><td>${Math.abs(pA - pB).toFixed(2)}</td>`;
            tableBody.appendChild(tr);
        }
    }

    // Actualizar Pista con escala dinámica
    const trackRange = getTrackRange(pointsA, pointsB);
    const getPosPct = (val) => {
        const pct = ((val - trackRange.min) / (trackRange.max - trackRange.min)) * 90 + 5;
        return Math.max(0, Math.min(100, pct));
    };

    const pctA = getPosPct(curXA);
    const pctB = getPosPct(curXB);

    markerA.style.left = `${pctA}%`;
    markerB.style.left = `${pctB}%`;
    labelA.style.left = `${pctA}%`;
    labelB.style.left = `${pctB}%`;
    labelA.textContent = `xA=${curXA.toFixed(1)}m`;
    labelB.textContent = `xB=${curXB.toFixed(1)}m`;

    // Línea de separación
    const left = Math.min(pctA, pctB);
    const width = Math.abs(pctA - pctB);
    sepLine.style.left = `${left}%`;
    sepLine.style.width = `${width}%`;
    sepLine.style.display = width > 2 ? 'block' : 'none';

    // Badge y efectos de encuentro
    if (deltaX < 1) {
        badge.classList.remove('hidden');
        trackContainer.classList.add('near-encounter');
    } else {
        badge.classList.add('hidden');
        trackContainer.classList.toggle('near-encounter', deltaX < (trackRange.max - trackRange.min) * 0.05);
    }

    // Actualizar labels de la pista
    document.getElementById('track-min').textContent = `${trackRange.min.toFixed(0)}m`;
    document.getElementById('track-center').textContent = `${((trackRange.min + trackRange.max) / 2).toFixed(0)}m`;
    document.getElementById('track-max').textContent = `${trackRange.max.toFixed(0)}m`;

    // Stats Grid
    document.getElementById('track-xa').textContent = curXA.toFixed(2);
    document.getElementById('track-xb').textContent = curXB.toFixed(2);
    document.getElementById('track-va').textContent = curVA.toFixed(2);
    document.getElementById('track-vb').textContent = curVB.toFixed(2);
    document.getElementById('track-delta').textContent = deltaX.toFixed(2);

    // Renderizar Gráficos
    const xRange = { min: 0, max: s.tMax };
    
    // Gráfico de Posición
    const yRangeX = getPositionYRange([...pointsA, ...pointsB]);
    charts.encuentro.render([pointsA, pointsB], xRange, yRangeX, [
        { t: s.tEval, val: curXA, color: '#4ade80', label: `xA = ${curXA.toFixed(2)} m` },
        { t: s.tEval, val: curXB, color: '#fb7185', label: `xB = ${curXB.toFixed(2)} m` }
    ], {
        progressive: true,
        progressT: s.tEval,
        showValueLabel: true,
        chartType: 'position'
    });

    // Gráfico de Velocidad
    const yRangeV = getVelocityYRange([...pointsVA, ...pointsVB]);
    charts.encuentroV.render([pointsVA, pointsVB], xRange, yRangeV, [
        { t: s.tEval, val: curVA, color: '#4ade80', label: `vA = ${curVA.toFixed(2)} m/s` },
        { t: s.tEval, val: curVB, color: '#fb7185', label: `vB = ${curVB.toFixed(2)} m/s` }
    ], {
        progressive: true,
        progressT: s.tEval,
        showValueLabel: true,
        chartType: 'velocity',
        baselineY: 0
    });

    document.getElementById('enc-teval-slider').max = s.tMax;
}

// =============================================================================
// 7. ANIMACIÓN Y CONTROLES
// =============================================================================

function handleAnimation(type) {
    const sim = state[type];
    const prefix = type === 'mrua' ? 'mrua' : 'enc';
    const updateFn = type === 'mrua' ? updateMRUA : updateEncuentro;

    const playBtn = document.getElementById(`${prefix}-play`);
    const pauseBtn = document.getElementById(`${prefix}-pause`);
    const resetTBtn = document.getElementById(`${prefix}-reset-t`);
    const tevalSlider = document.getElementById(`${prefix}-teval-slider`);
    const tevalNum = document.getElementById(`${prefix}-teval-num`);

    let lastTimestamp = null;

    const animate = (timestamp) => {
        if (!sim.isPlaying) {
            lastTimestamp = null;
            return;
        }

        if (lastTimestamp === null) lastTimestamp = timestamp;
        const elapsed = (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;

        // Ajustar velocidades para que sean más útiles
        // Lento: 0.5, Normal: 1.5, Rápido: 4.0
        let playbackRate = sim.speed;
        if (sim.speed === 1) playbackRate = 1.5;
        if (sim.speed === 2) playbackRate = 4.0;

        sim.tEval += elapsed * playbackRate;

        if (sim.tEval >= sim.tMax) {
            sim.tEval = sim.tMax;
            sim.isPlaying = false;
            lastTimestamp = null;
        }

        tevalSlider.value = sim.tEval;
        tevalNum.value = sim.tEval.toFixed(2);
        updateFn();

        if (sim.isPlaying) {
            sim.animationId = requestAnimationFrame(animate);
        }
    };

    playBtn.onclick = () => {
        if (sim.isPlaying) return;
        if (sim.tEval >= sim.tMax) sim.tEval = 0;
        sim.isPlaying = true;
        lastTimestamp = null; // Reset timestamp para nueva sesión
        sim.animationId = requestAnimationFrame(animate);
    };

    pauseBtn.onclick = () => {
        sim.isPlaying = false;
        cancelAnimationFrame(sim.animationId);
    };

    resetTBtn.onclick = () => {
        sim.isPlaying = false;
        cancelAnimationFrame(sim.animationId);
        sim.tEval = 0;
        tevalSlider.value = 0;
        tevalNum.value = 0;
        updateFn();
    };

    document.getElementById(`${prefix}-speed`).onchange = (e) => {
        sim.speed = parseFloat(e.target.value);
    };

    // Sync manual de tEval
    tevalSlider.oninput = (e) => {
        sim.tEval = parseFloat(e.target.value);
        tevalNum.value = sim.tEval.toFixed(2);
        updateFn();
    };
    tevalNum.oninput = (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val)) return;
        sim.tEval = Math.max(0, Math.min(sim.tMax, val));
        tevalSlider.value = sim.tEval;
        updateFn();
    };
}

function resetSim(type) {
    if (type === 'mrua') {
        state.mrua = { a: 10, vi: -30, xi: 0, tMax: 10, tEval: 3, isPlaying: false, speed: 1 };
        // Sync UI
        document.getElementById('mrua-a-slider').value = 10; document.getElementById('mrua-a-num').value = 10;
        document.getElementById('mrua-vi-slider').value = -30; document.getElementById('mrua-vi-num').value = -30;
        document.getElementById('mrua-xi-slider').value = 0; document.getElementById('mrua-xi-num').value = 0;
        document.getElementById('mrua-tmax-slider').value = 10; document.getElementById('mrua-tmax-num').value = 10;
        document.getElementById('mrua-teval-slider').value = 3; document.getElementById('mrua-teval-num').value = 3;
        updateMRUA();
    } else {
        state.encuentro = { aA: -10, viA: 100, xiA: 2000, aB: 10, viB: 0, xiB: 0, tMax: 50, tEval: 20, isPlaying: false, speed: 1 };
        // Sync UI - A
        document.getElementById('enc-aa-slider').value = -10; document.getElementById('enc-aa-num').value = -10;
        document.getElementById('enc-via-slider').value = 100; document.getElementById('enc-via-num').value = 100;
        document.getElementById('enc-xia-slider').value = 2000; document.getElementById('enc-xia-num').value = 2000;
        // Sync UI - B
        document.getElementById('enc-ab-slider').value = 10; document.getElementById('enc-ab-num').value = 10;
        document.getElementById('enc-vib-slider').value = 0; document.getElementById('enc-vib-num').value = 0;
        document.getElementById('enc-xib-slider').value = 0; document.getElementById('enc-xib-num').value = 0;
        // Global
        document.getElementById('enc-tmax-slider').value = 50; document.getElementById('enc-tmax-num').value = 50;
        document.getElementById('enc-teval-slider').value = 20; document.getElementById('enc-teval-num').value = 20;
        updateEncuentro();
    }
}

// =============================================================================
// 8. EXPORTACIÓN CSV
// =============================================================================

function exportTable(type) {
    const table = document.getElementById(type === 'mrua' ? 'mrua-table' : 'encuentro-table');
    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    for (const row of rows) {
        const cols = row.querySelectorAll('th, td');
        const rowData = Array.from(cols).map(c => c.textContent).join(',');
        csv.push(rowData);
    }
    
    const csvString = csv.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fisica_2026_${type}_${new Date().getTime()}.csv`;
    a.click();
}

// =============================================================================
// 9. INICIALIZACIÓN
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();

    // Setup MRUA Controls
    syncInputsMapped('mrua', 'a', state.mrua, 'a', updateMRUA);
    syncInputsMapped('mrua', 'vi', state.mrua, 'vi', updateMRUA);
    syncInputsMapped('mrua', 'xi', state.mrua, 'xi', updateMRUA);
    syncInputsMapped('mrua', 'tmax', state.mrua, 'tMax', updateMRUA);
    syncInputsMapped('mrua', 'teval', state.mrua, 'tEval', updateMRUA);
    handleAnimation('mrua');

    // Setup Encuentro Controls
    syncInputsMapped('enc', 'aa', state.encuentro, 'aA', updateEncuentro);
    syncInputsMapped('enc', 'via', state.encuentro, 'viA', updateEncuentro);
    syncInputsMapped('enc', 'xia', state.encuentro, 'xiA', updateEncuentro);
    syncInputsMapped('enc', 'ab', state.encuentro, 'aB', updateEncuentro);
    syncInputsMapped('enc', 'vib', state.encuentro, 'viB', updateEncuentro);
    syncInputsMapped('enc', 'xib', state.encuentro, 'xiB', updateEncuentro);
    syncInputsMapped('enc', 'tmax', state.encuentro, 'tMax', updateEncuentro);
    syncInputsMapped('enc', 'teval', state.encuentro, 'tEval', updateEncuentro);
    handleAnimation('encuentro');

    // Inicializar botones de ajuste fino
    initStepperControls();

    // Tab switching para Encuentro
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
        };
    });

    // Primera ejecución
    updateMRUA();
    updateEncuentro();
});

// =============================================================================
// 7. SIMULADOR DE TIRO OBLICUO
// =============================================================================

/**
 * CLASE: VerticalSimulator
 * Maneja Caída Libre y Tiro Vertical
 */
class VerticalSimulator {
    constructor() {
        this.initElements();
        this.initVariables();
        this.setupEventListeners();
        this.initCanvas();
    }

    initElements() {
        this.modeSelect = document.getElementById('vertical-mode');
        this.gravitySelect = document.getElementById('vertical-gravity-select');
        this.gravityNum = document.getElementById('vertical-gravity-num');
        this.gravityCustomContainer = document.getElementById('vertical-gravity-custom-container');

        this.btns = {
            simulate: document.getElementById('vertical-btn-simulate'),
            animate: document.getElementById('vertical-btn-animate'),
            pause: document.getElementById('vertical-btn-pause'),
            reset: document.getElementById('vertical-reset'),
            save: document.getElementById('vertical-btn-save'),
            clear: document.getElementById('vertical-btn-clear'),
            export: document.getElementById('vertical-export')
        };

        this.res = {
            yi: document.getElementById('vertical-res-yi'),
            viy: document.getElementById('vertical-res-viy'),
            tTotal: document.getElementById('vertical-res-t-total'),
            ymax: document.getElementById('vertical-res-ymax'),
            tYmax: document.getElementById('vertical-res-t-ymax'),
            vfy: document.getElementById('vertical-res-vfy'),
            vmod: document.getElementById('vertical-res-vmod'),
            g: document.getElementById('vertical-res-g')
        };

        this.tableBody = document.getElementById('vertical-table-body');
        this.animStatus = document.getElementById('vertical-status');
        this.currentTDisplay = document.getElementById('vertical-current-t');
        this.canvas = document.getElementById('vertical-canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    initVariables() {
        this.params = { yi: 50, viy: 0, g: 9.81, tmax: 5 };
        this.trajectory = [];
        this.savedTrajectories = [];
        this.isAnimating = false;
        this.animationId = null;
        this.animT = 0;
        this.results = {};
        this.canvasPadding = 45;
    }

    setupEventListeners() {
        const update = () => this.simulate();
        
        syncInputsMapped('vertical', 'yi', this.params, 'yi', update);
        syncInputsMapped('vertical', 'viy', this.params, 'viy', update);
        syncInputsMapped('vertical', 'tmax', this.params, 'tmax', update);

        this.modeSelect.addEventListener('change', () => {
            if (this.modeSelect.value === 'caida') {
                this.setValues({ yi: 50, viy: 0 });
            } else {
                this.setValues({ yi: 0, viy: 20 });
            }
        });

        this.gravitySelect.addEventListener('change', () => {
            const val = this.gravitySelect.value;
            if (val === 'custom') {
                this.gravityCustomContainer.classList.remove('hidden');
                this.params.g = parseFloat(this.gravityNum.value);
            } else {
                this.gravityCustomContainer.classList.add('hidden');
                this.params.g = parseFloat(val);
            }
            update();
        });

        this.gravityNum.addEventListener('input', () => {
            this.params.g = parseFloat(this.gravityNum.value);
            update();
        });

        this.btns.simulate.addEventListener('click', update);
        this.btns.animate.addEventListener('click', () => this.startAnimation());
        this.btns.pause.addEventListener('click', () => this.stopAnimation());
        this.btns.reset.addEventListener('click', () => this.reset());
        this.btns.save.addEventListener('click', () => this.saveTrajectory());
        this.btns.clear.addEventListener('click', () => this.clearTrajectories());
        this.btns.export.addEventListener('click', () => this.exportCSV());
    }

    setValues(config) {
        if (config.yi !== undefined) {
            this.params.yi = config.yi;
            document.getElementById('vertical-yi-slider').value = config.yi;
            document.getElementById('vertical-yi-num').value = config.yi;
        }
        if (config.viy !== undefined) {
            this.params.viy = config.viy;
            document.getElementById('vertical-viy-slider').value = config.viy;
            document.getElementById('vertical-viy-num').value = config.viy;
        }
        this.simulate();
    }

    simulate() {
        this.stopAnimation();
        this.calculatePhysics();
        this.updateUI();
        this.draw();
    }

    calculatePhysics() {
        const { yi, viy, g } = this.params;
        
        // Quadratic: -0.5*g*t^2 + viy*t + yi = 0
        let tTotal = 0;
        if (yi === 0 && viy === 0) {
            tTotal = 0;
        } else {
            const disc = viy**2 + 2 * g * yi;
            tTotal = (viy + Math.sqrt(Math.max(0, disc))) / g;
        }

        const tYmax = viy > 0 ? viy / g : 0;
        const yMax = viy > 0 ? yi + (viy**2) / (2 * g) : yi;
        const vfy = viy - g * tTotal;

        this.results = {
            yi, viy, tTotal, tYmax, yMax, vfy,
            vmod: Math.abs(vfy),
            g
        };

        this.trajectory = [];
        const steps = 100;
        for (let i = 0; i <= steps; i++) {
            const t = (tTotal / steps) * i;
            const y = Math.max(0, yi + viy * t - 0.5 * g * t**2);
            const v = viy - g * t;
            this.trajectory.push({ t, y, v, vm: Math.abs(v) });
        }
    }

    updateUI() {
        const r = this.results;
        this.res.yi.textContent = r.yi.toFixed(2);
        this.res.viy.textContent = r.viy.toFixed(2);
        this.res.tTotal.textContent = r.tTotal.toFixed(2);
        this.res.ymax.textContent = r.yMax.toFixed(2);
        this.res.tYmax.textContent = r.tYmax.toFixed(2);
        this.res.vfy.textContent = r.vfy.toFixed(2);
        this.res.vmod.textContent = r.vmod.toFixed(2);
        this.res.g.textContent = r.g.toFixed(2);

        this.tableBody.innerHTML = '';
        this.trajectory.forEach((p, i) => {
            if (i % 5 === 0 || i === this.trajectory.length - 1) {
                const row = document.createElement('tr');
                row.innerHTML = `<td>${p.t.toFixed(2)}</td><td>${p.y.toFixed(2)}</td><td>${p.v.toFixed(2)}</td><td>${p.vm.toFixed(2)}</td>`;
                this.tableBody.appendChild(row);
            }
        });
    }

    initCanvas() {
        const resize = () => this.resizeCanvas();
        window.addEventListener('resize', resize);
        new ResizeObserver(() => {
            if (this.canvas.offsetParent !== null) resize();
        }).observe(document.getElementById('vertical-canvas-wrapper'));
    }

    resizeCanvas() {
        const container = document.getElementById('vertical-canvas-wrapper');
        if (!container || !this.canvas) return;
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0) return;
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.draw();
    }

    draw(animatedPoint = null) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (w === 0 || h === 0) return;

        ctx.clearRect(0, 0, w, h);
        const padding = this.canvasPadding;

        const tMax = Math.max(this.params.tmax, this.results.tTotal, 1);
        let yMax = this.results.yMax;
        this.savedTrajectories.forEach(st => yMax = Math.max(yMax, st.results.yMax));
        yMax = Math.max(10, yMax * 1.15);

        const scaleX = (w - padding * 2) / tMax;
        const scaleY = (h - padding * 2) / yMax;

        const worldToScreen = (t, y) => ({
            x: padding + t * scaleX,
            y: h - padding - y * scaleY
        });

        // Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.font = '10px Inter';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';

        const tStep = this.getStepSize(tMax);
        for (let t = 0; t <= tMax; t += tStep) {
            const p = worldToScreen(t, 0);
            ctx.beginPath(); ctx.moveTo(p.x, padding); ctx.lineTo(p.x, h - padding + 5); ctx.stroke();
            ctx.fillText(t.toFixed(1) + 's', p.x - 10, h - padding + 20);
        }

        const yStep = this.getStepSize(yMax);
        for (let y = 0; y <= yMax; y += yStep) {
            const p = worldToScreen(0, y);
            ctx.beginPath(); ctx.moveTo(padding - 5, p.y); ctx.lineTo(w - padding, p.y); ctx.stroke();
            ctx.fillText(y.toFixed(0) + 'm', padding - 35, p.y + 4);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, h - padding); ctx.lineTo(w - padding, h - padding); ctx.stroke();

        this.savedTrajectories.forEach((st, idx) => {
            this.drawTrajectory(ctx, st.points, `rgba(148, 163, 184, ${0.15 + idx * 0.1})`, 2, worldToScreen);
        });

        this.drawTrajectory(ctx, this.trajectory, '#38bdf8', 4, worldToScreen);
        this.drawMarkers(ctx, worldToScreen, padding, tMax, yMax);

        if (animatedPoint) {
            const p = worldToScreen(animatedPoint.t, animatedPoint.y);
            ctx.shadowBlur = 15; ctx.shadowColor = '#38bdf8'; ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    getStepSize(range) {
        if (range <= 1) return 0.2;
        if (range <= 5) return 1;
        if (range <= 20) return 5;
        if (range <= 50) return 10;
        if (range <= 200) return 20;
        return 50;
    }

    drawTrajectory(ctx, points, color, width, worldToScreen) {
        if (points.length < 2) return;
        ctx.strokeStyle = color; ctx.lineWidth = width;
        ctx.beginPath();
        const start = worldToScreen(points[0].t, points[0].y);
        ctx.moveTo(start.x, start.y);
        points.forEach(p => {
            const s = worldToScreen(p.t, p.y);
            ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
    }

    drawMarkers(ctx, worldToScreen, padding, tMax, yMax) {
        const r = this.results;
        if (r.tYmax > 0 && r.tYmax < r.tTotal) {
            ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)'; ctx.lineWidth = 1;
            const py = worldToScreen(r.tYmax, r.yMax);
            ctx.beginPath(); ctx.moveTo(padding, py.y); ctx.lineTo(py.x, py.y); ctx.lineTo(py.x, h - padding); ctx.stroke();
            ctx.setLineDash([]); ctx.font = 'bold 14px Outfit'; ctx.fillStyle = '#fbbf24';
            ctx.fillText(`Ymax: ${r.yMax.toFixed(1)}m`, py.x + 5, py.y - 5);
        }
    }

    startAnimation() {
        this.stopAnimation();
        this.isAnimating = true;
        this.animT = 0;
        this.btns.animate.classList.add('hidden');
        this.btns.pause.classList.remove('hidden');
        this.animStatus.textContent = 'Animando...';
        this.animStatus.style.color = 'var(--accent-blue)';

        const step = (timestamp) => {
            if (!this.isAnimating) return;
            if (!this.startTime) this.startTime = timestamp;
            const progress = (timestamp - this.startTime) / 1000;
            this.animT = progress;

            if (this.animT >= this.results.tTotal) {
                this.animT = this.results.tTotal;
                this.draw(this.trajectory[this.trajectory.length - 1]);
                this.stopAnimation();
                return;
            }

            const p = this.getPointAt(this.animT);
            this.currentTDisplay.textContent = `t: ${this.animT.toFixed(2)}s`;
            this.draw(p);
            this.animationId = requestAnimationFrame(step);
        };
        this.startTime = 0;
        this.animationId = requestAnimationFrame(step);
    }

    getPointAt(t) {
        const { yi, viy, g } = this.params;
        const y = Math.max(0, yi + viy * t - 0.5 * g * t**2);
        return { t, y };
    }

    stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.btns.animate.classList.remove('hidden');
        this.btns.pause.classList.add('hidden');
        this.animStatus.textContent = 'Listo';
        this.animStatus.style.color = 'var(--accent-green)';
    }

    reset() {
        this.modeSelect.value = 'caida';
        this.setValues({ yi: 50, viy: 0 });
        this.params.tmax = 5;
        document.getElementById('vertical-tmax-slider').value = 5;
        document.getElementById('vertical-tmax-num').value = 5;
        this.gravitySelect.value = "9.81";
        this.gravityCustomContainer.classList.add('hidden');
        this.clearTrajectories();
        this.simulate();
    }

    saveTrajectory() {
        if (this.savedTrajectories.length >= 5) this.savedTrajectories.shift();
        this.savedTrajectories.push({ points: [...this.trajectory], results: { ...this.results } });
        this.draw();
    }

    clearTrajectories() {
        this.savedTrajectories = [];
        this.draw();
    }

    exportCSV() {
        let csv = "t (s),y (m),v (m/s)\n";
        this.trajectory.forEach(p => csv += `${p.t.toFixed(4)},${p.y.toFixed(4)},${p.v.toFixed(4)}\n`);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "simulacion_vertical.csv";
        link.click();
    }
}

class ProjectileSimulator {
    constructor() {
        this.canvasPadding = 60;
        this.initElements();
        this.initVariables();
        this.setupEventListeners();
        this.initCanvas();
        
        // Initial simulation
        this.simulate();
    }

    initElements() {
        this.gravitySelect = document.getElementById('projectile-gravity-select');
        this.gravityNum = document.getElementById('projectile-gravity-num');
        this.gravityCustomContainer = document.getElementById('projectile-gravity-custom-container');

        // Buttons
        this.btns = {
            simulate: document.getElementById('projectile-btn-simulate'),
            animate: document.getElementById('projectile-btn-animate'),
            pause: document.getElementById('projectile-btn-pause'),
            reset: document.getElementById('projectile-reset'),
            save: document.getElementById('projectile-btn-save'),
            clear: document.getElementById('projectile-btn-clear'),
            export: document.getElementById('projectile-export')
        };

        // Results
        this.res = {
            vfx: document.getElementById('projectile-res-vfx'),
            vfyInit: document.getElementById('projectile-res-vfy-init'),
            tYmax: document.getElementById('projectile-res-t-ymax'),
            ymax: document.getElementById('projectile-res-ymax'),
            xYmax: document.getElementById('projectile-res-x-ymax'),
            tTotal: document.getElementById('projectile-res-t-total'),
            xmax: document.getElementById('projectile-res-xmax'),
            vfyFinal: document.getElementById('projectile-res-vfy-final'),
            vMod: document.getElementById('projectile-res-vmod')
        };

        // UI Extras
        this.tableBody = document.getElementById('projectile-table-body');
        this.animStatus = document.getElementById('projectile-status');
        this.currentTDisplay = document.getElementById('projectile-current-t');
        this.canvas = document.getElementById('projectile-canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    initVariables() {
        this.params = {
            alpha: 30,
            vi: 20,
            xi: 0,
            yi: 10,
            g: 9.81,
            tmax: 10
        };

        this.tmaxInitialized = false;

        this.trajectory = [];
        this.savedTrajectories = [];
        this.isAnimating = false;
        this.animationId = null;
        this.animT = 0;
        this.startTime = 0;
        this.results = {};
        this.canvasPadding = 40;
    }

    resizeCanvas() {
        const container = document.getElementById('projectile-canvas-wrapper');
        if (!container || !this.canvas) return;
        
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            // Retry if still hidden
            if (this.canvas.offsetParent !== null) {
                requestAnimationFrame(() => this.resizeCanvas());
            }
            return;
        }

        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.draw();
    }

    setPreset(config) {
        // Obsoleto - Usar VerticalSimulator para caída libre
    }

    initCanvas() {
        const resize = () => {
            const container = document.getElementById('projectile-canvas-wrapper');
            if (!container || container.clientWidth === 0) return;
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
            this.draw();
        };
        window.addEventListener('resize', resize);
        
        // Use MutationObserver or ResizeObserver to detect when section becomes visible
        const observer = new ResizeObserver(() => {
            if (this.canvas.offsetParent !== null) resize();
        });
        observer.observe(document.getElementById('projectile-canvas-wrapper'));
        
        resize();
    }

    setupEventListeners() {
        const update = () => this.simulate();

        syncInputsMapped('projectile', 'angle', this.params, 'alpha', update);
        syncInputsMapped('projectile', 'vi', this.params, 'vi', update);
        syncInputsMapped('projectile', 'xi', this.params, 'xi', update);
        syncInputsMapped('projectile', 'yi', this.params, 'yi', update);
        syncInputsMapped('projectile', 'tmax', this.params, 'tmax', update);

        // Gravity
        this.gravitySelect.addEventListener('change', () => {
            if (this.gravitySelect.value === 'custom') {
                this.gravityCustomContainer.classList.remove('hidden');
                this.params.g = parseFloat(this.gravityNum.value);
            } else {
                this.gravityCustomContainer.classList.add('hidden');
                this.params.g = parseFloat(this.gravitySelect.value);
            }
            this.simulate();
        });

        this.gravityNum.addEventListener('input', () => {
            this.params.g = parseFloat(this.gravityNum.value) || 0.1;
            this.simulate();
        });

        // Buttons
        this.btns.simulate.addEventListener('click', () => this.simulate());
        this.btns.animate.addEventListener('click', () => this.startAnimation());
        this.btns.pause.addEventListener('click', () => this.togglePause());
        this.btns.reset.addEventListener('click', () => this.reset());
        this.btns.save.addEventListener('click', () => this.saveTrajectory());
        this.btns.clear.addEventListener('click', () => this.clearTrajectories());
        this.btns.export.addEventListener('click', () => this.exportCSV());
    }

    simulate() {
        this.stopAnimation();
        this.calculatePhysics();
        this.updateUI();
        this.draw();
    }

    calculatePhysics() {
        const { alpha, vi, xi, yi, g } = this.params;
        const rad = alpha * (Math.PI / 180);
        
        const vix = vi * Math.cos(rad);
        const viy = vi * Math.sin(rad);

        let tTotal = 0;
        if (vi === 0 && yi === 0) {
            tTotal = 0;
        } else {
            tTotal = (viy + Math.sqrt(Math.max(0, viy**2 + 2 * g * yi))) / g;
        }

        const tYmax = viy / g;
        const yMax = yi + (viy**2) / (2 * g);
        const xYmax = xi + vix * Math.max(0, tYmax);
        const xMax = xi + vix * tTotal;

        this.results = {
            vix, viy, tTotal, tYmax, yMax, xYmax, xMax,
            vfxFinal: vix,
            vfyFinal: viy - g * tTotal,
            vModFinal: Math.sqrt(vix**2 + (viy - g * tTotal)**2)
        };

        // Auto-set tmax on first run or if it's too small
        if (!this.tmaxInitialized) {
            this.params.tmax = Math.max(5, Math.ceil(tTotal));
            const slider = document.getElementById('projectile-tmax-slider');
            const num = document.getElementById('projectile-tmax-num');
            if (slider) slider.value = this.params.tmax;
            if (num) num.value = this.params.tmax;
            this.tmaxInitialized = true;
        }

        this.trajectory = [];
        const steps = 100;
        for (let i = 0; i <= steps; i++) {
            const t = (tTotal / steps) * i;
            this.trajectory.push(this.getPointAtTime(t));
        }
    }

    getPointAtTime(t) {
        const { alpha, vi, xi, yi, g } = this.params;
        const rad = alpha * (Math.PI / 180);
        const vix = vi * Math.cos(rad);
        const viy = vi * Math.sin(rad);

        const x = xi + vix * t;
        const y = Math.max(0, yi + viy * t - 0.5 * g * t**2);
        const vx = vix;
        const vy = viy - g * t;
        const vm = Math.sqrt(vx**2 + vy**2);

        return { t, x, y, vx, vy, vm };
    }

    updateUI() {
        this.res.vfx.textContent = this.results.vix.toFixed(2);
        this.res.vfyInit.textContent = this.results.viy.toFixed(2);
        this.res.tYmax.textContent = Math.max(0, this.results.tYmax).toFixed(2);
        this.res.ymax.textContent = this.results.yMax.toFixed(2);
        this.res.xYmax.textContent = this.results.xYmax.toFixed(2);
        this.res.tTotal.textContent = this.results.tTotal.toFixed(2);
        this.res.xmax.textContent = this.results.xMax.toFixed(2);
        this.res.vfyFinal.textContent = this.results.vfyFinal.toFixed(2);
        this.res.vMod.textContent = this.results.vModFinal.toFixed(2);

        this.tableBody.innerHTML = '';
        this.trajectory.forEach((p, i) => {
            if (i % 5 === 0 || i === this.trajectory.length - 1) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${p.t.toFixed(2)}</td>
                    <td>${p.x.toFixed(2)}</td>
                    <td>${p.y.toFixed(2)}</td>
                    <td>${p.vx.toFixed(2)}</td>
                    <td>${p.vy.toFixed(2)}</td>
                    <td>${p.vm.toFixed(2)}</td>
                `;
                this.tableBody.appendChild(row);
            }
        });
    }

    draw(animatedPoint = null) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (w === 0 || h === 0) return;

        ctx.clearRect(0, 0, w, h);

        const padding = this.canvasPadding;
        
        // Calculate bounds based on ALL points
        let minX = this.params.xi;
        let maxX = this.params.xi;
        let minY = 0;
        let maxY = this.params.yi;

        const effectiveTimeMax = Math.max(this.params.tmax, this.results.tTotal);
        const xAtEffectiveT = this.params.xi + this.results.vix * effectiveTimeMax;
        
        this.trajectory.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        maxX = Math.max(maxX, xAtEffectiveT);

        this.savedTrajectories.forEach(st => {
            st.points.forEach(p => {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
        });

        // Robust windowing for vertical cases
        if (Math.abs(maxX - minX) < 1e-6) {
            const padX = Math.max(10, Math.abs(minX) * 0.2);
            minX -= padX;
            maxX += padX;
        } else {
            const padX = (maxX - minX) * 0.1;
            minX -= padX;
            maxX += padX;
        }

        if (Math.abs(maxY - minY) < 1e-6) {
            maxY = 10;
        } else {
            maxY *= 1.15;
        }

        const plotW = w - padding * 2;
        const plotH = h - padding * 2;

        const scaleX = plotW / (maxX - minX);
        const scaleY = plotH / (maxY - minY);

        const worldToScreen = (x, y) => ({
            x: padding + (x - minX) * scaleX,
            y: h - padding - (y - minY) * scaleY
        });

        this.drawGrid(ctx, w, h, padding, scaleX, scaleY, minX, maxX, minY, maxY, worldToScreen);

        this.savedTrajectories.forEach((st, idx) => {
            this.drawTrajectory(ctx, st.points, `rgba(148, 163, 184, ${0.15 + idx * 0.1})`, 2, worldToScreen);
        });

        this.drawTrajectory(ctx, this.trajectory, '#38bdf8', 4, worldToScreen);
        this.drawMarkers(ctx, worldToScreen, padding);

        if (animatedPoint) {
            const pos = worldToScreen(animatedPoint.x, animatedPoint.y);
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#38bdf8';
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    drawGrid(ctx, w, h, padding, scaleX, scaleY, minX, maxX, minY, maxY, worldToScreen) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.font = '10px Inter';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';

        const xStep = this.getStepSize(maxX - minX);
        const startX = Math.floor(minX / xStep) * xStep;
        for (let x = startX; x <= maxX; x += xStep) {
            const p = worldToScreen(x, 0);
            ctx.beginPath();
            ctx.moveTo(p.x, padding);
            ctx.lineTo(p.x, h - padding + 5);
            ctx.stroke();
            ctx.fillText(x.toFixed(0), p.x - 5, h - padding + 20);
        }

        const yStep = this.getStepSize(maxY - minY);
        for (let y = 0; y <= maxY; y += yStep) {
            const p = worldToScreen(minX, y);
            ctx.beginPath();
            ctx.moveTo(padding - 5, p.y);
            ctx.lineTo(w - padding, p.y);
            ctx.stroke();
            ctx.fillText(y.toFixed(0), padding - 30, p.y + 4);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, h - padding);
        ctx.lineTo(w - padding, h - padding);
        ctx.stroke();
    }

    getStepSize(max) {
        if (max < 10) return 1;
        if (max < 50) return 5;
        if (max < 200) return 20;
        return 50;
    }

    drawTrajectory(ctx, points, color, width, worldToScreen) {
        if (points.length < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        const start = worldToScreen(points[0].x, points[0].y);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < points.length; i++) {
            const p = worldToScreen(points[i].x, points[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    drawMarkers(ctx, worldToScreen, padding) {
        const { xMax, yMax, xYmax } = this.results;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
        ctx.lineWidth = 1;

        const py = worldToScreen(xYmax, yMax);
        ctx.beginPath();
        ctx.moveTo(worldToScreen(0, yMax).x, py.y);
        ctx.lineTo(py.x, py.y);
        ctx.lineTo(py.x, worldToScreen(xYmax, 0).y);
        ctx.stroke();

        const px = worldToScreen(xMax, 0);
        ctx.beginPath();
        ctx.moveTo(px.x, px.y);
        ctx.lineTo(px.x, worldToScreen(xMax, 0).y - 20);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.font = 'bold 15px Outfit, sans-serif';
        ctx.fillStyle = '#fbbf24'; // Intense amber
        
        // Shadow for better legibility against grid
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        
        ctx.fillText(`Ymax: ${yMax.toFixed(1)}m`, padding + 10, py.y - 10);
        ctx.fillText(`Xmax: ${xMax.toFixed(1)}m`, px.x - 40, px.y - 15);
        
        ctx.shadowBlur = 0;
    }

    startAnimation() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.animT = 0;
        this.startTime = performance.now();
        this.btns.animate.classList.add('hidden');
        this.btns.pause.classList.remove('hidden');
        this.btns.pause.textContent = '⏸ Pausar';
        this.animStatus.textContent = 'Animando...';
        this.animStatus.style.color = 'var(--accent-amber)';
        
        const step = (timestamp) => {
            if (!this.isAnimating) return;
            const elapsed = (timestamp - this.startTime) / 1000;
            this.animT = elapsed;

            if (this.animT >= this.results.tTotal) {
                this.animT = this.results.tTotal;
                this.draw(this.getPointAtTime(this.animT));
                this.stopAnimation();
                return;
            }

            const p = this.getPointAtTime(this.animT);
            this.currentTDisplay.textContent = `t: ${this.animT.toFixed(2)}s`;
            this.draw(p);
            this.animationId = requestAnimationFrame(step);
        };
        this.animationId = requestAnimationFrame(step);
    }

    togglePause() {
        if (this.isAnimating) {
            this.isAnimating = false;
            cancelAnimationFrame(this.animationId);
            this.btns.pause.textContent = '▶ Continuar';
            this.animStatus.textContent = 'Pausado';
        } else {
            this.isAnimating = true;
            this.startTime = performance.now() - this.animT * 1000;
            this.btns.pause.textContent = '⏸ Pausar';
            this.animStatus.textContent = 'Animando...';
            this.animationId = requestAnimationFrame((t) => this.startAnimationFrom(t));
        }
    }

    startAnimationFrom(timestamp) {
        const step = (now) => {
            if (!this.isAnimating) return;
            const elapsed = (now - this.startTime) / 1000;
            this.animT = elapsed;
            if (this.animT >= this.results.tTotal) {
                this.animT = this.results.tTotal;
                this.draw(this.getPointAtTime(this.animT));
                this.stopAnimation();
                return;
            }
            const p = this.getPointAtTime(this.animT);
            this.currentTDisplay.textContent = `t: ${this.animT.toFixed(2)}s`;
            this.draw(p);
            this.animationId = requestAnimationFrame(step);
        };
        this.animationId = requestAnimationFrame(step);
    }

    stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.btns.animate.classList.remove('hidden');
        this.btns.pause.classList.add('hidden');
        this.animStatus.textContent = 'Listo';
        this.animStatus.style.color = 'var(--accent-green)';
    }

    reset() {
        this.params = { alpha: 30, vi: 20, xi: 0, yi: 10, g: 9.81, tmax: 10 };
        this.tmaxInitialized = false;
        
        const updateVal = (id, val) => {
            const slider = document.getElementById(`projectile-${id}-slider`);
            const num = document.getElementById(`projectile-${id}-num`);
            if (slider) slider.value = val;
            if (num) num.value = val;
        };
        updateVal('angle', 30);
        updateVal('vi', 20);
        updateVal('xi', 0);
        updateVal('yi', 10);
        updateVal('tmax', 10);
        
        this.gravitySelect.value = "9.81";
        this.gravityCustomContainer.classList.add('hidden');

        // Clear badge
        const badge = document.getElementById('projectile-preset-badge');
        if (badge) badge.classList.add('hidden');

        this.clearTrajectories();
        this.simulate();
    }

    saveTrajectory() {
        if (this.savedTrajectories.length >= 5) this.savedTrajectories.shift();
        this.savedTrajectories.push({
            points: [...this.trajectory],
            results: { ...this.results }
        });
        this.draw();
    }

    clearTrajectories() {
        this.savedTrajectories = [];
        this.draw();
    }

    exportCSV() {
        let csv = "t (s),X (m),Y (m),Vx (m/s),Vy (m/s),|V| (m/s)\n";
        this.trajectory.forEach(p => {
            csv += `${p.t.toFixed(4)},${p.x.toFixed(4)},${p.y.toFixed(4)},${p.vx.toFixed(4)},${p.vy.toFixed(4)},${p.vm.toFixed(4)}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = "simulacion_tiro_oblicuo.csv";
        link.click();
    }
}

// Exponer funciones globales
window.resetSim = resetSim;
window.exportTable = exportTable;
