/**
 * Script Principal - Dashboard
 */

import { DataService } from './services/firebase-service.js';
import { filterByDateRange, getAllColumns, getOcorrenciasByElemento } from './services/data-service.js';
import { updateRanking, generateRankingText, setElementoFilter, setElementoSearch } from './components/ranking.js';
import { updateCharts } from './components/charts.js';
/** import { updateHeatmap, initMap } from './components/mapa.js';  */
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
  /** initMap(); */

  await loadData();
}

/**
 * Inicializar event listeners
 */
function initEventListeners() {
  // Fechar modal detalhes (X) - (opcional, redundante com delegação do modal.js, mas ok)
  document.getElementById('fecharModal')?.addEventListener('click', () => closeModal('modalDetalhes'));

  // Fechar modal info (X) - (opcional, redundante com delegação do modal.js, mas ok)
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
  const btnOutros = document.getElementById('btnFiltroOutros');

  const setActive = (activeBtn) => {
    [btnTodos, btnTrafo, btnFusivel, btnOutros].forEach(b => b?.classList.remove('active'));
    activeBtn?.classList.add('active');
  };

  btnTodos?.addEventListener('click', () => { setElementoFilter('TODOS'); setActive(btnTodos); });
  btnTrafo?.addEventListener('click', () => { setElementoFilter('TRAFO'); setActive(btnTrafo); });
  btnFusivel?.addEventListener('click', () => { setElementoFilter('FUSIVEL'); setActive(btnFusivel); });
  btnOutros?.addEventListener('click', () => { setElementoFilter('OUTROS'); setActive(btnOutros); });

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
    }, 180);
  });

  btnClearSearch?.addEventListener('click', () => {
    if (searchElemento) searchElemento.value = '';
    setElementoSearch('');
    searchElemento?.focus();
  });
}

/**
 * Carregar dados do Firestore
 */
async function loadData() {
  const rankingContainer = document.getElementById('rankingElemento');
  if (rankingContainer) {
    rankingContainer.innerHTML =
      '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</div>';
  }

  const result = await DataService.getData();

  if (result.success && result.data.length > 0) {
    currentData = result.data;
    renderAll();
  } else {
    if (rankingContainer) {
      rankingContainer.innerHTML =
        '<p style="text-align: center; padding: 2rem; color: var(--medium-gray);">Nenhum dado disponível. Faça upload de uma planilha no painel administrativo.</p>';
    }
    showToast('Nenhum dado encontrado. Faça upload de uma planilha.', 'error');
  }
}

/**
 * Renderizar todos os componentes
 */
function renderAll() {
  if (currentData.length === 0) return;

  console.log(`[RENDER] Renderizando ${currentData.length} registros...`);

  requestAnimationFrame(() => updateRanking(currentData));
  requestAnimationFrame(() => updateCharts(currentData));

  console.log('[RENDER] Renderização iniciada (assíncrona)');
}

/**
 * Aplicar filtros (com debounce)
 */
const applyFiltersDebounced = debounce(() => {
  const dataInicial = document.getElementById('dataInicial')?.value;
  const dataFinal = document.getElementById('dataFinal')?.value;

  const filteredData = filterByDateRange(currentData, dataInicial, dataFinal);

  requestAnimationFrame(() => {
    updateRanking(filteredData);
    updateCharts(filteredData);
    showToast(`Filtro aplicado: ${filteredData.length} registro(s) encontrado(s).`, 'success');
  });
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

  renderAll();
  showToast('Filtros removidos.', 'success');
}

/**
 * Abrir modal para adicionar informações
 */
function openModalAddInfo() {
  const allColumns = getAllColumns(currentData);

  // normalizado sem ponto, por isso ALIMENT (não ALIMENT.)
  const fixedColumns = ['INCIDENCIA', 'CAUSA', 'ALIMENT', 'DATA', 'ELEMENTO', 'CONJUNTO'];

  const nonFixedColumns = allColumns.filter(col => {
    const normalized = String(col).toUpperCase().trim().replace(/\./g, '');
    return !fixedColumns.includes(normalized);
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
