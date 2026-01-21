// =========================
// FILE: js/components/charts.js
// =========================
/**
 * Charts - Chart.js
 * CAUSA: Pizza (Top 10) + lista clicável com scroll (todas, exceto bloqueadas)
 * ALIMENTADOR: Radar (Top 5) + lista clicável com scroll (todas)
 */

import { openModal, fillDetailsModal } from './modal.js';

let chartCausa = null;
let chartAlimentador = null;

function normalizeKey(k) {
  return String(k || '').trim().toLowerCase().replace(/\./g, '');
}

function getFieldValue(row, fieldName) {
  if (!row) return '';
  if (row[fieldName] != null) return row[fieldName];

  const target = normalizeKey(fieldName);
  const foundKey = Object.keys(row).find(k => normalizeKey(k) === target);
  if (foundKey) return row[foundKey];
  return '';
}

/** Causas a remover do card de CAUSA (case-insensitive) */
const CAUSAS_BLOQUEADAS = new Set([
  'defeito em conexao ramal concentrico',
  'defeito em conexao',
  'defeito em ramal de ligação',
  'defeito em ramal de ligacao',
  'defeito em conexao de medidor'
].map(x => x.trim().toLowerCase()));

function buildRankingWithOccur(data, field) {
  const counts = new Map();
  const ocorrMap = new Map();

  data.forEach(row => {
    const valueRaw = String(getFieldValue(row, field) || '').trim();
    if (!valueRaw) return;

    // Filtro especial para CAUSA
    if (normalizeKey(field) === 'causa') {
      const v = valueRaw.trim().toLowerCase();
      if (CAUSAS_BLOQUEADAS.has(v)) return;
    }

    counts.set(valueRaw, (counts.get(valueRaw) || 0) + 1);

    if (!ocorrMap.has(valueRaw)) ocorrMap.set(valueRaw, []);
    ocorrMap.get(valueRaw).push(row);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, ocorrencias: ocorrMap.get(name) }))
    .sort((a, b) => b.count - a.count);
}

function openDetails(tipo, nome, ocorrencias) {
  const modalContent = document.getElementById('detalhesConteudo');
  let selectedColumns = [];

  if (modalContent && modalContent.dataset.selectedColumns) {
    try { selectedColumns = JSON.parse(modalContent.dataset.selectedColumns); }
    catch { selectedColumns = []; }
  }

  const modalTitle = document.getElementById('detalhesTitulo');
  if (modalTitle) modalTitle.textContent = `${tipo}: ${nome}`;

  fillDetailsModal(nome, ocorrencias, selectedColumns);
  openModal('modalDetalhes');
}

/** Util: escolher texto branco/preto conforme cor de fundo */
function getReadableTextColor(hex) {
  try {
    const h = String(hex || '').replace('#', '').trim();
    if (h.length !== 6) return '#FFFFFF';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // luminância perceptual
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.62 ? '#1A1F2E' : '#FFFFFF';
  } catch {
    return '#FFFFFF';
  }
}

/**
 * Plugin local: escreve % nas fatias do gráfico de pizza
 * (sem depender de chartjs-plugin-datalabels)
 */
const piePercentLabelsPlugin = {
  id: 'piePercentLabelsPlugin',
  afterDatasetsDraw(chart, args, pluginOptions) {
    if (!chart || chart.config?.type !== 'pie') return;

    const datasetIndex = 0;
    const meta = chart.getDatasetMeta(datasetIndex);
    if (!meta || !meta.data || !meta.data.length) return;

    const dataset = chart.data?.datasets?.[datasetIndex];
    const data = Array.isArray(dataset?.data) ? dataset.data : [];
    const bg = Array.isArray(dataset?.backgroundColor) ? dataset.backgroundColor : [];

    const total = data.reduce((acc, v) => acc + (Number(v) || 0), 0);
    if (!total) return;

    const ctx = chart.ctx;
    ctx.save();

    // Opções
    const minPctToShow = pluginOptions?.minPctToShow ?? 4; // não polui fatia pequena
    const fontSize = pluginOptions?.fontSize ?? 12;
    const fontWeight = pluginOptions?.fontWeight ?? 800;
    const fontFamily = pluginOptions?.fontFamily ?? "'Inter', 'Segoe UI', sans-serif";

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    meta.data.forEach((arcEl, i) => {
      const value = Number(data[i]) || 0;
      if (!value) return;

      const pct = (value / total) * 100;
      if (pct < minPctToShow) return;

      // Centro da fatia
      const center = arcEl.getCenterPoint ? arcEl.getCenterPoint() : null;
      if (!center) return;

      const label = `${pct.toFixed(0)}%`;
      const bgColor = bg[i] || '#0A4A8C';

      // Borda/sombra leve para legibilidade
      ctx.fillStyle = getReadableTextColor(bgColor);
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;

      ctx.fillText(label, center.x, center.y);
    });

    ctx.restore();
  }
};

/**
 * Lista com scroll (com indicador de cor opcional por item)
 */
function renderScrollList(containerId, ranking, tipo, colorByName = null) {
  const list = document.getElementById(containerId);
  if (!list) return;

  if (!ranking.length) {
    list.innerHTML = '<p style="text-align:center; padding: 1rem; color: var(--medium-gray);">Nenhum dado.</p>';
    return;
  }

  list.innerHTML = '';
  ranking.forEach(item => {
    const div = document.createElement('div');
    div.className = 'chart-list-item';
    div.onclick = () => openDetails(tipo, item.name, item.ocorrencias);

    const dotColor = typeof colorByName === 'function' ? (colorByName(item.name) || null) : null;
    const dotStyle = dotColor ? `style="background:${dotColor}"` : `style="background: rgba(90,108,125,.35)"`;

    div.innerHTML = `
      <div class="chart-list-left">
        <span class="chart-color-dot" ${dotStyle}></span>
        <span class="chart-list-name">${item.name}</span>
      </div>
      <span class="chart-list-count">(${item.count})</span>
    `;

    list.appendChild(div);
  });
}

/**
 * CAUSA - Pizza (Top 10)
 */
export function renderChartCausa(data) {
  const rankingAll = buildRankingWithOccur(data, 'CAUSA');
  const top = rankingAll.slice(0, 10);

  const canvas = document.getElementById('chartCausa');
  if (!canvas) return;

  if (chartCausa) chartCausa.destroy();

  const labels = top.map(x => x.name);
  const values = top.map(x => x.count);

  const colors = [
    '#0A4A8C', '#1E7CE8', '#00B4FF', '#4DC8FF',
    '#80D9FF', '#B3E8FF', '#E6F4FD', '#FFD700',
    '#FFB84D', '#FF8C69', '#10B981', '#F59E0B',
    '#6366F1', '#EC4899', '#14B8A6', '#A3E635',
    '#F97316', '#22C55E', '#3B82F6', '#EAB308'
  ];

  const topColors = colors.slice(0, labels.length);

  // Mapa nome -> cor (para usar na lista)
  const colorMap = new Map();
  labels.forEach((name, idx) => colorMap.set(name, topColors[idx]));
  const getColorForCause = (name) => colorMap.get(name) || null;

  chartCausa = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: topColors,
        borderColor: '#FFFFFF',
        borderWidth: 3,
        hoverBorderWidth: 4,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Top 10 Causas',
          font: { size: 18, weight: '700', family: "'Inter', 'Segoe UI', sans-serif" },
          color: '#0A4A8C',
          padding: { top: 10, bottom: 10 }
        },
        tooltip: {
          backgroundColor: 'rgba(26, 31, 46, 0.95)',
          padding: 12,
          borderColor: '#1E7CE8',
          borderWidth: 2,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? ((value / total) * 100).toFixed(1) : '0.0';
              return `${label}: ${value} (${pct}%)`;
            }
          }
        },
        // configurações do plugin local de % (não é tooltip)
        piePercentLabelsPlugin: {
          minPctToShow: 4,   // não polui fatias muito pequenas
          fontSize: 12,
          fontWeight: 900,
          fontFamily: "'Inter', 'Segoe UI', sans-serif"
        }
      },
      onClick: (evt, elements) => {
        if (!elements || !elements.length) return;
        const idx = elements[0].index;
        const name = labels[idx];
        const found = top.find(x => x.name === name);
        if (found) openDetails('CAUSA', found.name, found.ocorrencias);
      },
      animation: { duration: 900, easing: 'easeOutQuart' }
    },
    plugins: [piePercentLabelsPlugin] // ativa o plugin que desenha % nas fatias
  });

  // Lista clicável com scrollbar (todas as causas), com indicador de cor (Top 10)
  renderScrollList('chartCausaList', rankingAll, 'CAUSA', getColorForCause);
}

/**
 * ALIMENTADOR - Radar (Top 5)
 * Obs: busca campo "ALIMENT." (normaliza chaves com/sem ponto)
 */
export function renderChartAlimentador(data) {
  const rankingAll = buildRankingWithOccur(data, 'ALIMENT.');
  const top = rankingAll.slice(0, 5);

  const canvas = document.getElementById('chartAlimentador');
  if (!canvas) return;

  if (chartAlimentador) chartAlimentador.destroy();

  const labels = top.map(x => x.name);
  const values = top.map(x => x.count);

  chartAlimentador = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Ocorrências',
        data: values,
        backgroundColor: 'rgba(30, 124, 232, 0.25)',
        borderColor: '#1E7CE8',
        borderWidth: 3,
        pointBackgroundColor: '#0A4A8C',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 3,
        pointRadius: 5,
        pointHoverBackgroundColor: '#00B4FF',
        pointHoverBorderColor: '#FFFFFF',
        pointHoverRadius: 7,
        pointHoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            font: { size: 11, weight: '600', family: "'Inter', 'Segoe UI', sans-serif" },
            color: '#5A6C7D',
            backdropColor: 'transparent'
          },
          grid: { color: 'rgba(30, 124, 232, 0.15)', lineWidth: 1.5 },
          angleLines: { color: 'rgba(30, 124, 232, 0.1)', lineWidth: 1.5 },
          pointLabels: {
            font: { size: 12, weight: '600', family: "'Inter', 'Segoe UI', sans-serif" },
            color: '#1A1F2E',
            padding: 10
          }
        }
      },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Top 5 Alimentadores',
          font: { size: 18, weight: '700', family: "'Inter', 'Segoe UI', sans-serif" },
          color: '#0A4A8C',
          padding: { top: 10, bottom: 10 }
        },
        tooltip: {
          backgroundColor: 'rgba(26, 31, 46, 0.95)',
          padding: 12,
          borderColor: '#1E7CE8',
          borderWidth: 2,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = context.parsed?.r ?? context.parsed ?? 0;
              return `${label}: ${value}`;
            }
          }
        }
      },
      onClick: (evt, elements) => {
        if (!elements || !elements.length) return;
        const idx = elements[0].index;
        const name = labels[idx];
        const found = top.find(x => x.name === name);
        if (found) openDetails('ALIMENTADOR', found.name, found.ocorrencias);
      },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });

  // Para alimentador: dot cinza (não tem pizza com cores individuais)
  renderScrollList('chartAlimentadorList', rankingAll, 'ALIMENTADOR', null);
}

/**
 * Atualizar todos os gráficos
 */
export function updateCharts(data) {
  renderChartCausa(data);
  renderChartAlimentador(data);
}
