// =========================
// FILE: js/main.js
// =========================
/**
 * Script Principal - Dashboard
 *
 * Fluxo:
 * 1) Seleciona Regional  -> abre Modal de Alimentadores (obrigatório escolher) [exceto TODOS]
 * 2) Seleciona Alimentadores (ou "TODOS") por Conjunto
 * 3) Seleciona período (data inicial/final) e clica em Aplicar
 */

import { DataService } from './services/firebase-service.js';
import { getAllColumns, getOcorrenciasByElemento, normKey, getFieldValue } from './services/data-service.js';

import { initEstruturasPanel, updateEstruturasContext } from './components/estruturas-panel.js';

import {
  updateRanking,
  generateRankingText,
  setElementoFilter,
  setElementoSearch,
  getRankingViewRows
} from './components/ranking.js';

import { updateCharts } from './components/charts.js';
import { updateHeatmap, initMap, setMapRegional, resetMap } from './components/mapa.js';

import {
  openModal,
  closeModal,
  initModalEvents,
  fillDetailsModal,
  exportDetailsToExcel
} from './components/modal.js';

import { copyToClipboard, showToast, debounce } from './utils/helpers.js';

// ✅ Modal catálogo (Regional -> Conjunto -> Alimentadores)
import { setupAlimentadoresCatalogModal } from './components/modal-alimentadores-catalog.js';
import { getAllAlimentadoresForRegional } from './services/alimentadores-catalog.js';

let currentData = [];
let selectedAdditionalColumns = [];

// ✅ Regional selecionada
let selectedRegional = ''; // 'TODOS' | 'ATLANTICO' | 'NORTE' | 'CENTRO NORTE'

// ✅ Alimentadores selecionados (Set de normKey)
let selectedAlimentadores = new Set();

// ===== Helpers =====

function getCatalogForRegional(regional) {
  const r = String(regional || '').trim().toUpperCase();
  if (!r) return [];

  // ✅ TODOS = catálogo mesclado das 3 regionais
  if (r === 'TODOS') {
    const regs = ['ATLANTICO', 'NORTE', 'CENTRO NORTE'];
    const all = regs.flatMap(rr => getAllAlimentadoresForRegional(rr) || []);
    return Array.from(new Set(all));
  }

  return getAllAlimentadoresForRegional(r) || [];
}

function getCatalogForSelectedRegional() {
  if (!selectedRegional) return [];
  if (selectedRegional === 'TODOS') return []; // ✅ não existe catálogo unificado
  return getAllAlimentadoresForRegional(selectedRegional);
}

function isAllAlimentadoresSelected() {
  // ✅ TODOS = sem filtro de alimentadores
  if (String(selectedRegional || '').toUpperCase() === 'TODOS') return true;

  const catalog = getCatalogForSelectedRegional();
  if (!catalog.length) return false;
  return selectedAlimentadores.size === catalog.length;
}

function alimentadorFilterActive() {
  if (!selectedRegional) return false;

  // ✅ TODOS = nunca filtra por alimentador
  if (String(selectedRegional).toUpperCase() === 'TODOS') return false;

  if (selectedAlimentadores.size === 0) return false;
  if (isAllAlimentadoresSelected()) return false; // TODOS => sem filtro
  return true;
}

function getDataWithAlimentadorFilter(data) {
  const rows = Array.isArray(data) ? data : [];
  if (!alimentadorFilterActive()) return rows;

  return rows.filter(row => {
    const alimRaw =
      getFieldValue(row, 'ALIMENT.') ||
      getFieldValue(row, 'ALIMENTADOR') ||
      getFieldValue(row, 'ALIMENT');

    const key = normKey(alimRaw);
    return selectedAlimentadores.has(key);
  });
}

function updateAlimentadoresBadge() {
  const el = document.getElementById('badgeOpenAlimentadores');
  if (!el) return;

  const setBadge = (txt) => {
    el.innerHTML = `<i class="fas fa-diagram-project"></i> ${txt}`;
  };

  if (!selectedRegional) { setBadge('Alimentadores: —'); return; }

  // ✅ TODOS: não força catálogo
  if (selectedRegional === 'TODOS') {
    setBadge('Alimentadores: TODOS (todas regionais)');
    return;
  }

  const catalog = getCatalogForSelectedRegional();
  if (!catalog.length) { setBadge('Alimentadores: —'); return; }

  if (isAllAlimentadoresSelected()) { setBadge('Alimentadores: TODOS'); return; }
  if (selectedAlimentadores.size > 0) { setBadge(`Alimentadores: ${selectedAlimentadores.size}`); return; }

  setBadge('Alimentadores: (selecionar)');
}

function validateAlimentadoresSelection(silent = false) {
  // ✅ TODOS não exige escolha
  if (String(selectedRegional).toUpperCase() === 'TODOS') return true;

  if (!selectedRegional) {
    if (!silent) showToast('Selecione uma Regional primeiro.', 'error');
    return false;
  }

  const catalog = getCatalogForSelectedRegional();
  if (!catalog.length) {
    if (!silent) showToast('Catálogo de alimentadores não encontrado para esta regional.', 'error');
    return false;
  }

  if (selectedAlimentadores.size > 0) return true;

  if (!silent) showToast('Selecione TODOS ou pelo menos 1 alimentador.', 'error');
  return false;
}

/* =========================
   ✅ Ranking CLIENTES (CLI. AFE)
   - renderiza no painel #rankingCliente
   - usa a visão atual (getRankingViewRows) = respeita filtro de elemento + busca + alimentadores
   - clique abre modal com ocorrências do cliente
========================= */

function getCliAfeValue(row) {
  return (
    getFieldValue(row, 'CLI. AFE') ||
    getFieldValue(row, 'CLI AFE') ||
    getFieldValue(row, 'CLI. AFET') ||
    getFieldValue(row, 'CLIAFE') ||
    row?.['CLI. AFE'] ||
    row?.['CLI AFE'] ||
    row?.['CLI. AFET'] ||
    ''
  );
}

function buildClientesRanking(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const map = new Map();

  for (const r of list) {
    const raw = String(getCliAfeValue(r) ?? '').trim();
    if (!raw) continue;
    const k = raw.replace(/\s+/g, ' ');
    map.set(k, (map.get(k) || 0) + 1);
  }

  const ranking = Array.from(map.entries())
    .map(([cliente, count]) => ({ cliente, count }))
    .sort((a, b) => b.count - a.count);

  return { ranking, distinct: map.size };
}

function openClienteDetails(cliente, allRowsInView) {
  const ocorrencias = (Array.isArray(allRowsInView) ? allRowsInView : []).filter(r => {
    const v = String(getCliAfeValue(r) ?? '').trim().replace(/\s+/g, ' ');
    return v === cliente;
  });

  const titleEl = document.getElementById('detalhesTitulo');
  if (titleEl) titleEl.textContent = `CLIENTE: ${cliente}`;

  // usa as mesmas colunas adicionais selecionadas no modal
  fillDetailsModal(cliente, ocorrencias, selectedAdditionalColumns);
  openModal('modalDetalhes');
}

function renderRankingClientes(rowsFromRankingView) {
  const container = document.getElementById('rankingCliente');
  if (!container) return;

  const rows = Array.isArray(rowsFromRankingView) ? rowsFromRankingView : [];

  if (!rows.length) {
    container.innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Sem dados na visão atual.</p>';
    return;
  }

  const { ranking, distinct } = buildClientesRanking(rows);

  if (!ranking.length) {
    container.innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Não encontrei valores em <b>CLI. AFE</b> na visão atual.</p>';
    return;
  }

  container.innerHTML = '';

  // opcional: um “resuminho” no topo
  const topInfo = document.createElement('div');
  topInfo.style.padding = '0.65rem 0.75rem';
  topInfo.style.marginBottom = '0.25rem';
  topInfo.style.fontWeight = '700';
  topInfo.style.color = 'var(--medium-gray)';
  topInfo.textContent = `Clientes distintos: ${distinct}`;
  container.appendChild(topInfo);

  ranking.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'ranking-item';
    div.onclick = () => openClienteDetails(item.cliente, rows);

    div.innerHTML = `
      <span class="ranking-item-position">${idx + 1}º</span>
      <span class="ranking-item-name">${item.cliente}</span>
      <span class="ranking-item-count">(${item.count} vezes)</span>
    `;

    container.appendChild(div);
  });
}

function buildClientesRankingText(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '';

  const map = new Map();
  for (const r of list) {
    const raw = String(getCliAfeValue(r) ?? '').trim();
    if (!raw) continue;
    const k = raw.replace(/\s+/g, ' ');
    map.set(k, (map.get(k) || 0) + 1);
  }

  if (map.size === 0) return '';

  const arr = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1]);

  const di = document.getElementById('dataInicial')?.value || '';
  const df = document.getElementById('dataFinal')?.value || '';
  const periodo = (di || df) ? `${di || '—'} até ${df || '—'}` : '—';

  const header =
    `📌 RANKING CLIENTES (CLI. AFE)\n` +
    `Regional: ${selectedRegional || '—'}\n` +
    `Período: ${periodo}\n` +
    `Reiteradas (visão atual): ${list.length}\n` +
    `Clientes distintos: ${map.size}\n\n`;

  const lines = arr.map(([cliente, qtd], idx) => `${String(idx + 1).padStart(2, '0')}. ${cliente} — ${qtd}`);
  return header + lines.join('\n');
}

/**
 * Renderizar todos os componentes
 */
function renderAll() {
  if (!currentData.length) return;

  const base = getDataWithAlimentadorFilter(currentData);

  updateRanking(base);

  const rowsFromRankingView = getRankingViewRows();
  updateCharts(rowsFromRankingView);
  updateHeatmap(rowsFromRankingView);

  // ✅ NOVO: renderiza ranking de clientes com base na visão atual
  renderRankingClientes(rowsFromRankingView);

  // ✅ Atualiza painel de estruturas com base na visão atual (ranking view)
  try {
    const catalog = getCatalogForSelectedRegional();
    updateEstruturasContext({
      regional: selectedRegional,
      rows: rowsFromRankingView,
      catalog,
      selectedAlimentadores
    });
  } catch (_) {}

  updateAlimentadoresBadge();
}

/**
 * Empty state (não carrega nada no F5)
 */
function renderEmptyState() {
  const rankingContainer = document.getElementById('rankingElemento');
  if (rankingContainer) {
    rankingContainer.innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Selecione uma <b>Regional</b> para escolher alimentadores. Depois selecione um <b>período</b> e clique em <b>Aplicar</b>.</p>';
  }

  const rankingCliente = document.getElementById('rankingCliente');
  if (rankingCliente) {
    rankingCliente.innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Carregue um período para exibir o ranking de clientes.</p>';
  }

  try { updateCharts([]); } catch (_) {}
  try { resetMap(); } catch (_) {}

  const totalEl = document.getElementById('rankingElementoTotal');
  if (totalEl) totalEl.textContent = 'Reiteradas: 0';

  updateAlimentadoresBadge();

  const estrList = document.getElementById('estrList');
  if (estrList) estrList.innerHTML = '<div class="estr-empty">Selecione Regional + Período e aplique.</div>';
}

/**
 * UI Regional (Home)
 */
function setRegionalUI(regional) {
  selectedRegional = regional;

  const btnTodos = document.getElementById('btnRegionalTodos');
  const btnAtl = document.getElementById('btnRegionalAtlantico');
  const btnNor = document.getElementById('btnRegionalNorte');
  const btnCN = document.getElementById('btnRegionalCentroNorte');

  [btnAtl, btnNor, btnCN, btnTodos].forEach(b => b?.classList.remove('active'));

  if (regional === 'ATLANTICO') btnAtl?.classList.add('active');
  if (regional === 'NORTE') btnNor?.classList.add('active');
  if (regional === 'CENTRO NORTE') btnCN?.classList.add('active');
  if (regional === 'TODOS') btnTodos?.classList.add('active');

  const label = document.getElementById('regionalAtualLabel');
  if (label) label.textContent = regional ? regional : '—';
}

/**
 * Carregar dados do Firestore PARA UM PERÍODO + REGIONAL
 */
async function loadDataByPeriod(di, df) {
  const rankingContainer = document.getElementById('rankingElemento');
  if (rankingContainer) {
    rankingContainer.innerHTML =
      '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando dados do período...</div>';
  }

  const result = await DataService.getData({
    regional: selectedRegional,
    dataInicial: di,
    dataFinal: df
  });

  if (result.success && Array.isArray(result.data) && result.data.length > 0) {
    currentData = result.data;

    const base = getDataWithAlimentadorFilter(currentData);
    if (!base.length) {
      if (rankingContainer) {
        rankingContainer.innerHTML =
          '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Nenhuma reiterada encontrada para os alimentadores selecionados neste período.</p>';
      }
      updateRanking([]);
      updateCharts([]);
      updateHeatmap([]);
      renderRankingClientes([]); // ✅ limpa ranking clientes também
      showToast('Sem reiteradas para os alimentadores selecionados no período.', 'error');
      return;
    }

    renderAll();
    showToast(`Filtro aplicado (${selectedRegional}): ${base.length} registro(s).`, 'success');
    return;
  }

  // fallback
  currentData = [];
  if (rankingContainer) {
    rankingContainer.innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Nenhum dado encontrado para o período informado nesta Regional.</p>';
  }
  updateRanking([]);
  updateCharts([]);
  updateHeatmap([]);
  renderRankingClientes([]); // ✅ limpa ranking clientes também
  showToast(`Nenhum dado encontrado (${selectedRegional}).`, 'error');
}

/**
 * Aplicar filtros (com debounce)
 */
const applyFiltersDebounced = debounce(async () => {
  const dataInicial = document.getElementById('dataInicial')?.value;
  const dataFinal = document.getElementById('dataFinal')?.value;

  const di = dataInicial ? dataInicial : '';
  const df = dataFinal ? dataFinal : '';

  if (!selectedRegional) {
    showToast('Selecione uma Regional (TODOS / ATLANTICO / NORTE / CENTRO NORTE) antes de aplicar.', 'error');
    return;
  }

  // ✅ exige escolha de alimentadores (exceto TODOS)
  if (!validateAlimentadoresSelection(false)) return;

  if (!di && !df) {
    showToast('Informe ao menos uma data (inicial ou final) para carregar.', 'error');
    return;
  }

  await loadDataByPeriod(di, df);
}, 300);

/**
 * Limpar filtros
 */
function clearFilters() {
  const di = document.getElementById('dataInicial');
  const df = document.getElementById('dataFinal');
  if (di) di.value = '';
  if (df) df.value = '';

  currentData = [];
  selectedAdditionalColumns = [];

  setElementoSearch('');
  setElementoFilter('TODOS');

  selectedAlimentadores = new Set();

  renderEmptyState();
  showToast('Filtros removidos. Selecione a Regional e aplique novamente.', 'success');
}

/**
 * Abrir modal para adicionar informações
 */
function openModalAddInfo() {
  const allColumns = getAllColumns(currentData);

  const fixedColumns = ['INCIDENCIA', 'CAUSA', 'ALIMENT', 'DATA', 'ELEMENTO', 'CONJUNTO'];
  const hiddenCols = new Set(['TMD', 'AVISOS', 'CHI', 'TMA', 'NT', 'DURACAO TOTAL'].map(c => c.trim().toUpperCase()));

  const nonFixedColumns = allColumns.filter(col => {
    const normalized = String(col).toUpperCase().trim().replace(/\./g, '');
    if (fixedColumns.includes(normalized)) return false;

    const normalizedNoDot = normalized.replace(/\./g, '');
    const normalizedWithDotSafe = String(col).toUpperCase().trim();

    if (hiddenCols.has(normalizedWithDotSafe)) return false;
    if (hiddenCols.has(normalizedNoDot)) return false;

    return true;
  });

  const listaColunas = document.getElementById('listaColunas');
  if (!listaColunas) return;

  listaColunas.innerHTML = '';

  nonFixedColumns.forEach(col => {
    const checkboxDiv = document.createElement('div');
    checkboxDiv.className = 'coluna-checkbox';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `col_${col}`;
    checkbox.value = col;
    checkbox.checked = selectedAdditionalColumns.includes(col);

    const label = document.createElement('label');
    label.htmlFor = `col_${col}`;
    label.textContent = col;

    checkboxDiv.appendChild(checkbox);
    checkboxDiv.appendChild(label);
    listaColunas.appendChild(checkboxDiv);
  });

  openModal('modalAdicionarInfo');
}

/**
 * Confirmar adição de informações
 */
function confirmAddInfo() {
  const checkboxes = document.querySelectorAll('#listaColunas input[type="checkbox"]:checked');
  selectedAdditionalColumns = Array.from(checkboxes).map(cb => cb.value);

  const modalContent = document.getElementById('detalhesConteudo');
  if (modalContent && modalContent.dataset.elemento) {
    const elemento = modalContent.dataset.elemento;

    const base = getDataWithAlimentadorFilter(currentData);
    const ocorrencias = getOcorrenciasByElemento(base, elemento);
    fillDetailsModal(elemento, ocorrencias, selectedAdditionalColumns);
  }

  closeModal('modalAdicionarInfo');
  showToast('Informações adicionais atualizadas.', 'success');
}

/**
 * Modal Campo de Inspeção (único, sem duplicar listeners)
 */
function initInspecaoModal() {
  const btn = document.getElementById('btnCampoInspecao');
  const modal = document.getElementById('modalInspecao');
  if (!btn || !modal) return;

  const closeBtn = document.getElementById('modalInspecaoClose');
  const backdrop = modal.querySelector('.modal-backdrop');

  const abrir = () => {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const fechar = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  btn.addEventListener('click', abrir);
  closeBtn?.addEventListener('click', fechar);
  backdrop?.addEventListener('click', fechar);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fechar();
  });
}

/**
 * Inicializar event listeners
 */
function initEventListeners() {
  document.getElementById('fecharModal')?.addEventListener('click', () => closeModal('modalDetalhes'));
  document.getElementById('fecharModalInfo')?.addEventListener('click', () => closeModal('modalAdicionarInfo'));
  document.getElementById('btnExportExcel')?.addEventListener('click', exportDetailsToExcel);

  document.getElementById('btnAdicionarInfo')?.addEventListener('click', openModalAddInfo);
  document.getElementById('confirmarInfo')?.addEventListener('click', confirmAddInfo);
  document.getElementById('cancelarInfo')?.addEventListener('click', () => closeModal('modalAdicionarInfo'));

  document.getElementById('aplicarFiltro')?.addEventListener('click', applyFiltersDebounced);
  document.getElementById('limparFiltro')?.addEventListener('click', clearFilters);

  // Copiar ranking ELEMENTO
  document.getElementById('copiarRankingElemento')?.addEventListener('click', async () => {
    const text = generateRankingText();
    const result = await copyToClipboard(text);
    showToast(result.success ? 'Ranking copiado!' : 'Erro ao copiar.', result.success ? 'success' : 'error');
  });

  // ✅ Copiar ranking CLIENTES (CLI. AFE)
  document.getElementById('copiarRankingClientes')?.addEventListener('click', async () => {
    if (!currentData.length) {
      showToast('Carregue um período antes de copiar CLIENTES.', 'error');
      return;
    }

    const rows = getRankingViewRows(); // respeita filtros atuais
    const text = buildClientesRankingText(rows);

    if (!text) {
      showToast('Não encontrei valores de "CLI. AFE" na visão atual.', 'error');
      return;
    }

    const result = await copyToClipboard(text);
    showToast(result.success ? 'Clientes copiado!' : 'Erro ao copiar.', result.success ? 'success' : 'error');
  });

  // Botões filtro ELEMENTO
  const btnTodos = document.getElementById('btnFiltroTodos');
  const btnTrafo = document.getElementById('btnFiltroTrafo');
  const btnFusivel = document.getElementById('btnFiltroFusivel');
  const btnOutros = document.getElementById('btnFiltroReligador');

  const setActive = (activeBtn) => {
    [btnTodos, btnTrafo, btnFusivel, btnOutros].forEach(b => b?.classList.remove('active'));
    activeBtn?.classList.add('active');
  };

  const rerenderFromRankingView = () => {
    if (!currentData.length) return;
    const rows = getRankingViewRows();
    updateCharts(rows);
    updateHeatmap(rows);
    renderRankingClientes(rows); // ✅ atualiza ranking clientes ao mudar filtro/busca
  };

  btnTodos?.addEventListener('click', () => { setElementoFilter('TODOS'); setActive(btnTodos); rerenderFromRankingView(); });
  btnTrafo?.addEventListener('click', () => { setElementoFilter('TRAFO'); setActive(btnTrafo); rerenderFromRankingView(); });
  btnFusivel?.addEventListener('click', () => { setElementoFilter('FUSIVEL'); setActive(btnFusivel); rerenderFromRankingView(); });
  btnOutros?.addEventListener('click', () => { setElementoFilter('RELIGADOR'); setActive(btnOutros); rerenderFromRankingView(); });

  setElementoFilter('TODOS');
  setActive(btnTodos);

  // busca
  const searchElemento = document.getElementById('searchElemento');
  const btnClearSearch = document.getElementById('btnClearSearchElemento');
  let searchDebounce = null;

  searchElemento?.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => {
      setElementoSearch(value);
      rerenderFromRankingView();
    }, 180);
  });

  btnClearSearch?.addEventListener('click', () => {
    if (searchElemento) searchElemento.value = '';
    setElementoSearch('');
    rerenderFromRankingView();
    searchElemento?.focus();
  });

  // Clique no gráfico de alimentador filtra heatmap
  document.addEventListener('alimentador:selected', (e) => {
    const detail = e?.detail || {};
    const nome = detail.nome || '—';
    const qtd = Number(detail.qtd || 0);
    const ocorrencias = Array.isArray(detail.ocorrencias) ? detail.ocorrencias : [];

    const info = document.getElementById('mapHeatInfo');
    if (info) info.textContent = `• ${nome} — Reiteradas: ${qtd}`;

    try { updateHeatmap(ocorrencias); } catch (_) {}
  });

  // Modal inspeção (único)
  initInspecaoModal();
}

/**
 * Inicializar aplicação
 */
async function init() {
  initModalEvents();
  initEventListeners();
  initMap();
  initEstruturasPanel();

  renderEmptyState();
  setMapRegional('TODOS');
  resetMap();
  updateHeatmap([]);

  // ✅ setup do modal catálogo
  const alimModal = setupAlimentadoresCatalogModal({
    getSelectedRegional: () => selectedRegional,
    onMissingRegional: () => showToast('Selecione uma Regional primeiro.', 'error')
  });

  // Badge abre modal (exceto TODOS)
  document.getElementById('badgeOpenAlimentadores')?.addEventListener('click', () => {
    if (selectedRegional === 'TODOS') {
      showToast('No modo TODOS não há seleção de alimentadores. Use apenas o período.', 'info');
      return;
    }
    alimModal.open();
  });

  // ✅ recebe seleção do modal
  document.addEventListener('alimentadores:changed', async (e) => {
    const d = e?.detail || {};
    const regional = String(d.regional || selectedRegional || '').trim().toUpperCase();
    const mode = String(d.mode || '').trim().toUpperCase();
    const alims = Array.isArray(d.alimentadores) ? d.alimentadores : [];

    if (regional) {
      selectedRegional = regional;
      setRegionalUI(regional);
      setMapRegional(regional);
    }

    if (mode === 'TODOS') {
      const all = getCatalogForSelectedRegional();
      selectedAlimentadores = new Set(all.map(a => normKey(a)));
    } else {
      selectedAlimentadores = new Set(alims.map(a => normKey(a)));
    }

    updateAlimentadoresBadge();

    // se já tiver data, aplica
    const di = document.getElementById('dataInicial')?.value || '';
    const df = document.getElementById('dataFinal')?.value || '';
    if (di || df) {
      await applyFiltersDebounced();
    } else if (currentData.length) {
      renderAll();
    }
  });

  // Regional -> abre modal (exceto TODOS)
  document.getElementById('btnRegionalAtlantico')?.addEventListener('click', () => {
    setRegionalUI('ATLANTICO');
    setMapRegional('ATLANTICO');
    currentData = [];
    selectedAdditionalColumns = [];
    selectedAlimentadores = new Set();
    renderEmptyState();
    showToast('Regional selecionada: ATLANTICO. Selecione alimentadores e depois o período.', 'success');
    alimModal.open();
  });

  document.getElementById('btnRegionalNorte')?.addEventListener('click', () => {
    setRegionalUI('NORTE');
    setMapRegional('NORTE');
    currentData = [];
    selectedAdditionalColumns = [];
    selectedAlimentadores = new Set();
    renderEmptyState();
    showToast('Regional selecionada: NORTE. Selecione alimentadores e depois o período.', 'success');
    alimModal.open();
  });

  document.getElementById('btnRegionalCentroNorte')?.addEventListener('click', () => {
    setRegionalUI('CENTRO NORTE');
    setMapRegional('CENTRO NORTE');
    currentData = [];
    selectedAdditionalColumns = [];
    selectedAlimentadores = new Set();
    renderEmptyState();
    showToast('Regional selecionada: CENTRO NORTE. Selecione alimentadores e depois o período.', 'success');
    alimModal.open();
  });

  // ✅ TODOS (não abre modal)
  document.getElementById('btnRegionalTodos')?.addEventListener('click', () => {
    setRegionalUI('TODOS');
    setMapRegional('TODOS');

    currentData = [];
    selectedAdditionalColumns = [];
    selectedAlimentadores = new Set(); // sem filtro

    renderEmptyState();
    showToast('Regional selecionada: TODOS. Informe período e clique em Aplicar.', 'success');
  });

  updateAlimentadoresBadge();
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}