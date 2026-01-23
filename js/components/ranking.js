/**
 * Componente Ranking - Exibição e gerenciamento de rankings
 */

import { generateRankingElemento, getOcorrenciasByElemento } from '../services/data-service.js';
import { openModal, fillDetailsModal } from './modal.js';

let currentRankingData = [];
let allData = [];
let currentElementoFilter = 'TODOS'; // 'TODOS' | 'TRAFO' | 'FUSIVEL' | 'RELIGADOR'
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

  renderRankingGeneric('rankingAlimentador', ranking, (name, ocorrencias) =>
    openGenericDetails('ALIMENTADOR', name, ocorrencias)
  );

  // cria/injeta botão "Relatório" no card do Ranking por Alimentador
  ensureAlimentadorReportButton();
}


export function setElementoFilter(filter) {
  currentElementoFilter = String(filter || '').toUpperCase();
  renderRankingList(getFilteredRanking(currentRankingData));
}

export function setElementoSearch(term) {
  elementoSearchTerm = String(term || '').trim().toUpperCase();
  renderRankingList(getFilteredRanking(currentRankingData));
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

function getFilteredRanking(ranking) {
  const normalize = (v) => String(v || '').trim().toUpperCase();

  let result = ranking.filter(item => {
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

  if (!ranking || ranking.length === 0) {
    container.innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Nenhum elemento encontrado para este filtro.</p>';
    return;
  }

  container.innerHTML = '';

  // Renderização em lotes SEM botão, até o final (mantém UI responsiva)
  const BATCH_SIZE = 200;
  let i = 0;

  const renderNextBatch = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        const frag = document.createDocumentFragment();

        const end = Math.min(i + BATCH_SIZE, ranking.length);
        for (; i < end; i++) {
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

          frag.appendChild(itemDiv);
        }

        container.appendChild(frag);
        resolve();
      });
    });

  (async () => {
    while (i < ranking.length) {
      await renderNextBatch();
    }
  })();
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
 * Gerar texto do ranking para copiar (WhatsApp) - modelo solicitado:
 * - Mostra Alimentador (mais frequente)
 * - Mostra TODAS as causas (únicas, ordenadas por frequência)
 * - Separa por tipo (TRAFO / FUSÍVEL / RELIGADOR) quando filtro = TODOS
 * - OBS aparece somente se não existir ranking do(s) tipo(s)
 */
export function generateRankingText() {
  console.log('[COPIAR] generateRankingText ✅', { currentElementoFilter, elementoSearchTerm });

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
      '🔗 *Visualizar mais detalhes:*',
      'https://eilandims-del.github.io/reinteradasenel'
    ].join('\n');
  }

  const trafos = view.filter(x => getElementoTipo(x.elemento) === 'TRAFO');
  const fus = view.filter(x => getElementoTipo(x.elemento) === 'FUSIVEL');
  const rel = view.filter(x => getElementoTipo(x.elemento) === 'RELIGADOR');

  const linhas = [];
  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push('📋 *RELATÓRIO DE REINTERADAS*');
  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push(`Tipo de elemento: *${getFiltroLabel(currentElementoFilter)}*`);
  linhas.push(`📅 Período: ${getPeriodoLabel()}`);
  if (elementoSearchTerm) linhas.push(`🔎 Busca: *${elementoSearchTerm}*`);
  linhas.push('');
  linhas.push('');

  const MAX_ITENS_POR_SECAO = 30;
  let globalIndex = 1;

  const renderSecao = (titulo, arr) => {
    if (!arr.length) return;

    linhas.push(`*${titulo}*`);
    linhas.push('');

    const sliced = arr.slice(0, MAX_ITENS_POR_SECAO);
    const restantes = arr.length - sliced.length;

    sliced.forEach((item) => {
      const total = Number(item.count) || 0;

      // Alimentador (mais frequente nas ocorrências)
      const alimentador = getMostFrequentField(item.ocorrencias || [], 'ALIMENT.');
      const alimentadorStr = alimentador ? sanitizeOneLine(alimentador) : 'Não informado';

      // Todas as causas (únicas, por frequência)
      const causasStr = getAllCausesLine(item.ocorrencias || []);

      linhas.push(`*${String(globalIndex).padStart(2, '0')})* ${sanitizeOneLine(item.elemento)}  *(${total} vezes)* - Alimentador: ${alimentadorStr}`);
      linhas.push(`   └─ 🔹 Causa : ${causasStr}`);
      linhas.push('');
      linhas.push('');

      globalIndex += 1;
    });

    if (restantes > 0) {
      linhas.push(`…e mais *${restantes}* item(ns) em ${titulo} (refine pelo painel para ver todos).`);
      linhas.push('');
      linhas.push('');
    }
  };

  if (currentElementoFilter === 'TODOS') {
    // Ordem fixa: TRAFO -> FUSÍVEL -> RELIGADOR
    renderSecao('TRAFO', trafos);
    if (!trafos.length) {
      linhas.push('⚡ Não foi reinterado nenhum transformador');
      linhas.push('');
      linhas.push('');
    }
  
    renderSecao('FUSÍVEL', fus);
    if (!fus.length) {
      linhas.push('🔌 Não foi reinterado nenhum fusível');
      linhas.push('');
      linhas.push('');
    }
  
    renderSecao('RELIGADOR', rel);
    if (!rel.length) {
      linhas.push('🔄 Não foi reinterado nenhum religador');
      linhas.push('');
      linhas.push('');
    }
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
  return '*Todos os registros (sem filtro de data)*';
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

  // tenta também sem ponto
  const noDot = String(fieldName).replace(/\./g, '');
  if (row[noDot] != null) return row[noDot];

  // tenta por normalização
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

/**
 * Retorna o valor mais frequente de um campo em ocorrências (ex.: ALIMENT.)
 */
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

/**
 * Monta uma linha com TODAS as causas únicas, ordenadas por frequência.
 * Ex.: "CHUVA, PÁSSARO, DESCARGAS ATMOSFÉRICAS"
 */
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

  const MAX_CAUSAS = 12; // ajuste se quiser
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
import { openModal, fillDetailsModal, buildAlimentadorReportModal, exportAlimentadorReport } from './modal.js'; 
// ajuste para ./modals.js se esse for o nome correto

function ensureAlimentadorReportButton() {
  // container onde o ranking é renderizado
  const listEl = document.getElementById('rankingAlimentador');
  if (!listEl) return;

  // tentar achar o "card" pai para posicionar o botão no canto inferior direito
  const card = listEl.closest('.card') || listEl.parentElement;
  if (!card) return;

  // evita duplicar
  if (card.querySelector('#btnRelatorioAlimentador')) return;

  // garantir que o card seja "relative" para posicionamento absoluto do botão
  const cs = window.getComputedStyle(card);
  if (cs.position === 'static') card.style.position = 'relative';

  const btn = document.createElement('button');
  btn.id = 'btnRelatorioAlimentador';
  btn.className = 'btn btn-primary btn-sm';
  btn.textContent = 'Relatório';
  btn.style.position = 'absolute';
  btn.style.right = '12px';
  btn.style.bottom = '12px';
  btn.style.zIndex = '5';

  btn.onclick = () => {
    // monta o modal com as opções (alimentadores)
    const nomes = (currentRankingAlimentadorData || []).map(x => x.name).filter(Boolean);
    buildAlimentadorReportModal(nomes);
    openModal('modalRelatorioAlimentador');
  };

  card.appendChild(btn);
}
// listener global para export do modal
window.addEventListener('export-alimentador-report', (e) => {
  const selected = e?.detail?.selected || [];
  exportAlimentadorReport(selected);
});

function exportAlimentadorReport(selectedAlimentadores) {
  if (!window.XLSX) {
    alert('Biblioteca XLSX não carregada. Inclua o SheetJS no index.html.');
    return;
  }

  const selectedSet = new Set((selectedAlimentadores || []).map(x => String(x || '').trim()).filter(Boolean));
  if (!selectedSet.size) {
    alert('Seleção vazia.');
    return;
  }

  // Pega TODAS as ocorrências (linhas) dos alimentadores selecionados
  const rows = [];
  (currentRankingAlimentadorData || []).forEach(item => {
    if (selectedSet.has(item.name)) {
      (item.ocorrencias || []).forEach(r => rows.push(r));
    }
  });

  if (!rows.length) {
    alert('Não há ocorrências para os alimentadores selecionados.');
    return;
  }

  // Monta cabeçalhos a partir do union das chaves
  const headersSet = new Set();
  rows.forEach(r => Object.keys(r || {}).forEach(k => headersSet.add(k)));
  const headers = Array.from(headersSet);

  // AOA: header + linhas
  const aoa = [];
  aoa.push(headers);

  rows.forEach(r => {
    const line = headers.map(h => {
      const v = r?.[h];
      return v == null ? '' : String(v);
    });
    aoa.push(line);
  });

  const ws = window.XLSX.utils.aoa_to_sheet(aoa);

  // largura simples
  ws['!cols'] = headers.map((h, i) => {
    let maxLen = String(h || '').length;
    for (let r = 1; r < Math.min(aoa.length, 300); r++) {
      maxLen = Math.max(maxLen, String(aoa[r][i] || '').length);
    }
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileName = `Relatorio_Alimentadores_${stamp}.xlsx`;

  window.XLSX.writeFile(wb, fileName);
}
