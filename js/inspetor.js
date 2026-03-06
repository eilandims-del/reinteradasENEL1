/**
 * Painel do Inspetor
 * Fluxo: Regional -> Data -> Elemento -> tabela
 * Exibe SOMENTE estruturas reiteradas (ELEMENTO com 2+ ocorrências)
 */

import { AuthService, DataService } from './services/firebase-service.js';
import { showToast } from './utils/helpers.js';
import { openModal } from './components/modal.js';
import { setupRetornoModal } from './components/retorno-modal.js';

let currentUser = null;
let selectedRegional = 'TODOS';
let selectedTipo = 'TODOS';
let cacheRows = [];            // linhas brutas do Firestore
let cacheRanking = [];         // estruturas reiteradas agregadas por ELEMENTO
let cacheRetornosMap = new Map();
let currentItemForModal = null;

const MIN_REPEAT_COUNT = 2;

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

    renderTableMessage('Selecione Regional → Data → Elemento e clique em Buscar.');
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

  document.querySelectorAll('input[name="regional"]').forEach((el) => {
    el.addEventListener('change', () => {
      selectedRegional = String(el.value || 'TODOS');
      cacheRows = [];
      cacheRanking = [];
      renderTableMessage('Regional selecionada. Agora informe o período e clique em Buscar.');
      updateResumo();
    });
  });

  document.querySelectorAll('input[name="tipo"]').forEach((el) => {
    el.addEventListener('change', () => {
      selectedTipo = String(el.value || 'TODOS');
      renderTable();
    });
  });

  byId('inspBusca')?.addEventListener('input', () => {
    renderTable();
  });
}

function setupModal(){
  setupRetornoModal({
    onSubmit: async ({ retornoTexto }) => {
      if (!currentItemForModal) {
        showToast('Nenhuma estrutura selecionada.', 'error');
        return { success: false };
      }

      const payload = {
        incidencia: currentItemForModal.incidencia || currentItemForModal.ultimaIncidencia || '',
        regional: selectedRegional,
        dataRef: currentItemForModal.data || '',
        elemento: currentItemForModal.elemento || '',
        alimentador: currentItemForModal.alimentador || '',
        causa: currentItemForModal.causa || '',
        clienteAfetado: currentItemForModal.clienteAfetado || '',
        retornoTexto
      };

      const res = await DataService.saveRetornoInspetor(payload);
      if (!res?.success) {
        const msg = String(res?.error || 'falha');
        if (msg.toLowerCase().includes('permission')) {
          showToast('Sem permissão no Firestore para salvar retorno. Ajuste as regras.', 'error');
        } else {
          showToast(`Erro ao salvar retorno: ${msg}`, 'error');
        }
        return { success: false };
      }

      await loadRetornosDoInspetor();
      renderTable();
      showToast('Retorno salvo!', 'success');
      return { success: true };
    }
  });
}

async function loadReiteradas(){
  if (!currentUser) return;

  const di = byId('inspDataInicial')?.value || '';
  const df = byId('inspDataFinal')?.value || '';

  if (!di && !df) {
    showToast('Informe ao menos uma data.', 'error');
    renderTableMessage('Informe ao menos uma data e clique em Buscar.');
    return;
  }

  renderTableMessage('Carregando estruturas reiteradas...');

  const res = await DataService.getData({
    regional: selectedRegional,
    dataInicial: di,
    dataFinal: df
  });

  cacheRows = (res?.success && Array.isArray(res.data)) ? res.data : [];
  cacheRanking = buildReiteradasRanking(cacheRows);

  await loadRetornosDoInspetor();
  renderTable();
  updateResumo();
}

async function loadRetornosDoInspetor(){
  const res = await DataService.getRetornosDoInspetor();
  const rows = (res?.success && Array.isArray(res.data)) ? res.data : [];
  cacheRetornosMap = new Map();

  if (!res?.success && String(res?.error || '').toLowerCase().includes('permission')) {
    showToast('Sem permissão no Firestore para ler retornos do inspetor.', 'error');
  }

  rows.forEach((r) => {
    const inc = String(r.incidencia || r.INCIDENCIA || '').trim();
    if (inc) cacheRetornosMap.set(inc, r);
  });
}

function updateResumo(){
  const di = byId('inspDataInicial')?.value || '—';
  const df = byId('inspDataFinal')?.value || '—';
  const resumo = byId('inspResumo');
  if (resumo) {
    resumo.textContent = `Regional: ${selectedRegional} • Período: ${di} até ${df} • Estruturas reiteradas: ${cacheRanking.length}`;
  }
}

function buildReiteradasRanking(rows){
  const map = new Map();

  for (const row of (rows || [])) {
    const elemento = getVal(row, 'ELEMENTO');
    if (!elemento) continue;

    if (!map.has(elemento)) {
      map.set(elemento, { elemento, ocorrencias: [] });
    }
    map.get(elemento).ocorrencias.push(row);
  }

  const result = [];

  for (const [, item] of map.entries()) {
    const ocorrencias = item.ocorrencias || [];
    const quantidade = ocorrencias.length;
    if (quantidade < MIN_REPEAT_COUNT) continue;

    const ultima = ocorrencias
      .slice()
      .sort((a, b) => String(getVal(b, 'DATA') || '').localeCompare(String(getVal(a, 'DATA') || '')))[0] || ocorrencias[0];

    result.push({
      elemento: item.elemento,
      quantidade,
      ocorrencias,
      incidencia: getVal(ultima, 'INCIDENCIA') || '',
      ultimaIncidencia: getVal(ultima, 'INCIDENCIA') || '',
      data: getVal(ultima, 'DATA') || '',
      causa: mostFrequentField(ocorrencias, 'CAUSA'),
      clienteAfetado: mostFrequentFieldMulti(ocorrencias, ['CLI. AFE', 'CLI AFE', 'CLI. AFET']),
      alimentador: mostFrequentFieldMulti(ocorrencias, ['ALIMENT.', 'ALIMENTADOR', 'ALIMENT']),
      responded: ocorrencias.some(r => cacheRetornosMap.has(String(getVal(r, 'INCIDENCIA')).trim()))
    });
  }

  result.sort((a, b) => b.quantidade - a.quantidade || a.elemento.localeCompare(b.elemento));
  return result;
}

function mostFrequentField(rows, field){
  const counts = new Map();
  for (const r of (rows || [])) {
    const v = getVal(r, field);
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = '';
  let max = -1;
  for (const [k, c] of counts.entries()) {
    if (c > max) { best = k; max = c; }
  }
  return best;
}

function mostFrequentFieldMulti(rows, fields){
  const counts = new Map();
  for (const r of (rows || [])) {
    let chosen = '';
    for (const f of (fields || [])) {
      chosen = getVal(r, f);
      if (chosen) break;
    }
    if (!chosen) continue;
    counts.set(chosen, (counts.get(chosen) || 0) + 1);
  }
  let best = '';
  let max = -1;
  for (const [k, c] of counts.entries()) {
    if (c > max) { best = k; max = c; }
  }
  return best;
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

  let rows = [...cacheRanking];
  rows = rows.filter((r) => matchesTipo(r.elemento, selectedTipo));

  if (term) {
    rows = rows.filter((r) => {
      const hay = [r.elemento, r.incidencia, r.clienteAfetado, r.causa, r.alimentador].join(' | ');
      return normText(hay).includes(term);
    });
  }

  if (!rows.length) {
    renderTableMessage('Nenhuma estrutura reiterada para os filtros selecionados.');
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const responded = (r.ocorrencias || []).some(x => cacheRetornosMap.has(String(getVal(x, 'INCIDENCIA')).trim()));
    const statusLabel = responded ? 'RESPONDIDO' : 'PENDENTE';

    return `
      <tr data-elemento="${escapeHtml(r.elemento)}" data-inc="${escapeHtml(r.incidencia)}">
        <td>${escapeHtml(r.elemento || '—')}</td>
        <td>${escapeHtml(String(r.quantidade || 0))}</td>
        <td>${escapeHtml(r.causa || '—')}</td>
        <td><a class="insp-inc-link" href="${formatIncidenciaUrl(r.incidencia)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.incidencia || '—')}</a></td>
        <td>${escapeHtml(r.clienteAfetado || '—')}</td>
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
      const elemento = tr?.dataset?.elemento || '';
      const item = cacheRanking.find((x) => String(x.elemento).trim() === elemento) || null;
      if (!item) return;
      currentItemForModal = item;

      const existing = (item.ocorrencias || []).map(x => cacheRetornosMap.get(String(getVal(x, 'INCIDENCIA')).trim())).find(Boolean);
      const txt = existing?.retornoTexto || '';

      const tit = byId('retornoTitulo');
      if (tit) tit.textContent = `Retorno • Estrutura ${item.elemento}`;
      byId('retornoHeaderElemento').textContent = item.elemento || '—';
      byId('retornoHeaderIncidencia').textContent = item.incidencia || '—';
      byId('retornoHeaderRegional').textContent = selectedRegional || '—';
      byId('retornoHeaderCliente').textContent = item.clienteAfetado || '—';
      byId('retornoTexto').value = txt;
      byId('retornoError').textContent = '';

      openModal('modalRetorno');
    });
  });
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
