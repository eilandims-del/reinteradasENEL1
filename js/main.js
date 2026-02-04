// =========================
// FILE: js/main.js
// =========================
/**
 * Script Principal - Dashboard
 */

import { DataService } from './services/firebase-service.js';
import { getAllColumns, getOcorrenciasByElemento } from './services/data-service.js';
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

// ✅ Regional selecionada (obrigatório para carregar)
let selectedRegional = ''; // 'ATLANTICO' | 'NORTE' | 'CENTRO NORTE'

/**
 * Inicializar aplicação
 */
async function init() {
  initModalEvents();
  initEventListeners();
  initMap();

  // estado inicial
  renderEmptyState();
  setMapRegional('TODOS'); // mapa inicia sem recorte
  resetMap(); // limpa qualquer overlay sem puxar KML nem desenhar nada  
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
  

  // reset total do ranking
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

/**
 * Inicializar event listeners
 */
function initEventListeners() {
  // Fechar modal detalhes (X)
  document.getElementById('fecharModal')?.addEventListener('click', () => closeModal('modalDetalhes'));

  // Fechar modal info (X)
  document.getElementById('fecharModalInfo')?.addEventListener('click', () => closeModal('modalAdicionarInfo'));

  // Exportar Excel (Detalhes do ELEMENTO)
  document.getElementById('btnExportExcel')?.addEventListener('click', exportDetailsToExcel);

  // Abrir/confirmar info adicional
  document.getElementById('btnAdicionarInfo')?.addEventListener('click', openModalAddInfo);
  document.getElementById('confirmarInfo')?.addEventListener('click', confirmAddInfo);
  document.getElementById('cancelarInfo')?.addEventListener('click', () => closeModal('modalAdicionarInfo'));

  // Filtro de data
  document.getElementById('aplicarFiltro')?.addEventListener('click', applyFilters);
  document.getElementById('limparFiltro')?.addEventListener('click', clearFilters);

  // ✅ Regional (Home) — NÃO carrega mapa/dados ao clicar (apenas seleciona)
  document.getElementById('btnRegionalAtlantico')?.addEventListener('click', async () => {
    setRegionalUI('ATLANTICO');
    setMapRegional('ATLANTICO'); // só atualiza label do mapa
    currentData = [];
    renderEmptyState();
    showToast('Regional selecionada: ATLANTICO. Selecione o período e clique em Aplicar.', 'success');
  });

  document.getElementById('btnRegionalNorte')?.addEventListener('click', async () => {
    setRegionalUI('NORTE');
    setMapRegional('NORTE');
    currentData = [];
    renderEmptyState();
    showToast('Regional selecionada: NORTE. Selecione o período e clique em Aplicar.', 'success');
  });

  document.getElementById('btnRegionalCentroNorte')?.addEventListener('click', async () => {
    setRegionalUI('CENTRO NORTE');
    setMapRegional('CENTRO NORTE');
    currentData = [];
    renderEmptyState();
    showToast('Regional selecionada: CENTRO NORTE. Selecione o período e clique em Aplicar.', 'success');
  });

  // Copiar ranking (ELEMENTO)
  document.getElementById('copiarRankingElemento')?.addEventListener('click', async () => {
    const text = generateRankingText();
    const result = await copyToClipboard(text);
    showToast(result.success ? 'Ranking copiado!' : 'Erro ao copiar.', result.success ? 'success' : 'error');
  });

  // Botões filtro ELEMENTO
  const btnTodos = document.getElementById('btnFiltroTodos');
  const btnTrafo = document.getElementById('btnFiltroTrafo');
  const btnFusivel = document.getElementById('btnFiltroFusivel');
  const btnOutros = document.getElementById('btnFiltroReligador'); // RELIGADOR

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

  btnTodos?.addEventListener('click', () => {
    setElementoFilter('TODOS');
    setActive(btnTodos);
    rerenderFromRankingView();
  });

  btnTrafo?.addEventListener('click', () => {
    setElementoFilter('TRAFO');
    setActive(btnTrafo);
    rerenderFromRankingView();
  });

  btnFusivel?.addEventListener('click', () => {
    setElementoFilter('FUSIVEL');
    setActive(btnFusivel);
    rerenderFromRankingView();
  });

  btnOutros?.addEventListener('click', () => {
    setElementoFilter('RELIGADOR');
    setActive(btnOutros);
    rerenderFromRankingView();
  });

  // estado inicial ranking
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
}

/**
 * Renderizar todos os componentes
 */
function renderAll() {
  if (currentData.length === 0) return;

  // 1) Ranking elemento
  updateRanking(currentData);

  // 2) Tudo baseado na visão do Ranking Elemento (filtro + busca)
  const rowsFromRankingView = getRankingViewRows();
  updateCharts(rowsFromRankingView);
  updateHeatmap(rowsFromRankingView);
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
 * ✅ exige: regional + data
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
 * ✅ mantém regional selecionada, mas zera dados
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
    const ocorrencias = getOcorrenciasByElemento(currentData, elemento);
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
