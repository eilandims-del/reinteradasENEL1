/**
 * Painel do Inspetor
 * Fluxo: Regional -> Data -> Elemento -> tabela
 * Bolinha verde abre modal de retorno e salva em retornos_inspetores
 */

import { AuthService, DataService } from './services/firebase-service.js';
import { showToast } from './utils/helpers.js';
import { openModal } from './components/modal.js';
import { setupRetornoModal } from './components/retorno-modal.js';

let currentUser = null;
let selectedRegional = 'TODOS';
let selectedTipo = 'TODOS';
let cacheReiteradas = [];
let cacheRetornosMap = new Map();
let currentRowForModal = null;

function byId(id){ return document.getElementById(id); }

function init(){
  initEvents();
  setupModal();
  checkAuthState();
}

function checkAuthState() {
  AuthService.onAuthStateChanged((user) => {
    currentUser = user;

    if (!user) {
      const base = window.location.pathname.replace(/\/[^/]*$/, '/');
      window.location.href = `${base}login.html?role=inspetor`;
      return;
    }

    const panel = byId('inspetorSection');
    const logout = byId('logoutBtn');
    if (panel) panel.style.display = 'block';
    if (logout) logout.style.display = 'inline-flex';

    renderTableMessage('Selecione Regional → Data → Elemento e clique no calendário para aplicar.');
  });
}

function initEvents(){
  byId('logoutBtn')?.addEventListener('click', async () => {
    await AuthService.logout();
  });

  byId('btnReloadInspetor')?.addEventListener('click', async () => {
    await loadReiteradas();
  });

  byId('btnAplicarInsp')?.addEventListener('click', async () => {
    await loadReiteradas();
  });

  byId('regionalSegment')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-regional]');
    if (!btn) return;
    selectedRegional = String(btn.dataset.regional || 'TODOS');
    setSegmentActive('regionalSegment', 'data-regional', selectedRegional);
    cacheReiteradas = [];
    renderTableMessage('Regional selecionada. Informe Data e clique no calendário para aplicar.');
  });

  byId('tipoSegment')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-tipo]');
    if (!btn) return;
    selectedTipo = String(btn.dataset.tipo || 'TODOS');
    setSegmentActive('tipoSegment', 'data-tipo', selectedTipo);
    renderTable();
  });

  byId('inspBusca')?.addEventListener('input', () => {
    renderTable();
  });
}

function setupModal(){
  setupRetornoModal({
    onSubmit: async ({ retornoTexto }) => {
      if (!currentRowForModal) {
        showToast('Nenhuma linha selecionada.', 'error');
        return { success: false };
      }

      const payload = {
        incidencia: getVal(currentRowForModal, 'INCIDENCIA'),
        regional: selectedRegional,
        dataRef: getVal(currentRowForModal, 'DATA') || '',
        elemento: getVal(currentRowForModal, 'ELEMENTO'),
        alimentador: getVal(currentRowForModal, 'ALIMENT.') || getVal(currentRowForModal, 'ALIMENTADOR') || '',
        causa: getVal(currentRowForModal, 'CAUSA'),
        clienteAfetado: getVal(currentRowForModal, 'CLI. AFE') || getVal(currentRowForModal, 'CLI AFE') || '',
        retornoTexto
      };

      const res = await DataService.saveRetornoInspetor(payload);
      if (!res?.success) {
        showToast(`Erro ao salvar retorno: ${res?.error || 'falha'}`, 'error');
        return { success: false };
      }

      await loadRetornosDoInspetor();
      renderTable();
      showToast('Retorno salvo!', 'success');
      return { success: true };
    }
  });
}

function setSegmentActive(containerId, attr, value){
  byId(containerId)?.querySelectorAll(`[${attr}]`).forEach((btn) => {
    btn.classList.toggle('active', String(btn.getAttribute(attr)) === String(value));
  });
}

async function loadReiteradas(){
  if (!currentUser) return;

  const di = byId('inspDataInicial')?.value || '';
  const df = byId('inspDataFinal')?.value || '';

  if (!di && !df) {
    showToast('Informe ao menos uma data.', 'error');
    renderTableMessage('Informe ao menos uma data e clique no calendário para aplicar.');
    return;
  }

  renderTableMessage('Carregando...');

  const res = await DataService.getData({
    regional: selectedRegional,
    dataInicial: di,
    dataFinal: df
  });

  cacheReiteradas = (res?.success && Array.isArray(res.data)) ? res.data : [];
  await loadRetornosDoInspetor();
  renderTable();

  const resumo = byId('inspResumo');
  if (resumo) resumo.textContent = `Regional: ${selectedRegional} • Período: ${di || '—'} até ${df || '—'} • Registros: ${cacheReiteradas.length}`;
}

async function loadRetornosDoInspetor(){
  const res = await DataService.getRetornosDoInspetor();
  const rows = (res?.success && Array.isArray(res.data)) ? res.data : [];
  cacheRetornosMap = new Map();
  rows.forEach((r) => {
    const inc = String(r.incidencia || r.INCIDENCIA || '').trim();
    if (inc) cacheRetornosMap.set(inc, r);
  });
}

function renderTableMessage(msg){
  const tbody = byId('inspTbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="insp-empty-cell">${escapeHtml(msg)}</td></tr>`;
}

function renderTable(){
  const tbody = byId('inspTbody');
  if (!tbody) return;

  const term = normText(byId('inspBusca')?.value || '');

  let rows = [...cacheReiteradas];
  rows = rows.filter((r) => matchesTipo(getVal(r, 'ELEMENTO'), selectedTipo));

  if (term) {
    rows = rows.filter((r) => {
      const hay = [
        getVal(r, 'ELEMENTO'),
        getVal(r, 'INCIDENCIA'),
        getVal(r, 'CLI. AFE') || getVal(r, 'CLI AFE'),
        getVal(r, 'CAUSA')
      ].join(' | ');
      return normText(hay).includes(term);
    });
  }

  if (!rows.length) {
    renderTableMessage('Nenhuma ocorrência para os filtros selecionados.');
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const elemento = getVal(r, 'ELEMENTO') || '—';
    const qtd = getQuantidade(r);
    const causa = getVal(r, 'CAUSA') || '—';
    const inc = getVal(r, 'INCIDENCIA') || '—';
    const cli = getVal(r, 'CLI. AFE') || getVal(r, 'CLI AFE') || getVal(r, 'CLI. AFET') || '—';
    const retorno = cacheRetornosMap.get(inc);
    const responded = !!retorno;
    const statusLabel = responded ? 'RESPONDIDO' : 'PENDENTE';

    return `
      <tr data-inc="${escapeHtml(inc)}">
        <td>${escapeHtml(elemento)}</td>
        <td>${escapeHtml(qtd)}</td>
        <td>${escapeHtml(causa)}</td>
        <td><a class="insp-inc-link" href="${formatIncidenciaUrl(inc)}" target="_blank" rel="noopener noreferrer">${escapeHtml(inc)}</a></td>
        <td>${escapeHtml(cli)}</td>
        <td><span class="status-badge">${statusLabel}</span></td>
        <td class="insp-dot-cell">
          <button class="insp-dot-btn" type="button" data-action="open-retorno" title="Abrir retorno">
            <span class="status-dot green"></span>
          </button>
        </td>
        <td class="insp-dot-cell"><span class="status-dot ${responded ? 'green' : 'red'}"></span></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action="open-retorno"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const tr = e.currentTarget.closest('tr');
      const inc = tr?.dataset?.inc || '';
      const row = cacheReiteradas.find((x) => String(getVal(x, 'INCIDENCIA')).trim() === inc) || null;
      if (!row) return;
      currentRowForModal = row;

      const prev = cacheRetornosMap.get(inc);
      const txt = prev?.retornoTexto || '';

      const tit = byId('retornoTitulo');
      if (tit) tit.textContent = `Retorno • Incidência ${inc}`;
      byId('retornoHeaderElemento').textContent = getVal(row, 'ELEMENTO') || '—';
      byId('retornoHeaderIncidencia').textContent = inc || '—';
      byId('retornoHeaderRegional').textContent = selectedRegional || '—';
      byId('retornoHeaderCliente').textContent = getVal(row, 'CLI. AFE') || getVal(row, 'CLI AFE') || '—';
      byId('retornoTexto').value = txt;
      byId('retornoError').textContent = '';

      openModal('modalRetorno');
    });
  });
}

function getQuantidade(row){
  return getVal(row, 'QUANTIDADE') || getVal(row, 'QTD') || getVal(row, 'QTDE') || getVal(row, 'QUANT') || getVal(row, 'QUANT.') || '1';
}

function matchesTipo(elementoRaw, tipo){
  const e = String(elementoRaw || '').trim().toUpperCase();
  if (!tipo || tipo === 'TODOS') return true;
  if (!e) return false;
  const first = e[0];
  if (tipo === 'TRAFO') return first === 'T';
  if (tipo === 'FUSIVEL') return first === 'F';
  if (tipo === 'RELIGADOR') return first !== 'T' && first !== 'F';
  return true;
}

function getVal(row, key){
  if (!row) return '';
  if (row[key] != null) return String(row[key]).trim();
  const noDot = String(key).replace(/\./g, '');
  if (row[noDot] != null) return String(row[noDot]).trim();
  const target = normKey(key);
  const found = Object.keys(row).find((k) => normKey(k) === target);
  if (found) return String(row[found]).trim();
  return '';
}

function normKey(k){
  return String(k || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').replace(/\s+/g, ' ');
}

function normText(v){
  return String(v || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

function formatIncidenciaUrl(inc){
  const cleaned = String(inc || '').trim();
  if (!cleaned) return '#';
  return `http://sdeice.enelint.global/SAC_Detalhe_Inci.asp?inci_ref=${encodeURIComponent(cleaned)}`;
}

function escapeHtml(str){
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
