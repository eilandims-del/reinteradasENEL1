// =========================
// FILE: js/main.js
// =========================
/**
 * Script Principal - Dashboard
 */

import { DataService } from './services/firebase-service.js';
import { getAllColumns, getOcorrenciasByElemento, normKey, getFieldValue } from './services/data-service.js';
import { ALIMENTADORES_POR_REGIONAL } from './constants/alimentadores.js';

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

let currentData = [];
let selectedAdditionalColumns = [];

// ✅ filtro alimentadores (global)
let selectedAlimentadores = new Set(); // normKey(alimentador completo)
let alimentadorFilterActive = false;   // false => “Todos”

// ✅ Regional selecionada (obrigatório para carregar)
let selectedRegional = ''; // 'ATLANTICO' | 'NORTE' | 'CENTRO NORTE'

function getDataWithAlimentadorFilter(data) {
  const rows = Array.isArray(data) ? data : [];

  // “Todos” (sem filtro)
  if (!alimentadorFilterActive) return rows;

  // se ativou filtro mas não selecionou nada, não retorna nada
  if (!selectedAlimentadores || selectedAlimentadores.size === 0) return [];

  return rows.filter(row => {
    const alimRaw =
      getFieldValue(row, 'ALIMENT.') ||
      getFieldValue(row, 'ALIMENTADOR') ||
      getFieldValue(row, 'ALIMENT');

    const key = normKey(alimRaw);
    return selectedAlimentadores.has(key);
  });
}

/**
 * Inicializar aplicação
 */
async function init() {
  initModalEvents();
  initEventListeners();
  initMap();

  // estado inicial
  renderEmptyState();
  setMapRegional('TODOS');
  resetMap();
  updateHeatmap([]);
}

/**
 * Empty state (não carrega nada no F5)
 */
function renderEmptyState() {
  const rankingContainer = document.getElementById('rankingElemento');

  if (rankingContainer) {
    rankingContainer.innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Selecione uma <b>Regional</b> e um <b>período</b>, depois clique em <b>Aplicar</b> para carregar os dados.</p>';
  }

  try { updateCharts([]); } catch (_) {}
  try { resetMap(); } catch (_) {}

  const totalEl = document.getElementById('rankingElementoTotal');
  if (totalEl) totalEl.textContent = 'Reiteradas: 0';
}

/**
 * UI Regional (Home)
 */
function setRegionalUI(regional) {
  selectedRegional = regional;

  const btnAtl = document.getElementById('btnRegionalAtlantico');
  const btnNor = document.getElementById('btnRegionalNorte');
  const btnCN = document.getElementById('btnRegionalCentroNorte');

  [btnAtl, btnNor, btnCN].forEach(b => b?.classList.remove('active'));

  if (regional === 'ATLANTICO') btnAtl?.classList.add('active');
  if (regional === 'NORTE') btnNor?.classList.add('active');
  if (regional === 'CENTRO NORTE') btnCN?.classList.add('active');

  const label = document.getElementById('regionalAtualLabel');
  if (label) label.textContent = regional ? regional : '—';
}

/* =========================
   Alimentadores helpers (Modal)
========================= */

function showAlimSection() {
  const sec = document.getElementById('alimFilterSection');
  if (sec) sec.style.display = 'block';
}

function resetAlimUIEmpty() {
  // “Todos” por padrão (sem filtro)
  alimentadorFilterActive = false;
  selectedAlimentadores = new Set();

  // Modal
  const list = document.getElementById('alimList');
  const hint = document.getElementById('alimHint');
  const search = document.getElementById('alimSearch');

  if (list) list.innerHTML = '';
  if (search) search.value = '';

  if (hint) {
    hint.style.display = 'block';
    hint.innerHTML = 'Selecione o período e clique em <b>Aplicar</b> para listar alimentadores.';
  }

  // Card (mensagem acima do botão)
  const hintTop = document.getElementById('alimHintTop');
  if (hintTop) {
    hintTop.innerHTML = 'Selecione o período e clique em <b>Aplicar</b> para habilitar a lista de alimentadores.';
  }
}

function renderAlimentadoresFromData(rows) {
  const listEl = document.getElementById('alimList');
  const hint = document.getElementById('alimHint');
  if (!listEl) return;

  const regionalKey = (selectedRegional || '').toUpperCase().trim();
  const catalog = ALIMENTADORES_POR_REGIONAL[regionalKey] || [];

  // conta ocorrências reais no período
  const counts = new Map(); // alimKey -> qtd

  (rows || []).forEach(r => {
    const raw =
      getFieldValue(r, 'ALIMENT.') ||
      getFieldValue(r, 'ALIMENTADOR') ||
      getFieldValue(r, 'ALIMENT');

    const key = normKey(raw);
    if (!key) return;

    counts.set(key, (counts.get(key) || 0) + 1);
  });

  // reset: “Todos” (sem filtro)
  alimentadorFilterActive = false;
  selectedAlimentadores = new Set();

  listEl.innerHTML = '';

  if (!catalog.length) {
    if (hint) {
      hint.style.display = 'block';
      hint.innerHTML = 'Catálogo de alimentadores não encontrado para esta regional.';
    }
    const hintTop = document.getElementById('alimHintTop');
    if (hintTop) hintTop.innerHTML = 'Catálogo de alimentadores não encontrado para esta regional.';
    return;
  }

  if (hint) hint.style.display = 'none';

  // render organizado: ordem do catálogo
  catalog.forEach(alim => {
    const key = normKey(alim);
    const qtd = counts.get(key) || 0;

    const chip = document.createElement('label');
    chip.className = 'alim-chip';
    chip.dataset.key = key;

    const disabled = qtd === 0;

    chip.innerHTML = `
      <span class="alim-left">
        <input type="checkbox" value="${key}" ${disabled ? 'disabled' : ''}>
        <span class="alim-name">${alim}</span>
      </span>
      <small class="alim-count">${qtd}</small>
    `;

    if (disabled) chip.classList.add('disabled');

    const input = chip.querySelector('input');
    input.addEventListener('change', () => {
      chip.classList.toggle('active', input.checked);

      const checked = Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked'))
        .map(i => i.value);

      selectedAlimentadores = new Set(checked);
      alimentadorFilterActive = selectedAlimentadores.size > 0;

      // 🔥 linka ranking/cards/mapa
      renderAll();
    });

    listEl.appendChild(chip);
  });

  // hints (Modal + Card)
  const totalCatalogo = catalog.length;
  const disponiveis = catalog.filter(a => (counts.get(normKey(a)) || 0) > 0).length;

  const hint2 = document.getElementById('alimHint');
  if (hint2) {
    hint2.style.display = 'block';
    hint2.innerHTML = `Disponíveis no período: <b>${disponiveis}</b> • Catálogo: <b>${totalCatalogo}</b>`;
  }

  const hintTop = document.getElementById('alimHintTop');
  if (hintTop) {
    hintTop.innerHTML = `Clique em <b>ALIMENTADORES</b> para selecionar (disponíveis no período: <b>${disponiveis}</b>).`;
  }
}

/**
 * Renderizar todos os componentes
 */
function renderAll() {
  if (currentData.length === 0) return;

  const base = getDataWithAlimentadorFilter(currentData);

  // 1) Ranking elemento baseado no recorte (alimentadores)
  updateRanking(base);

  // 2) visão do ranking (filtro/busca)
  const rowsFromRankingView = getRankingViewRows();

  updateCharts(rowsFromRankingView);
  updateHeatmap(rowsFromRankingView);
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

  document.getElementById('aplicarFiltro')?.addEventListener('click', applyFilters);
  document.getElementById('limparFiltro')?.addEventListener('click', clearFilters);

  // Botão que abre o modal de alimentadores
  document.getElementById('btnOpenAlimentadores')?.addEventListener('click', () => {
    openModal('modalAlimentadores');
  });

  // Regional (Home)
  document.getElementById('btnRegionalAtlantico')?.addEventListener('click', async () => {
    setRegionalUI('ATLANTICO');
    setMapRegional('ATLANTICO');

    // fecha modal se estiver aberto (evita “lista de outra regional”)
    closeModal('modalAlimentadores');

    currentData = [];
    renderEmptyState();
    showToast('Regional selecionada: ATLANTICO. Selecione o período e clique em Aplicar.', 'success');
    showAlimSection();
    resetAlimUIEmpty();
  });

  document.getElementById('btnRegionalNorte')?.addEventListener('click', async () => {
    setRegionalUI('NORTE');
    setMapRegional('NORTE');

    closeModal('modalAlimentadores');

    currentData = [];
    renderEmptyState();
    showToast('Regional selecionada: NORTE. Selecione o período e clique em Aplicar.', 'success');
    showAlimSection();
    resetAlimUIEmpty();
  });

  document.getElementById('btnRegionalCentroNorte')?.addEventListener('click', async () => {
    setRegionalUI('CENTRO NORTE');
    setMapRegional('CENTRO NORTE');

    closeModal('modalAlimentadores');

    currentData = [];
    renderEmptyState();
    showToast('Regional selecionada: CENTRO NORTE. Selecione o período e clique em Aplicar.', 'success');
    showAlimSection();
    resetAlimUIEmpty();
  });

  // Copiar ranking
  document.getElementById('copiarRankingElemento')?.addEventListener('click', async () => {
    const text = generateRankingText();
    const result = await copyToClipboard(text);
    showToast(result.success ? 'Ranking copiado!' : 'Erro ao copiar.', result.success ? 'success' : 'error');
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

  /* =========================
     Modal Alimentadores - ações
  ========================= */

  // ✅ “Todos” de verdade = SEM filtro (mostra tudo)
  document.getElementById('btnAlimAll')?.addEventListener('click', () => {
    const listEl = document.getElementById('alimList');
    if (!listEl) return;

    // desmarca tudo visualmente
    listEl.querySelectorAll('input[type="checkbox"]').forEach(i => {
      i.checked = false;
      i.closest('.alim-chip')?.classList.remove('active');
    });

    selectedAlimentadores = new Set();
    alimentadorFilterActive = false;

    renderAll();
  });

  // Limpar também = sem filtro
  document.getElementById('btnAlimClear')?.addEventListener('click', () => {
    const listEl = document.getElementById('alimList');
    if (!listEl) return;

    listEl.querySelectorAll('input[type="checkbox"]').forEach(i => {
      i.checked = false;
      i.closest('.alim-chip')?.classList.remove('active');
    });

    selectedAlimentadores = new Set();
    alimentadorFilterActive = false;

    renderAll();
  });

  // Busca no modal
  document.getElementById('alimSearch')?.addEventListener('input', (e) => {
    const term = String(e.target.value || '').trim().toUpperCase();
    const listEl = document.getElementById('alimList');
    if (!listEl) return;

    Array.from(listEl.children).forEach(chip => {
      const text = chip.textContent.toUpperCase();
      chip.style.display = text.includes(term) ? 'flex' : 'none';
    });
  });
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

  if (result.success && result.data.length > 0) {
    currentData = result.data;

    // lista alimentadores (do dataset completo do período)
    renderAlimentadoresFromData(currentData);

    // renderiza tudo (respeitando “Todos” inicialmente)
    renderAll();

    showToast(`Filtro aplicado (${selectedRegional}): ${currentData.length} registro(s).`, 'success');
  } else {
    currentData = [];

    if (rankingContainer) {
      rankingContainer.innerHTML =
        '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Nenhum dado encontrado para o período informado nesta Regional.</p>';
    }

    updateCharts([]);
    updateHeatmap([]);
    showToast(`Nenhum dado encontrado (${selectedRegional}).`, 'error');
  }
}

/**
 * Aplicar filtros (com debounce)
 */
const applyFiltersDebounced = debounce(async () => {
  const dataInicial = document.getElementById('dataInicial')?.value;
  const dataFinal = document.getElementById('dataFinal')?.value;

  const di = dataInicial ? dataInicial.split('T')[0] : '';
  const df = dataFinal ? dataFinal.split('T')[0] : '';

  if (!selectedRegional) {
    showToast('Selecione uma Regional (ATLANTICO / NORTE / CENTRO NORTE) antes de aplicar.', 'error');
    return;
  }

  if (!di && !df) {
    showToast('Informe ao menos uma data (inicial ou final) para carregar.', 'error');
    return;
  }

  await loadDataByPeriod(di, df);
}, 300);

function applyFilters() {
  applyFiltersDebounced();
}

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

  // reset filtro alimentadores
  alimentadorFilterActive = false;
  selectedAlimentadores = new Set();
  resetAlimUIEmpty();

  renderEmptyState();
  showToast('Filtros removidos. Selecione o período e aplique novamente.', 'success');
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

    // respeita filtro de alimentadores no modal de detalhes
    const base = getDataWithAlimentadorFilter(currentData);

    const ocorrencias = getOcorrenciasByElemento(base, elemento);
    fillDetailsModal(elemento, ocorrencias, selectedAdditionalColumns);
  }

  closeModal('modalAdicionarInfo');
  showToast('Informações adicionais atualizadas.', 'success');
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
