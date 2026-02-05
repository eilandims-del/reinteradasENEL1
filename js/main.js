// =========================
// FILE: js/main.js
// =========================
/**
 * Script Principal - Dashboard
 *
 * Fluxo:
 * 1) Seleciona Regional  -> abre Modal de Alimentadores (obrigatório escolher)
 * 2) Seleciona Alimentadores (ou "TODOS")
 * 3) Seleciona período (data inicial/final) e clica em Aplicar (ou Aplicar do modal)
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

// ✅ Alimentadores
let selectedAlimentadores = new Set(); // Set(normKey(alimentador completo))

// ✅ Modo e obrigatoriedade
// - 'NONE'  : ainda não escolheu nada (obrigatório decidir)
// - 'TODOS' : sem filtro
// - 'CUSTOM': selecionou 1+ alimentadores
let alimSelectionMode = 'NONE';
let alimTouched = false;

// ✅ Regional selecionada
let selectedRegional = ''; // 'ATLANTICO' | 'NORTE' | 'CENTRO NORTE'

function alimentadorFilterActive() {
  return alimSelectionMode === 'CUSTOM' && selectedAlimentadores.size > 0;
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

/**
 * Inicializar aplicação
 */
async function init() {
  initModalEvents();
  initEventListeners();
  initMap();

  renderEmptyState();
  setMapRegional('TODOS');
  resetMap();
  updateHeatmap([]);

  // ✅ Guard global: bloqueia fechar modalAlimentadores se inválido
  window.__beforeCloseModal = (modalId) => {
    if (modalId !== 'modalAlimentadores') return true;
  
    const ok = validateAlimentadoresSelection(true);
    if (!ok) showToast('Escolha TODOS ou selecione 1+ alimentadores antes de fechar.', 'error');
    return ok;
  };
  
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

  try { updateCharts([]); } catch (_) {}
  try { resetMap(); } catch (_) {}

  const totalEl = document.getElementById('rankingElementoTotal');
  if (totalEl) totalEl.textContent = 'Reiteradas: 0';

  updateAlimentadoresBadge();
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
   Alimentadores (Modal)
========================= */

function getCatalogForSelectedRegional() {
  const regionalKey = (selectedRegional || '').toUpperCase().trim();
  return ALIMENTADORES_POR_REGIONAL[regionalKey] || [];
}

function badgeHTML(text) {
  return `<i class="fas fa-diagram-project"></i> ${text}`;
}

function updateAlimentadoresBadge() {
  const el = document.getElementById('badgeOpenAlimentadores');
  if (!el) return;

  const setBadge = (txt) => {
    el.innerHTML = `<i class="fas fa-diagram-project"></i> ${txt}`;
  };

  if (!selectedRegional) {
    setBadge('Alimentadores: —');
    return;
  }

  const catalog = getCatalogForSelectedRegional();
  const totalCatalog = catalog.length;

  if (!totalCatalog) {
    setBadge('Alimentadores: —');
    return;
  }

  // TODOS = Set tem o tamanho do catálogo
  if (selectedAlimentadores.size === totalCatalog) {
    setBadge('Alimentadores: TODOS');
    return;
  }

  if (selectedAlimentadores.size > 0) {
    setBadge(`Alimentadores: ${selectedAlimentadores.size}`);
    return;
  }

  // Ainda não selecionou nada (estado inicial antes de confirmar)
  setBadge('Alimentadores: (selecionar)');
}


function updateAlimentadoresHint(hintEl, catalog, countsMap) {
  const total = catalog.length;
  const selected = selectedAlimentadores.size;

  const hasCounts = countsMap && countsMap.size > 0;
  const disponiveis = hasCounts
    ? catalog.filter(a => (countsMap.get(normKey(a)) || 0) > 0).length
    : null;

  if (!alimTouched || alimSelectionMode === 'NONE') {
    hintEl.innerHTML = `Escolha <b>TODOS</b> ou selecione 1+ alimentadores. • Catálogo: <b>${total}</b>`;
    return;
  }

  if (alimSelectionMode === 'TODOS') {
    hintEl.innerHTML = hasCounts
      ? `Modo: <b>TODOS</b> • Disponíveis no período: <b>${disponiveis}</b> • Catálogo: <b>${total}</b>`
      : `Modo: <b>TODOS</b> • Catálogo: <b>${total}</b>`;
    return;
  }

  // CUSTOM
  hintEl.innerHTML = hasCounts
    ? `Selecionados: <b>${selected}</b> • Disponíveis no período: <b>${disponiveis}</b> • Catálogo: <b>${total}</b>`
    : `Selecionados: <b>${selected}</b> • Catálogo: <b>${total}</b>`;
}

let __alimCloseWarnTimer = 0;

function warnObrigatorioOnce() {
  // evita spam de toast se clicar várias vezes rápido
  const now = Date.now();
  if (now - __alimCloseWarnTimer < 900) return;
  __alimCloseWarnTimer = now;
  showToast('Escolha "TODOS" ou selecione 1+ alimentadores antes de fechar.', 'error');
}

function validateAlimentadoresSelection(silent = false) {
  if (!selectedRegional) {
    if (!silent) showToast('Selecione uma Regional primeiro.', 'error');
    return false;
  }

  const catalog = getCatalogForSelectedRegional();
  const totalCatalog = catalog.length;

  // Se o catálogo não existir, não deixa avançar
  if (!totalCatalog) {
    if (!silent) showToast('Catálogo de alimentadores não encontrado para esta regional.', 'error');
    return false;
  }

  // Considera válido se:
  // - selecionou pelo menos 1 alimentador
  // - ou selecionou TODOS (que, no nosso caso, é quando o Set tem o tamanho do catálogo)
  const isAll = selectedAlimentadores.size === totalCatalog;
  const hasOneOrMore = selectedAlimentadores.size > 0;

  if (isAll || hasOneOrMore) return true;

  if (!silent) showToast('Selecione TODOS ou pelo menos 1 alimentador.', 'error');
  return false;
}



function openAlimentadoresModal() {
  if (!selectedRegional) {
    showToast('Selecione uma Regional primeiro.', 'error');
    return;
  }

  const catalog = getCatalogForSelectedRegional();
  if (!catalog.length) {
    showToast('Catálogo de alimentadores não encontrado para esta regional.', 'error');
    return;
  }

  const modal = document.getElementById('modalAlimentadores');
  const listEl = document.getElementById('alimListModal');
  const hintEl = document.getElementById('alimHintModal');
  const searchEl = document.getElementById('alimSearchModal');

  const btnTodos = document.getElementById('btnAlimAllModal');
  const btnLimpar = document.getElementById('btnAlimClearModal');
  const btnConfirmar = document.getElementById('btnConfirmarAlimModal');

  if (!modal || !listEl || !hintEl || !btnTodos || !btnLimpar || !btnConfirmar) {
    console.error('[ALIMENTADORES] Elementos do modal não encontrados. Confira os IDs no index.html');
    return;
  }

  if (searchEl) searchEl.value = '';

  // Contagem real (se já tiver dataset carregado)
  const baseRows = Array.isArray(currentData) ? currentData : [];
  const counts = new Map();
  baseRows.forEach(r => {
    const raw =
      getFieldValue(r, 'ALIMENT.') ||
      getFieldValue(r, 'ALIMENTADOR') ||
      getFieldValue(r, 'ALIMENT');

    const k = normKey(raw);
    if (!k) return;
    counts.set(k, (counts.get(k) || 0) + 1);
  });

  const totalCatalog = catalog.length;

  const renderHint = () => {
    // TODOS = selecionou tudo
    if (selectedAlimentadores.size === totalCatalog) {
      hintEl.innerHTML = `Modo: <b>TODOS</b> • Catálogo: <b>${totalCatalog}</b>`;
      return;
    }

    if (selectedAlimentadores.size > 0) {
      hintEl.innerHTML = `Selecionados: <b>${selectedAlimentadores.size}</b> • Catálogo: <b>${totalCatalog}</b>`;
      return;
    }

    hintEl.innerHTML = `Escolha <b>TODOS</b> ou selecione <b>1+</b> alimentadores.`;
  };

  const renderList = () => {
    listEl.innerHTML = '';

    catalog.forEach(alim => {
      const key = normKey(alim);
      const qtd = counts.get(key);

      const checked = selectedAlimentadores.has(key);

      const row = document.createElement('label');
      row.className = 'alim-chip';
      row.dataset.key = key;

      row.innerHTML = `
        <span class="alim-left">
          <input type="checkbox" value="${key}" ${checked ? 'checked' : ''}>
          <span class="alim-name">${alim}</span>
        </span>
        <small class="alim-count">${Number.isFinite(qtd) ? qtd : ''}</small>
      `;

      const input = row.querySelector('input');
      row.classList.toggle('active', checked);

      input.onchange = () => {
        row.classList.toggle('active', input.checked);
        if (input.checked) selectedAlimentadores.add(key);
        else selectedAlimentadores.delete(key);

        renderHint();
        updateAlimentadoresBadge();
      };

      listEl.appendChild(row);
    });

    renderHint();
    updateAlimentadoresBadge();
  };

  // ✅ TODOS: seleciona tudo + fecha + aplica se já tiver data
  btnTodos.onclick = async (e) => {
    e.preventDefault();

    selectedAlimentadores = new Set(catalog.map(a => normKey(a)));

    renderHint();
    updateAlimentadoresBadge();

    const di = document.getElementById('dataInicial')?.value || '';
    const df = document.getElementById('dataFinal')?.value || '';

    // Se tem data, já recarrega e atualiza cards
    if (di || df) {
      await applyFiltersDebounced();
    } else if (currentData.length) {
      renderAll();
    }

    closeModal('modalAlimentadores');
  };

  // ✅ LIMPAR: deixa vazio (inválido para fechar, até marcar 1+)
  btnLimpar.onclick = (e) => {
    e.preventDefault();
    selectedAlimentadores = new Set();
    renderList();
  };

  // Busca
  if (searchEl) {
    searchEl.oninput = (e) => {
      const term = String(e.target.value || '').trim().toUpperCase();
      Array.from(listEl.children).forEach(chip => {
        const text = chip.textContent.toUpperCase();
        chip.style.display = text.includes(term) ? 'flex' : 'none';
      });
    };
  }

  // ✅ CONFIRMAR = aplica (se tiver data, recarrega; senão aplica local)
  btnConfirmar.onclick = async (e) => {
    e.preventDefault();

    if (!validateAlimentadoresSelection(false)) return;

    const di = document.getElementById('dataInicial')?.value || '';
    const df = document.getElementById('dataFinal')?.value || '';

    if (di || df) {
      await applyFiltersDebounced();
      closeModal('modalAlimentadores');
      return;
    }

    if (currentData.length) {
      renderAll();
      closeModal('modalAlimentadores');
      return;
    }

    showToast('Selecione um período para carregar os dados.', 'error');
  };

  // Render inicial e abre
  renderList();
  openModal('modalAlimentadores');
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

  updateAlimentadoresBadge();
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

  // Badge abre modal
  document.getElementById('badgeOpenAlimentadores')?.addEventListener('click', () => {
    if (!selectedRegional) {
      showToast('Selecione uma Regional primeiro.', 'error');
      return;
    }
    openAlimentadoresModal();
  });

  // Regional -> abre modal alimentadores (obrigatório escolher)
  document.getElementById('btnRegionalAtlantico')?.addEventListener('click', async () => {
    setRegionalUI('ATLANTICO');
    setMapRegional('ATLANTICO');

    currentData = [];
    selectedAdditionalColumns = [];

    // reset seleção (agora obrigatório escolher)
    alimSelectionMode = 'NONE';
    alimTouched = false;
    selectedAlimentadores = new Set();

    renderEmptyState();
    showToast('Regional selecionada: ATLANTICO. Selecione alimentadores (obrigatório) e depois o período.', 'success');
    openAlimentadoresModal();
  });

  document.getElementById('btnRegionalNorte')?.addEventListener('click', async () => {
    setRegionalUI('NORTE');
    setMapRegional('NORTE');

    currentData = [];
    selectedAdditionalColumns = [];

    alimSelectionMode = 'NONE';
    alimTouched = false;
    selectedAlimentadores = new Set();

    renderEmptyState();
    showToast('Regional selecionada: NORTE. Selecione alimentadores (obrigatório) e depois o período.', 'success');
    openAlimentadoresModal();
  });

  document.getElementById('btnRegionalCentroNorte')?.addEventListener('click', async () => {
    setRegionalUI('CENTRO NORTE');
    setMapRegional('CENTRO NORTE');

    currentData = [];
    selectedAdditionalColumns = [];

    alimSelectionMode = 'NONE';
    alimTouched = false;
    selectedAlimentadores = new Set();

    renderEmptyState();
    showToast('Regional selecionada: CENTRO NORTE. Selecione alimentadores (obrigatório) e depois o período.', 'success');
    openAlimentadoresModal();
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

  updateAlimentadoresBadge();
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

  const di = dataInicial ? dataInicial : '';
  const df = dataFinal ? dataFinal : '';

  if (!selectedRegional) {
    showToast('Selecione uma Regional (ATLANTICO / NORTE / CENTRO NORTE) antes de aplicar.', 'error');
    return;
  }

  // ✅ exige escolha de alimentadores
  if (!validateAlimentadoresSelection(false)) return;

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

  // reset seleção alimentadores (volta a exigir escolher)
  alimSelectionMode = 'NONE';
  alimTouched = false;
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

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
