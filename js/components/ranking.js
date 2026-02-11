/**
 * Componente Ranking - Exibição e gerenciamento de rankings
 */

import { openModal, fillDetailsModal } from './modal.js';
import { formatDate } from '../utils/helpers.js';

let currentRankingData = [];
let currentElementoFilter = 'TODOS'; // 'TODOS' | 'TRAFO' | 'FUSIVEL' | 'RELIGADOR'
let elementoSearchTerm = ''; // texto de busca (normalizado)

let currentRankingCausaData = [];
let currentRankingAlimentadorData = [];

// ✅ Regra de negócio: "Reiterada" = elemento aparece 2+ vezes
const MIN_REPEAT_COUNT = 2;

/* =========================
   Utilidades (chave/campo)
========================= */
function normalizeKey(k) {
  return String(k || '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
}

function getFieldValue(row, fieldName) {
  if (!row) return '';

  if (row[fieldName] != null) return row[fieldName];

  // tenta também sem ponto
  const noDot = String(fieldName).replace(/\./g, '');
  if (row[noDot] != null) return row[noDot];

  // tenta por normalização
  const target = normalizeKey(fieldName);
  const foundKey = Object.keys(row).find(k => normalizeKey(k) === target);
  if (foundKey) return row[foundKey];

  return '';
}

function sanitizeOneLine(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function getRegionalLabel() {
  const el = document.getElementById('regionalAtualLabel');
  const txt = sanitizeOneLine(el?.textContent || '');
  return txt && txt !== '—' ? txt : '—';
}

/**
 * Classificação de tipo:
 * - T* => TRAFO
 * - F* => FUSIVEL
 * - demais => RELIGADOR
 */
function getElementoTipo(elemento) {
  const el = String(elemento || '').trim().toUpperCase();
  const first = el.charAt(0);
  if (first === 'T') return 'TRAFO';
  if (first === 'F') return 'FUSIVEL';
  return 'RELIGADOR';
}

/* =========================
   ✅ Ranking por ELEMENTO (robusto)
========================= */
function generateRankingElemento(data) {
  const counts = new Map();
  const ocorrMap = new Map();

  for (const row of (data || [])) {
    const elementoRaw = String(getFieldValue(row, 'ELEMENTO') || '').trim();
    if (!elementoRaw) continue;

    counts.set(elementoRaw, (counts.get(elementoRaw) || 0) + 1);

    if (!ocorrMap.has(elementoRaw)) ocorrMap.set(elementoRaw, []);
    ocorrMap.get(elementoRaw).push(row);
  }

  return Array.from(counts.entries())
    .map(([elemento, count]) => ({ elemento, count, ocorrencias: ocorrMap.get(elemento) }))
    .filter(x => (Number(x.count) || 0) >= MIN_REPEAT_COUNT)
    .sort((a, b) => b.count - a.count);
}

/* =========================
   ✅ Visão atual (filtro + busca)
========================= */
function getFilteredRanking(ranking) {
  const normalize = (v) => String(v || '').trim().toUpperCase();

  let result = (ranking || []).filter(item => {
    const el = normalize(item.elemento);
    const tipo = getElementoTipo(el);

    if (currentElementoFilter === 'TODOS') return true;
    if (currentElementoFilter === 'TRAFO') return tipo === 'TRAFO';
    if (currentElementoFilter === 'FUSIVEL') return tipo === 'FUSIVEL';
    if (currentElementoFilter === 'RELIGADOR') return tipo === 'RELIGADOR';
    return true;
  });

  if (elementoSearchTerm) {
    result = result.filter(item => normalize(item.elemento).includes(elementoSearchTerm));
  }

  return result;
}

function getOcorrenciasFromRankingView(rankingView) {
  const rows = [];
  for (const item of (rankingView || [])) {
    const ocorrs = Array.isArray(item?.ocorrencias) ? item.ocorrencias : [];
    rows.push(...ocorrs);
  }
  return rows;
}

/**
 * ✅ EXPORT: use no main.js para atualizar charts/map
 */
export function getRankingViewRows() {
  const view = getFilteredRanking(currentRankingData || []);
  return getOcorrenciasFromRankingView(view);
}

/* =========================
   Ranking por CAUSA / ALIMENTADOR (genérico)
========================= */
export function renderRankingCausa(data) {
  const ranking = generateRankingByField(data, 'CAUSA');
  currentRankingCausaData = ranking;
  renderRankingGeneric('rankingCausa', ranking, (name, ocorrencias) => openGenericDetails('CAUSA', name, ocorrencias));
}

export function renderRankingAlimentador(data) {
  const ranking = generateRankingByField(data, 'ALIMENT.');
  currentRankingAlimentadorData = ranking;
  renderRankingGeneric('rankingAlimentador', ranking, (name, ocorrencias) => openGenericDetails('ALIMENTADOR', name, ocorrencias));
}

/* =========================
   Setters (chamados pelo main.js)
========================= */
export function setElementoFilter(filter) {
  currentElementoFilter = String(filter || '').toUpperCase();
  renderRankingList(getFilteredRanking(currentRankingData || []));
}

export function setElementoSearch(term) {
  elementoSearchTerm = String(term || '').trim().toUpperCase();
  renderRankingList(getFilteredRanking(currentRankingData || []));
}

/* =========================
   Total / Export
========================= */
function updateRankingTotal(rankingView) {
  const el = document.getElementById('rankingElementoTotal');
  if (!el) return;

  const totalElementos = Array.isArray(rankingView) ? rankingView.length : 0;

  el.textContent = `Reiteradas: ${totalElementos}`;
  el.style.cursor = 'pointer';
  el.title = 'Clique para baixar Excel da visão atual (ELEMENTO / DATA / ALIMENTADOR / INCIDÊNCIA)';

  if (el.__exportRankingClick) {
    el.removeEventListener('click', el.__exportRankingClick);
    el.__exportRankingClick = null;
  }

  const onClick = () => exportRankingElementoToExcel(rankingView);
  el.__exportRankingClick = onClick;
  el.addEventListener('click', onClick);
}

function renderRankingList(rankingView) {
  const container = document.getElementById('rankingElemento');
  if (!container) return;

  updateRankingTotal(rankingView);

  if (!rankingView || rankingView.length === 0) {
    container.innerHTML =
      `<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">
        Nenhum elemento reiterado (≥ ${MIN_REPEAT_COUNT}) para este filtro/busca.
      </p>`;
    return;
  }

  const INITIAL_DISPLAY = 100;
  const BATCH_SIZE = 50;
  const SCROLL_THRESHOLD_PX = 120;

  container.innerHTML = '';

  const renderBatch = (startIndex, endIndex) => {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        for (let i = startIndex; i < endIndex && i < rankingView.length; i++) {
          const item = rankingView[i];

          const itemDiv = document.createElement('div');
          itemDiv.className = 'ranking-item';
          itemDiv.onclick = () => openElementDetails(item.elemento, item.ocorrencias);

          const position = document.createElement('span');
          position.className = 'ranking-item-position';
          position.textContent = `${i + 1}º`;

          const name = document.createElement('span');
          name.className = 'ranking-item-name';
          name.textContent = item.elemento;

          const count = document.createElement('span');
          count.className = 'ranking-item-count';
          count.textContent = `(${item.count} vezes)`;

          itemDiv.appendChild(position);
          itemDiv.appendChild(name);
          itemDiv.appendChild(count);
          container.appendChild(itemDiv);
        }
        resolve();
      });
    });
  };

  let currentEnd = 0;
  let isLoading = false;

  if (container.__onRankingScroll) {
    container.removeEventListener('scroll', container.__onRankingScroll);
    container.__onRankingScroll = null;
  }

  const loadMoreIfNeeded = async () => {
    if (isLoading) return;
    if (currentEnd >= rankingView.length) return;

    isLoading = true;

    const nextEnd = Math.min(currentEnd + BATCH_SIZE, rankingView.length);
    await renderBatch(currentEnd, nextEnd);
    currentEnd = nextEnd;

    isLoading = false;
  };

  const onScroll = async () => {
    if (currentEnd >= rankingView.length) return;

    const nearBottom =
      container.scrollTop + container.clientHeight >= (container.scrollHeight - SCROLL_THRESHOLD_PX);

    if (nearBottom) {
      await loadMoreIfNeeded();
    }
  };

  container.__onRankingScroll = onScroll;
  container.addEventListener('scroll', onScroll, { passive: true });

  const firstEnd = Math.min(INITIAL_DISPLAY, rankingView.length);
  renderBatch(0, firstEnd).then(async () => {
    currentEnd = firstEnd;

    while (currentEnd < rankingView.length && container.scrollHeight <= container.clientHeight) {
      await loadMoreIfNeeded();
    }
  });
}

/* =========================
   Render ranking por ELEMENTO
========================= */
export function renderRankingElemento(data) {
  const ranking = generateRankingElemento(data || []);
  currentRankingData = ranking;

  const view = getFilteredRanking(ranking);
  renderRankingList(view);
}

/**
 * ✅ Atualizar ranking com novos dados
 */
export function updateRanking(data) {
  renderRankingElemento(data);
}

/* =========================
   Detalhes / Modal
========================= */
function openGenericDetails(tipo, nome, ocorrencias) {
  const modalTitle = document.getElementById('detalhesTitulo');
  if (modalTitle) modalTitle.textContent = `${tipo}: ${nome}`;

  const modalContent = document.getElementById('detalhesConteudo');
  let selectedColumns = [];

  if (modalContent && modalContent.dataset.selectedColumns) {
    try { selectedColumns = JSON.parse(modalContent.dataset.selectedColumns); }
    catch (_) { selectedColumns = []; }
  }

  fillDetailsModal(nome, ocorrencias, selectedColumns);
  openModal('modalDetalhes');
}

function openElementDetails(elemento, ocorrencias) {
  const modalContent = document.getElementById('detalhesConteudo');
  let selectedColumns = [];

  if (modalContent && modalContent.dataset.selectedColumns) {
    try { selectedColumns = JSON.parse(modalContent.dataset.selectedColumns); }
    catch (_) { selectedColumns = []; }
  }

  fillDetailsModal(elemento, ocorrencias, selectedColumns);
  openModal('modalDetalhes');
}

/* =========================
   Texto para copiar (WhatsApp)
========================= */
export function generateRankingText() {
  if (!currentRankingData.length) return '⚠️ Nenhum ranking disponível no momento.';

  const view = getFilteredRanking(currentRankingData);
  const regional = getRegionalLabel();

  if (!view.length) {
    return [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📋 *RELATÓRIO DE REITERADAS*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `🗺️ Regional: *${regional}*`,
      `🧩 Tipo: *${getFiltroLabel(currentElementoFilter)}*`,
      `📅 Período: ${getPeriodoLabel()}`,
      elementoSearchTerm ? `🔎 Busca: *${elementoSearchTerm}*` : '',
      '',
      `😕 Nenhum elemento reiterado (≥ ${MIN_REPEAT_COUNT}) para o filtro/busca atual.`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '🔗 *Ver mais detalhes:*',
      'https://eilandims-del.github.io/reiteradasenel'
    ].filter(Boolean).join('\n');
  }

  const trafos = view.filter(x => getElementoTipo(x.elemento) === 'TRAFO');
  const fus = view.filter(x => getElementoTipo(x.elemento) === 'FUSIVEL');
  const rel = view.filter(x => getElementoTipo(x.elemento) === 'RELIGADOR');

  const linhas = [];
  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push('📋 *RELATÓRIO DE REITERADAS*');
  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push(`🗺️ Regional: *${regional}*`);
  linhas.push(`🧩 Tipo: *${getFiltroLabel(currentElementoFilter)}*`);
  linhas.push(`📅 Período: ${getPeriodoLabel()}`);
  if (elementoSearchTerm) linhas.push(`🔎 Busca: *${elementoSearchTerm}*`);
  linhas.push('');
  linhas.push('');

  const MAX_ITENS_POR_SECAO = 30;
  let globalIndex = 1;

  const getTipoEmoji = (titulo) => {
    const t = String(titulo || '').toUpperCase();
    if (t.includes('TRAFO')) return '🔌';
    if (t.includes('FUS')) return '💡';
    if (t.includes('RELIG')) return '⚡';
    return '•';
  };

  const renderSecao = (titulo, arr) => {
    if (!arr.length) return;

    const icon = getTipoEmoji(titulo);

    linhas.push(`${icon} *${titulo}*`);
    linhas.push('');

    const sliced = arr.slice(0, MAX_ITENS_POR_SECAO);
    const restantes = arr.length - sliced.length;

    sliced.forEach((item) => {
      const total = Number(item.count) || 0;

      const alimentador = getMostFrequentField(item.ocorrencias || [], 'ALIMENT.');
      const alimentadorStr = alimentador ? sanitizeOneLine(alimentador) : 'Não informado';

      const causasStr = getAllCausesLine(item.ocorrencias || []);

      linhas.push(`*${String(globalIndex).padStart(2, '0')})* ${sanitizeOneLine(item.elemento)}  *(${total} vezes)*`);
      linhas.push(`   ├─ 🧭 Alimentador: ${alimentadorStr}`);
      linhas.push(`   └─ 🧾 Causas: ${causasStr}`);
      linhas.push('');
      globalIndex += 1;
    });

    if (restantes > 0) {
      linhas.push(`…e mais *${restantes}* item(ns) em ${titulo} (refine no painel para ver tudo).`);
      linhas.push('');
    }

    linhas.push('');
  };

  if (currentElementoFilter === 'TODOS') {
    renderSecao('TRAFO', trafos);
    renderSecao('FUSÍVEL', fus);
    renderSecao('RELIGADOR', rel);

    const obs = [];
    if (!trafos.length) obs.push('🔌 Não reiterou nenhum *TRAFO*');
    if (!fus.length) obs.push('💡 Não reiterou nenhum *FUSÍVEL*');
    if (!rel.length) obs.push('⚡ Não reiterou nenhum *RELIGADOR*');

    if (obs.length) {
      linhas.push('ℹ️ *Observações*');
      obs.forEach(o => linhas.push(`- ${o}`));
      linhas.push('');
    }
  } else if (currentElementoFilter === 'TRAFO') {
    renderSecao('TRAFO', trafos);
    if (!trafos.length) {
      linhas.push('ℹ️ *Observação:* 🔌 Não reiterou nenhum *TRAFO*');
      linhas.push('');
    }
  } else if (currentElementoFilter === 'FUSIVEL') {
    renderSecao('FUSÍVEL', fus);
    if (!fus.length) {
      linhas.push('ℹ️ *Observação:* 💡 Não reiterou nenhum *FUSÍVEL*');
      linhas.push('');
    }
  } else if (currentElementoFilter === 'RELIGADOR') {
    renderSecao('RELIGADOR', rel);
    if (!rel.length) {
      linhas.push('ℹ️ *Observação:* ⚡ Não reiterou nenhum *RELIGADOR*');
      linhas.push('');
    }
  }

  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push('🔗 *Ver mais detalhes:*');
  linhas.push('https://eilandims-del.github.io/reiteradasenel');

  return linhas.join('\n').trim();
}

function getFiltroLabel(filter) {
  const f = String(filter || '').toUpperCase();
  if (f === 'TODOS') return 'TODOS';
  if (f === 'TRAFO') return 'TRAFO';
  if (f === 'FUSIVEL') return 'FUSÍVEL';
  if (f === 'RELIGADOR') return 'RELIGADOR';
  return f || 'N/D';
}

function getPeriodoLabel() {
  const di = document.getElementById('dataInicial')?.value || '';
  const df = document.getElementById('dataFinal')?.value || '';

  const fmt = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  };

  if (di && df) return `*${fmt(di)}* até *${fmt(df)}*`;
  if (di && !df) return `a partir de *${fmt(di)}*`;
  if (!di && df) return `até *${fmt(df)}*`;
  return '*Sem filtro de data*';
}

/* =========================
   Helpers ranking genérico
========================= */
function generateRankingByField(data, field) {
  const counts = new Map();
  const ocorrenciasMap = new Map();

  (data || []).forEach(row => {
    const value = String(getFieldValue(row, field) || '').trim();
    if (!value) return;

    counts.set(value, (counts.get(value) || 0) + 1);

    if (!ocorrenciasMap.has(value)) ocorrenciasMap.set(value, []);
    ocorrenciasMap.get(value).push(row);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, ocorrencias: ocorrenciasMap.get(name) }))
    .sort((a, b) => b.count - a.count);
}

function getMostFrequentField(ocorrencias, fieldName) {
  if (!Array.isArray(ocorrencias) || !ocorrencias.length) return '';

  const counts = new Map();
  for (const row of ocorrencias) {
    const raw = String(getFieldValue(row, fieldName) || '').trim();
    const clean = sanitizeOneLine(raw);
    if (!clean) continue;
    counts.set(clean, (counts.get(clean) || 0) + 1);
  }

  if (counts.size === 0) return '';

  let best = '';
  let bestCount = -1;
  for (const [name, count] of counts.entries()) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function getAllCausesLine(ocorrencias) {
  if (!Array.isArray(ocorrencias) || !ocorrencias.length) return 'Não informado';

  const counts = new Map();

  for (const row of ocorrencias) {
    const raw = String(getFieldValue(row, 'CAUSA') || '').trim();
    const clean = sanitizeOneLine(raw);
    if (!clean) continue;

    counts.set(clean, (counts.get(clean) || 0) + 1);
  }

  if (counts.size === 0) return 'Não informado';

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const MAX_CAUSAS = 12;
  const sliced = sorted.slice(0, MAX_CAUSAS);
  const rest = sorted.length - sliced.length;

  const base = sliced.join(', ');
  return rest > 0 ? `${base} …(+${rest})` : base;
}

function renderRankingGeneric(containerId, ranking, onClick) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!ranking.length) {
    container.innerHTML = '<p style="text-align:center; padding: 2rem; color: var(--medium-gray);">Nenhum dado.</p>';
    return;
  }

  container.innerHTML = '';

  ranking.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'ranking-item';
    div.onclick = () => onClick(item.name, item.ocorrencias);

    div.innerHTML = `
      <span class="ranking-item-position">${idx + 1}º</span>
      <span class="ranking-item-name">${item.name}</span>
      <span class="ranking-item-count">(${item.count} vezes)</span>
    `;

    container.appendChild(div);
  });
}

/* =========================
   EXPORT EXCEL - RANKING ELEMENTO
========================= */
function getValueSmartRow(obj, key) {
  if (!obj) return '';

  if (obj[key] != null) return obj[key];

  const keyNoDot = String(key).replace(/\./g, '');
  if (obj[keyNoDot] != null) return obj[keyNoDot];

  const upper = String(key).toUpperCase();
  const lower = String(key).toLowerCase();
  if (obj[upper] != null) return obj[upper];
  if (obj[lower] != null) return obj[lower];

  const normalizeKeyLocal = (k) =>
    String(k || '')
      .trim()
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s+/g, ' ');

  const target = normalizeKeyLocal(key);
  const foundKey = Object.keys(obj).find(k => normalizeKeyLocal(k) === target);
  if (foundKey) return obj[foundKey];

  return '';
}

function exportRankingElementoToExcel(rankingView) {
  if (!Array.isArray(rankingView) || rankingView.length === 0) {
    alert('Sem dados no ranking para exportar.');
    return;
  }

  if (!window.XLSX) {
    alert('Biblioteca XLSX não carregada. Verifique o SheetJS no index.html.');
    return;
  }

  const rows = [];

  for (const item of rankingView) {
    const elemento = item?.elemento ?? '';
    const ocorrs = Array.isArray(item?.ocorrencias) ? item.ocorrencias : [];

    for (const o of ocorrs) {
      const rawData = getValueSmartRow(o, 'DATA');
      const dataFmt = rawData ? formatDate(rawData) : '';

      const aliment = getValueSmartRow(o, 'ALIMENT.');
      const incid = getValueSmartRow(o, 'INCIDENCIA');

      rows.push({
        ELEMENTO: String(elemento || '').trim(),
        DATA: String(dataFmt || '').trim(),
        ALIMENTADOR: String(aliment || '').trim(),
        'INCIDÊNCIA': String(incid || '').trim(),
      });
    }
  }

  if (rows.length === 0) {
    alert('Sem ocorrências para exportar.');
    return;
  }

  rows.sort((a, b) => {
    const ea = a.ELEMENTO.localeCompare(b.ELEMENTO);
    if (ea !== 0) return ea;
    return a.DATA.localeCompare(b.DATA);
  });

  const ws = window.XLSX.utils.json_to_sheet(rows, {
    header: ['ELEMENTO', 'DATA', 'ALIMENTADOR', 'INCIDÊNCIA'],
  });

  ws['!cols'] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
  ];

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Ranking_Elemento');

  const di = document.getElementById('dataInicial')?.value || '';
  const df = document.getElementById('dataFinal')?.value || '';

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const periodo =
    (di && df) ? `${di}_a_${df}` :
    (di && !df) ? `de_${di}` :
    (!di && df) ? `ate_${df}` :
    'sem_filtro_data';

  const regional = getRegionalLabel().replace(/\s+/g, '_');
  const fileName = `Ranking_Elemento_${regional}_${periodo}_${stamp}.xlsx`;

  window.XLSX.writeFile(wb, fileName);
}
