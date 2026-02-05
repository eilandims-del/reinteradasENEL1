// =========================
// FILE: js/components/charts.js
// =========================
/**
 * Charts - Chart.js
 * CAUSA: Barras horizontais (Top 10) + lista clicável com scroll (todas, exceto bloqueadas)
 * ALIMENTADOR: Barras horizontais (Top 5) + lista clicável com scroll (todas)
 *
 * 🔥 NOVO:
 * - Clique no gráfico de ALIMENTADOR dispara evento:
 *   document.dispatchEvent(new CustomEvent('alimentador:selected', { detail: { nome, qtd, ocorrencias } }))
 *   (para o mapa reagir sem alterar cards/ranking)
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

// ✅ Plugin de % para BARRAS horizontais
const barPercentLabelsPlugin = {
  id: 'barPercentLabelsPlugin',
  afterDatasetsDraw(chart, args, opts) {
    const { ctx } = chart;

    const datasetIndex = 0;
    const dataset = chart.data.datasets?.[datasetIndex];
    if (!dataset || !Array.isArray(dataset.data)) return;

    const meta = chart.getDatasetMeta(datasetIndex);
    if (!meta?.data?.length) return;

    const total = dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
    if (!total) return;

    const minPctToShow = Number(opts?.minPctToShow ?? 4);
    const fontSize = Number(opts?.fontSize ?? 12);
    const fontWeight = String(opts?.fontWeight ?? 900);
    const fontFamily = String(opts?.fontFamily ?? "'Inter', 'Segoe UI', sans-serif");
    const color = String(opts?.color ?? '#0A4A8C');

    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'middle';

    meta.data.forEach((barEl, i) => {
      const v = Number(dataset.data[i] || 0);
      if (!v) return;

      const pct = (v / total) * 100;
      if (pct < minPctToShow) return;

      // barra horizontal: "fim" é o x do elemento
      const x = barEl.x;
      const y = barEl.y;

      const label = `${pct.toFixed(1)}%`;
      ctx.fillText(label, x + 8, y);
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
 * Helper: dispara evento do alimentador para o mapa reagir
 */
function emitAlimentadorSelected(nome, qtd, ocorrencias) {
  document.dispatchEvent(new CustomEvent('alimentador:selected', {
    detail: { nome, qtd, ocorrencias }
  }));
}

/**
 * CAUSA - Barras horizontais (Top 10)
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
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: topColors,
        borderColor: '#FFFFFF',
        borderWidth: 3,
        hoverBorderWidth: 4
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
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
              const value = context.parsed?.x ?? context.parsed ?? 0; // bar horizontal -> parsed.x
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? ((value / total) * 100).toFixed(1) : '0.0';
              return `${label}: ${value} (${pct}%)`;
            }
          }
        },
        barPercentLabelsPlugin: {
          minPctToShow: 4,
          fontSize: 12,
          fontWeight: 900,
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          color: '#0A4A8C'
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
    plugins: [barPercentLabelsPlugin]
  });

  // Lista clicável com scrollbar (todas as causas), com indicador de cor (Top 10)
  renderScrollList('chartCausaList', rankingAll, 'CAUSA', getColorForCause);
}

/**
 * ALIMENTADOR - Barras horizontais (Top 5)
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

  // cor única (mantém padrão visual de azul)
  const barColor = '#1E7CE8';

  chartAlimentador = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: barColor,
        borderColor: '#FFFFFF',
        borderWidth: 3,
        hoverBorderWidth: 4
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      maintainAspectRatio: false,
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
              const value = context.parsed?.x ?? context.parsed ?? 0;
              return `${label}: ${value}`;
            }
          }
        },
        barPercentLabelsPlugin: {
          minPctToShow: 4,
          fontSize: 12,
          fontWeight: 900,
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          color: '#0A4A8C'
        }
      },
      // ✅ CLIQUE NO ALIMENTADOR: NÃO abre modal; dispara evento pro mapa
      onClick: (evt, elements) => {
        if (!elements || !elements.length) return;

        const idx = elements[0].index;
        const nome = labels[idx];

        const found = top.find(x => x.name === nome);
        if (!found) return;

        emitAlimentadorSelected(found.name, found.count, found.ocorrencias);
      },
      animation: { duration: 900, easing: 'easeOutQuart' }
    },
    plugins: [barPercentLabelsPlugin]
  });

  // Lista clicável (mantém o comportamento antigo: abre modal)
  renderScrollList('chartAlimentadorList', rankingAll, 'ALIMENTADOR', null);
}

/**
 * Atualizar todos os gráficos
 */
export function updateCharts(data) {
  renderChartCausa(data);
  renderChartAlimentador(data);
}
