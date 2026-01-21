/**
 * Componente Ranking - Exibição e gerenciamento de rankings
 */

import { generateRankingElemento, getOcorrenciasByElemento } from '../services/data-service.js';
import { openModal, fillDetailsModal } from './modal.js';

let currentRankingData = [];
let allData = [];
let currentElementoFilter = 'TODOS'; // 'TODOS' | 'TRAFO' | 'FUSIVEL' | 'OUTROS'
let elementoSearchTerm = ''; // texto de busca (normalizado)
let currentRankingCausaData = [];
let currentRankingAlimentadorData = [];

export function renderRankingCausa(data){
  const ranking = generateRankingByField(data, 'CAUSA');
  currentRankingCausaData = ranking;
  renderRankingGeneric('rankingCausa', ranking, (name, ocorrencias) => openGenericDetails('CAUSA', name, ocorrencias));
}

export function renderRankingAlimentador(data){
  const ranking = generateRankingByField(data, 'ALIMENT.');
  currentRankingAlimentadorData = ranking;
  renderRankingGeneric('rankingAlimentador', ranking, (name, ocorrencias) => openGenericDetails('ALIMENTADOR', name, ocorrencias));
}

export function setElementoFilter(filter) {
  currentElementoFilter = String(filter || '').toUpperCase();
  renderRankingList(getFilteredRanking(currentRankingData));
}

export function setElementoSearch(term) {
  elementoSearchTerm = String(term || '').trim().toUpperCase();
  renderRankingList(getFilteredRanking(currentRankingData));
}

function getFilteredRanking(ranking) {
  const normalize = (v) => String(v || '').trim().toUpperCase();

  let result = ranking.filter(item => {
    const el = normalize(item.elemento);
    const first = el.charAt(0);

    if (currentElementoFilter === 'TODOS') return true;
    if (currentElementoFilter === 'TRAFO') return first === 'T';
    if (currentElementoFilter === 'FUSIVEL') return first === 'F';
    if (currentElementoFilter === 'OUTROS') return first !== 'T' && first !== 'F';
    return true;
  });

  if (elementoSearchTerm) {
    result = result.filter(item => normalize(item.elemento).includes(elementoSearchTerm));
  }

  return result;
}

function updateRankingTotal(ranking) {
  const el = document.getElementById('rankingElementoTotal');
  if (!el) return;
  const total = Array.isArray(ranking) ? ranking.length : 0;
  el.textContent = `Reinteradas: ${total}`;
}

function renderRankingList(ranking) {
  const container = document.getElementById('rankingElemento');
  if (!container) return;

  // Atualiza total SEMPRE (mesmo vazio)
  updateRankingTotal(ranking);

  if (ranking.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Nenhum elemento encontrado para este filtro.</p>';
    return;
  }

  const INITIAL_DISPLAY = 100;
  const hasMore = ranking.length > INITIAL_DISPLAY;

  container.innerHTML = '';

  const renderBatch = (startIndex, endIndex) => {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        for (let i = startIndex; i < endIndex && i < ranking.length; i++) {
          const item = ranking[i];
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

  renderBatch(0, INITIAL_DISPLAY).then(() => {
    if (hasMore) {
      const showMoreBtn = document.createElement('button');
      showMoreBtn.className = 'btn btn-secondary btn-sm';
      showMoreBtn.style.marginTop = '1rem';
      showMoreBtn.style.width = '100%';
      showMoreBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Ver mais (${ranking.length - INITIAL_DISPLAY} restantes)`;

      let currentEnd = INITIAL_DISPLAY;
      const BATCH_SIZE = 50;

      showMoreBtn.onclick = async () => {
        showMoreBtn.disabled = true;
        showMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';

        const nextEnd = Math.min(currentEnd + BATCH_SIZE, ranking.length);
        await renderBatch(currentEnd, nextEnd);
        currentEnd = nextEnd;

        if (currentEnd >= ranking.length) {
          showMoreBtn.remove();
        } else {
          showMoreBtn.disabled = false;
          showMoreBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Ver mais (${ranking.length - currentEnd} restantes)`;
        }
      };

      container.appendChild(showMoreBtn);
    }
  });
}

/**
 * Renderizar ranking por ELEMENTO
 */
export function renderRankingElemento(data) {
  allData = data;

  const ranking = generateRankingElemento(data);
  currentRankingData = ranking;

  const filtered = getFilteredRanking(ranking);
  renderRankingList(filtered);
}

function openGenericDetails(tipo, nome, ocorrencias) {
  const modalTitle = document.getElementById('detalhesTitulo');
  if (modalTitle) modalTitle.textContent = `${tipo}: ${nome}`;

  const modalContent = document.getElementById('detalhesConteudo');
  let selectedColumns = [];

  if (modalContent && modalContent.dataset.selectedColumns) {
    try { selectedColumns = JSON.parse(modalContent.dataset.selectedColumns); }
    catch (e) { selectedColumns = []; }
  }

  fillDetailsModal(nome, ocorrencias, selectedColumns);
  openModal('modalDetalhes');
}

/**
 * Abrir detalhes de um elemento
 */
function openElementDetails(elemento, ocorrencias) {
  const modalContent = document.getElementById('detalhesConteudo');
  let selectedColumns = [];

  if (modalContent && modalContent.dataset.selectedColumns) {
    try {
      selectedColumns = JSON.parse(modalContent.dataset.selectedColumns);
    } catch (e) {
      selectedColumns = [];
    }
  }

  fillDetailsModal(elemento, ocorrencias, selectedColumns);
  openModal('modalDetalhes');
}

/**
 * Gerar texto do ranking para copiar (WhatsApp) - versão profissional
 * - Usa o filtro ativo (TODOS/TRAFO/FUSIVEL/OUTROS)
 * - Usa período selecionado (inputs #dataInicial / #dataFinal)
 * - Usa a visão filtrada (ranking da tela)
 * - Para cada elemento, mostra a causa predominante (e %)
 */
export function generateRankingText() {
  console.log('[COPIAR] generateRankingText NOVA VERSAO ATIVA ✅', { currentElementoFilter, elementoSearchTerm });

  if (!currentRankingData.length) return 'Nenhum ranking disponível.';

  const view = getFilteredRanking(currentRankingData);

  if (!view.length) {
    return [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📋 *RELATÓRIO DE REINTERADAS*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Tipo de elemento: *${getFiltroLabel(currentElementoFilter)}*`,
      `📅 Período: ${getPeriodoLabel()}`,
      '',
      'Nenhum elemento encontrado para o filtro atual.',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '🔗 *Visualizar no painel:*',
      'https://eilandims-del.github.io/reinteradasenel'
    ].join('\n');
  }

  // Controle de tamanho (WhatsApp): evita texto gigante
  const MAX_ITENS = 30;
  const sliced = view.slice(0, MAX_ITENS);
  const restantes = view.length - sliced.length;

  const linhas = [];

  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push('📋 *RELATÓRIO DE REINTERADAS*');
  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push(`Tipo de elemento: *${getFiltroLabel(currentElementoFilter)}*`);
  linhas.push(`📅 Período: ${getPeriodoLabel()}`);
  if (elementoSearchTerm) linhas.push(`🔎 Busca: *${elementoSearchTerm}*`);
  linhas.push(`Reinteradas no ranking: *${view.length}*`);
  linhas.push('');

  sliced.forEach((item, idx) => {
    const total = Number(item.count) || 0;

    const topCausa = getTopByField(item.ocorrencias || [], 'CAUSA');
    const causaNome = topCausa?.name ? sanitizeOneLine(topCausa.name) : 'Não informado';
    const causaQtd = topCausa?.count ? topCausa.count : 0;
    const causaPct = total ? Math.round((causaQtd / total) * 100) : 0;

    linhas.push(`*${String(idx + 1).padStart(2, '0')})* ${sanitizeOneLine(item.elemento)}  *(${total}x)*`);
    linhas.push(`   └─ 🔹 Causa predominante: ${causaNome}  *(${causaQtd}x | ${causaPct}%)*`);
    linhas.push('');
  });

  if (restantes > 0) {
    linhas.push(`…e mais *${restantes}* item(ns) no ranking (refine pelo painel para ver todos).`);
    linhas.push('');
  }

  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push('🔗 *Visualizar mais detalhes:*');
  linhas.push('https://eilandims-del.github.io/reinteradasenel');

  return linhas.join('\n').trim();
}

function getFiltroLabel(filter) {
  const f = String(filter || '').toUpperCase();
  if (f === 'TODOS') return 'TODOS';
  if (f === 'TRAFO') return 'TRAFO';
  if (f === 'FUSIVEL') return 'FUSÍVEL';
  if (f === 'OUTROS') return 'OUTROS';
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
  return '*Todos os registros (sem filtro de data)*';
}

/**
 * Retorna o valor mais frequente de um campo em um conjunto de ocorrências.
 */
function getTopByField(ocorrencias, fieldName) {
  if (!Array.isArray(ocorrencias) || !ocorrencias.length) return null;

  const normalizeKey = (k) => String(k || '').trim().toLowerCase().replace(/\./g, '');
  const getFieldValue = (row, field) => {
    if (!row) return '';
    if (row[field] != null) return row[field];
    const target = normalizeKey(field);
    const foundKey = Object.keys(row).find(k => normalizeKey(k) === target);
    return foundKey ? row[foundKey] : '';
  };

  const counts = new Map();

  for (const row of ocorrencias) {
    const raw = String(getFieldValue(row, fieldName) || '').trim();
    if (!raw) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }

  let best = null;
  for (const [name, count] of counts.entries()) {
    if (!best || count > best.count) best = { name, count };
  }
  return best;
}

function sanitizeOneLine(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

/**
 * Atualizar ranking com novos dados
 */
export function updateRanking(data) {
  renderRankingElemento(data);
  renderRankingCausa(data);
  renderRankingAlimentador(data);
}

function normalizeKey(k) {
  return String(k || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '');
}

function getFieldValue(row, fieldName) {
  if (!row) return '';

  if (row[fieldName] != null) return row[fieldName];

  const target = normalizeKey(fieldName);
  const foundKey = Object.keys(row).find(k => normalizeKey(k) === target);
  if (foundKey) return row[foundKey];

  return '';
}

function generateRankingByField(data, field) {
  const counts = new Map();
  const ocorrenciasMap = new Map();

  data.forEach(row => {
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
