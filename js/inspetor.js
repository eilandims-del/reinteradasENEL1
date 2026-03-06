
/**
 * Painel do Inspetor
 * - Seleciona Regional -> Data -> Elemento -> carrega e mostra tabela estilo planilha
 * - Bolinha (vermelha/verde) abre modal de retorno e salva em "retornos_inspetores"
 */

import { AuthService, DataService } from './services/firebase-service.js';
import { showToast, formatDate } from './utils/helpers.js';
import { openModal, closeModal } from './components/modal.js';
import { setupRetornoModal } from './components/retorno-modal.js';

let currentUser = null;

let selectedRegional = 'TODOS';
let selectedTipo = 'TODOS';
let cacheReiteradas = [];
let cacheRetornosMap = new Map(); // incidencia -> retorno

function init() {
  initEvents();
  checkAuthState();
}

function checkAuthState() {

  AuthService.onAuthStateChanged((user) => {

    if(!user){
      window.location.href = "login.html"
      return
    }

    currentUser = user

    enableDateInputs(true)
    enableTipoInputs(false)

    renderTableMessage('Selecione Regional → Data → Elemento.')

  })

}

function initEvents() {
  // Login
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin();
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await handleLogout();
  });

  // Regional (radio)
  document.querySelectorAll('input[name="insp_regional"]').forEach((el) => {
    el.addEventListener('change', () => {
      selectedRegional = el.value || 'TODOS';
      enableDateInputs(true);

      // ao trocar regional, invalida fluxo
      cacheReiteradas = [];
      cacheRetornosMap = new Map();
      enableTipoInputs(false);
      renderTableMessage('Selecione a Data (Início/Fim) para liberar o filtro de Elemento.');
    });
  });

  // Data inputs
  document.getElementById('inspDataInicial')?.addEventListener('change', onDateChanged);
  document.getElementById('inspDataFinal')?.addEventListener('change', onDateChanged);

  // Tipo (radio)
  document.querySelectorAll('input[name="insp_tipo"]').forEach((el) => {
    el.addEventListener('change', async () => {
      selectedTipo = el.value || 'TODOS';
      await tryLoadAndRender();
    });
  });

  // Modal de retorno
  setupRetornoModal({
    onSubmit: async ({ retornoTexto }) => {
      const row = getCurrentRowForModal();
      if (!row) {
        showToast('Linha não encontrada para salvar retorno.', 'error');
        return { success: false };
      }

      const payload = {
        incidencia: getVal(row, 'INCIDENCIA'),
        regional: selectedRegional,
        dataRef: getVal(row, 'DATA') || '',
        elemento: getVal(row, 'ELEMENTO'),
        alimentador: getVal(row, 'ALIMENT.') || getVal(row, 'ALIMENTADOR') || '',
        causa: getVal(row, 'CAUSA'),
        clienteAfetado: getVal(row, 'CLI. AFE') || getVal(row, 'CLI AFE') || '',
        retornoTexto
      };

      const res = await DataService.saveRetornoInspetor(payload);
      if (!res?.success) {
        showToast(`Erro ao salvar retorno: ${res?.error || 'falha'}`, 'error');
        return { success: false };
      }

      showToast('Retorno salvo!', 'success');

      // atualiza cache e tabela
      await loadRetornosDoInspetor();
      renderTable();

      return { success: true };
    }
  });
}

function enableDateInputs(on) {
  const di = document.getElementById('inspDataInicial');
  const df = document.getElementById('inspDataFinal');
  if (di) di.disabled = !on;
  if (df) df.disabled = !on;
}

function enableTipoInputs(on) {
  document.querySelectorAll('input[name="insp_tipo"]').forEach((el) => {
    el.disabled = !on;
  });
}

function onDateChanged() {
  const di = document.getElementById('inspDataInicial')?.value || '';
  const df = document.getElementById('inspDataFinal')?.value || '';

  if (!di && !df) {
    enableTipoInputs(false);
    renderTableMessage('Informe ao menos uma data (Início ou Fim) para liberar o filtro de Elemento.');
    return;
  }

  enableTipoInputs(true);
  // mantém tipo atual (ou volta pra TODOS)
  const sel = document.querySelector('input[name="insp_tipo"]:checked');
  if (!sel) {
    document.getElementById('tipo_todos')?.click();
  } else {
    // auto-load com o tipo atual
    tryLoadAndRender();
  }
}

async function handleLogin() {
  const email = document.getElementById('email')?.value || '';
  const senha = document.getElementById('senha')?.value || '';

  const result = await AuthService.login(email, senha);
  if (result.success) {
    showToast('Login realizado com sucesso!', 'success');
  } else {
    showToast(result.error || 'Erro ao fazer login', 'error');
  }
}

async function handleLogout() {
  const result = await AuthService.logout();
  if (result.success) showToast('Logout realizado!', 'success');
}

function renderTableMessage(msg) {
  const tbody = document.getElementById('inspTbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 1rem; color: var(--medium-gray);">${msg}</td></tr>`;
}

function setLoading(on) {
  const tbody = document.getElementById('inspTbody');
  if (!tbody) return;
  if (on) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 1rem;">
      <i class="fas fa-spinner fa-spin"></i> Carregando...
    </td></tr>`;
  }
}

/* ====== data helpers ====== */
function normKey(k) {
  return String(k || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').replace(/\s+/g, ' ');
}
function getVal(row, key) {
  if (!row) return '';
  if (row[key] != null) return String(row[key]).trim();

  const noDot = String(key).replace(/\./g, '');
  if (row[noDot] != null) return String(row[noDot]).trim();

  const target = normKey(key);
  const found = Object.keys(row).find(k => normKey(k) === target);
  if (found) return String(row[found]).trim();

  return '';
}
function getQuantidade(row) {
  const v =
    getVal(row, 'QUANTIDADE') ||
    getVal(row, 'QTD') ||
    getVal(row, 'QTDE') ||
    getVal(row, 'QUANT') ||
    getVal(row, 'QUANT.') ||
    '';
  return v ? v : '1';
}
function matchesTipo(elementoRaw, tipo) {
  const e = String(elementoRaw || '').trim().toUpperCase();
  if (!tipo || tipo === 'TODOS') return true;
  if (!e) return false;
  const first = e[0];
  if (tipo === 'TRAFO') return first === 'T';
  if (tipo === 'FUSIVEL') return first === 'F';
  if (tipo === 'RELIGADOR') return first !== 'T' && first !== 'F';
  return true;
}

/* ====== load and render ====== */
async function tryLoadAndRender() {
  if (!currentUser) return;

  const di = document.getElementById('inspDataInicial')?.value || '';
  const df = document.getElementById('inspDataFinal')?.value || '';

  if (!di && !df) return;

  setLoading(true);

  const res = await DataService.getData({
    regional: selectedRegional,
    dataInicial: di,
    dataFinal: df
  });

  cacheReiteradas = (res?.success && Array.isArray(res.data)) ? res.data : [];

  await loadRetornosDoInspetor();
  renderTable();

  showToast(`Carregado: ${cacheReiteradas.length} reiterada(s).`, 'success');
}

async function loadRetornosDoInspetor() {
  const res = await DataService.getRetornosDoInspetor();
  const rows = (res?.success && Array.isArray(res.data)) ? res.data : [];

  cacheRetornosMap = new Map();
  rows.forEach(r => {
    const inc = String(r.incidencia || r.INCIDENCIA || '').trim();
    if (inc) cacheRetornosMap.set(inc, r);
  });
}

function renderTable() {
  const tbody = document.getElementById('inspTbody');
  if (!tbody) return;

  const filtered = cacheReiteradas.filter(r => matchesTipo(getVal(r, 'ELEMENTO'), selectedTipo));

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 1rem; color: var(--medium-gray);">Nenhuma ocorrência para os filtros selecionados.</td></tr>`;
    return;
  }

  const rowsHtml = filtered.map((r) => {
    const elemento = getVal(r, 'ELEMENTO') || '—';
    const qtd = getQuantidade(r);
    const causa = getVal(r, 'CAUSA') || '—';
    const inc = getVal(r, 'INCIDENCIA') || '—';
    const cli = getVal(r, 'CLI. AFE') || getVal(r, 'CLI AFE') || getVal(r, 'CLI. AFET') || '—';

    const retorno = cacheRetornosMap.get(inc);
    const responded = !!retorno;

    const dotClass = responded ? 'green' : 'red';
    const statusLabel = responded ? 'RESPONDIDO' : 'PENDENTE';

    return `
      <tr data-inc="${escapeHtml(inc)}">
        <td>${escapeHtml(elemento)}</td>
        <td>${escapeHtml(qtd)}</td>
        <td>${escapeHtml(causa)}</td>
        <td><a href="${formatIncidenciaUrl(inc)}" target="_blank" rel="noopener noreferrer">${escapeHtml(inc)}</a></td>
        <td>${escapeHtml(cli)}</td>
        <td>
          <div class="status-cell">
            <span class="status-dot ${dotClass}" data-action="open-retorno" title="Abrir retorno"></span>
            <span class="status-label">${statusLabel}</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;

  // click handlers (delegação)
  tbody.querySelectorAll('[data-action="open-retorno"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      const inc = tr?.dataset?.inc || '';
      const row = cacheReiteradas.find(x => String(getVal(x, 'INCIDENCIA')).trim() === inc) || null;
      if (!row) return;

      // salva referência para submit
      setCurrentRowForModal(row);

      // preenche com texto existente (se houver)
      const prev = cacheRetornosMap.get(inc);
      const txt = prev?.retornoTexto || '';

      const tit = document.getElementById('retornoTitulo');
      if (tit) tit.textContent = `Incidência ${inc} • ${getVal(row,'ELEMENTO') || ''}`;

      const ta = document.getElementById('retornoTexto');
      if (ta) ta.value = txt;

      openModal('modalRetorno');
    });
  });
}

/* ===== modal current row ===== */
let __currentRowForModal = null;
function setCurrentRowForModal(row) { __currentRowForModal = row; }
function getCurrentRowForModal() { return __currentRowForModal; }

/* ===== misc ===== */
function formatIncidenciaUrl(inc) {
  const cleaned = String(inc || '').trim();
  if (!cleaned) return '#';
  return `http://sdeice.enelint.global/SAC_Detalhe_Inci.asp?inci_ref=${encodeURIComponent(cleaned)}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
