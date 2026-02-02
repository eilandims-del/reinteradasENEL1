/**
 * Script Principal - Dashboard
 */

import { DataService } from './services/firebase-service.js';
import { getAllColumns, getOcorrenciasByElemento } from './services/data-service.js';
import { updateRanking, generateRankingText, setElementoFilter, setElementoSearch, getRankingViewRows } from './components/ranking.js';
import { updateCharts } from './components/charts.js';
import { updateHeatmap, initMap } from './components/mapa.js';
import { openModal, closeModal, initModalEvents, fillDetailsModal, exportDetailsToExcel } from './components/modal.js';
import { copyToClipboard, showToast, debounce } from './utils/helpers.js';

let currentData = [];
let selectedAdditionalColumns = [];

/**
 * Inicializar aplicação
 */
async function init() {
  initModalEvents();
  initEventListeners();
  initMap();

  // Economia: não carrega tudo no F5
  renderEmptyState();
}

function renderEmptyState() {
  const rankingContainer = document.getElementById('rankingElemento');
  if (rankingContainer) {
    rankingContainer.innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Selecione um período e clique em <b>Aplicar Filtro</b> para carregar os dados.</p>';
  }
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

  btnTodos?.addEventListener('click', () => {
    setElementoFilter('TODOS');
    setActive(btnTodos);

    if (!currentData.length) return;

    const rows = getRankingViewRows();
    updateCharts(rows);
    updateHeatmap(rows);
  });

  btnTrafo?.addEventListener('click', () => {
    setElementoFilter('TRAFO');
    setActive(btnTrafo);

    if (!currentData.length) return;

    const rows = getRankingViewRows();
    updateCharts(rows);
    updateHeatmap(rows);
  });

  btnFusivel?.addEventListener('click', () => {
    setElementoFilter('FUSIVEL');
    setActive(btnFusivel);

    if (!currentData.length) return;

    const rows = getRankingViewRows();
    updateCharts(rows);
    updateHeatmap(rows);
  });

  btnOutros?.addEventListener('click', () => {
    setElementoFilter('RELIGADOR');
    setActive(btnOutros);

    if (!currentData.length) return;

    const rows = getRankingViewRows();
    updateCharts(rows);
    updateHeatmap(rows);
  });

  // estado inicial visual
  setElementoFilter('TODOS');
  setActive(btnTodos);

  // busca com debounce
  const searchElemento = document.getElementById('searchElemento');
  const btnClearSearch = document.getElementById('btnClearSearchElemento');

  let searchDebounce = null;

  searchElemento?.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;

    searchDebounce = setTimeout(() => {
      setElementoSearch(value);

      if (!currentData.length) return;

      const rows = getRankingViewRows();
      updateCharts(rows);
      updateHeatmap(rows);
    }, 180);
  });

  btnClearSearch?.addEventListener('click', () => {
    if (searchElemento) searchElemento.value = '';
    setElementoSearch('');

    if (!currentData.length) return;

    const rows = getRankingViewRows();
    updateCharts(rows);
    updateHeatmap(rows);

    searchElemento?.focus();
  });
}

/**
 * Renderizar todos os componentes
 */
function renderAll() {
  if (currentData.length === 0) return;

  console.log(`[RENDER] Renderizando ${currentData.length} registros...`);

  // 1) Ranking elemento (define currentRankingData internamente)
  updateRanking(currentData);

  // 2) Tudo baseado na visão do Ranking Elemento (filtro + busca)
  const rowsFromRankingView = getRankingViewRows();
  updateCharts(rowsFromRankingView);
  updateHeatmap(rowsFromRankingView);

  console.log('[RENDER] Renderização iniciada');
}

/**
 * Carregar dados do Firestore PARA UM PERÍODO
 */
async function loadDataByPeriod(di, df) {
  const rankingContainer = document.getElementById('rankingElemento');
  if (rankingContainer) {
    rankingContainer.innerHTML =
      '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando dados do período...</div>';
  }

  const result = await DataService.getData({ dataInicial: di, dataFinal: df });

  if (result.success && result.data.length > 0) {
    currentData = result.data;
    renderAll();
    showToast(`Filtro aplicado: ${currentData.length} registro(s) encontrado(s).`, 'success');
  } else {
    currentData = [];

    if (rankingContainer) {
      rankingContainer.innerHTML =
        '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Nenhum dado encontrado para o período informado.</p>';
    }
    showToast('Nenhum dado encontrado para o período.', 'error');
  }
}

/**
 * Aplicar filtros (com debounce)
 * Agora: carrega do Firestore por período (economia de leituras)
 */
const applyFiltersDebounced = debounce(async () => {
  const dataInicial = document.getElementById('dataInicial')?.value;
  const dataFinal = document.getElementById('dataFinal')?.value;

  const di = dataInicial ? dataInicial.split('T')[0] : '';
  const df = dataFinal ? dataFinal.split('T')[0] : '';

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
  renderEmptyState();
  showToast('Filtros removidos. Selecione um período para carregar.', 'success');
}

/**
 * Abrir modal para adicionar informações
 */
function openModalAddInfo() {
  const allColumns = getAllColumns(currentData);

  // normalizado sem ponto, por isso ALIMENT (não ALIMENT.)
  const fixedColumns = ['INCIDENCIA', 'CAUSA', 'ALIMENT', 'DATA', 'ELEMENTO', 'CONJUNTO'];
  // Colunas que NÃO devem aparecer no "Adicionar Info"
  const hiddenCols = new Set([
    'TMD',
    'AVISOS',
    'CHI',
    'TMA',
    'NT',
    'DURACAO TOTAL'
  ].map(c => c.trim().toUpperCase()));

  const nonFixedColumns = allColumns.filter(col => {
    const normalized = String(col).toUpperCase().trim().replace(/\./g, '');

    // não mostrar colunas fixas
    if (fixedColumns.includes(normalized)) return false;

    // não mostrar colunas bloqueadas (comparando também sem ponto)
    const normalizedNoDot = normalized.replace(/\./g, '');
    const normalizedWithDotSafe = String(col).toUpperCase().trim(); // para nomes com espaço/ponto como "CLI. AFE"

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
