import { AuthService, DataService } from './services/firebase-service.js';
import { showToast, debounce } from './utils/helpers.js';
import { openModal, closeModal } from './components/modal.js';

// ===== estado =====
let currentUser = null;

let regional = 'TODOS';     // AO/DN/DO/TODOS
let tipoElemento = 'TODOS'; // T / F / OUTROS / TODOS

let cacheReiteradas = [];   // dados do período
let cacheRetornos = [];     // retornos do inspetor (para pintar bolinha)
let busca = '';

let selectedRow = null;     // linha que abriu modal

// ===== helpers =====
function mapRegional(btn) {
  if (btn === 'AO') return 'ATLANTICO';
  if (btn === 'DN') return 'NORTE';
  if (btn === 'DO') return 'CENTRO NORTE';
  return 'TODOS';
}

function getField(row, key) {
  if (!row) return '';
  return row[key] ?? row[String(key).toUpperCase()] ?? row[String(key).toLowerCase()] ?? '';
}

function norm(s) {
  return String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function elementStartsWith(row, letter) {
  const el = String(getField(row, 'ELEMENTO') || '').trim().toUpperCase();
  if (!el) return false;
  return el.startsWith(letter);
}

function isReligador(row) {
  const el = String(getField(row, 'ELEMENTO') || '').trim().toUpperCase();
  if (!el) return false;
  return !(el.startsWith('T') || el.startsWith('F'));
}

function matchesBusca(row) {
  const t = norm(busca);
  if (!t) return true;

  const fields = [
    getField(row, 'INCIDENCIA'),
    getField(row, 'ELEMENTO'),
    getField(row, 'CLI. AFE'),
    getField(row, 'CLI AFE'),
    getField(row, 'CAUSA'),
    getField(row, 'ALIMENT.'),
    getField(row, 'ALIMENTADOR')
  ];

  const blob = norm(fields.join(' '));
  return blob.includes(t);
}

function retornoKey(incidencia) {
  const id = String(incidencia || '').trim();
  if (!id || !currentUser?.uid) return '';
  return `${id}__${currentUser.uid}`;
}

function hasRetornoFor(incidencia) {
  const key = retornoKey(incidencia);
  if (!key) return false;
  return cacheRetornos.some(r => r.id === key);
}

function setActive(buttonIds, activeId) {
  for (const id of buttonIds) {
    const el = document.getElementById(id);
    el?.classList.remove('active');
  }
  document.getElementById(activeId)?.classList.add('active');
}

function toISODate(tsOrStr) {
  // se já for ISO YYYY-MM-DD
  const s = String(tsOrStr ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

// ===== render =====
function renderList() {
  const box = document.getElementById('inspLista');
  const resumo = document.getElementById('inspResumo');
  if (!box) return;

  let rows = Array.isArray(cacheReiteradas) ? cacheReiteradas.slice() : [];

  // filtro tipo
  if (tipoElemento === 'T') rows = rows.filter(r => elementStartsWith(r, 'T'));
  if (tipoElemento === 'F') rows = rows.filter(r => elementStartsWith(r, 'F'));
  if (tipoElemento === 'OUTROS') rows = rows.filter(r => isReligador(r));

  // busca
  rows = rows.filter(matchesBusca);

  if (resumo) {
    resumo.textContent = `Regional: ${regional} | Tipo: ${tipoElemento} | Itens: ${rows.length}`;
  }

  if (!rows.length) {
    box.innerHTML = `<div style="padding:1rem;color:var(--medium-gray);text-align:center;">Nenhum item encontrado.</div>`;
    return;
  }

  // lista simples (cards)
  box.innerHTML = '';
  rows.forEach((r) => {
    const incidencia = String(getField(r, 'INCIDENCIA') || '').trim();
    const elemento = String(getField(r, 'ELEMENTO') || '').trim();
    const causa = String(getField(r, 'CAUSA') || '').trim();
    const cli = String(getField(r, 'CLI. AFE') || getField(r, 'CLI AFE') || '').trim();
    const data = String(getField(r, 'DATA') || '').trim();
    const alim = String(getField(r, 'ALIMENT.') || getField(r, 'ALIMENTADOR') || '').trim();

    const ok = hasRetornoFor(incidencia);

    const div = document.createElement('div');
    div.className = 'history-item';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    div.style.gap = '12px';

    div.innerHTML = `
      <div class="history-info" style="margin:0;">
        <h3 style="margin:0 0 4px 0;">${elemento || '—'} <span style="font-weight:500;color:var(--medium-gray)">(${incidencia || '—'})</span></h3>
        <p style="margin:0;">${cli ? `<b>Cliente:</b> ${cli} &nbsp; • &nbsp;` : ''}<b>Causa:</b> ${causa || '—'}</p>
        <p style="margin:3px 0 0 0;color:var(--medium-gray)">${data ? `<b>Data:</b> ${data} &nbsp; • &nbsp;` : ''}${alim ? `<b>Alim:</b> ${alim}` : ''}</p>
      </div>

      <button class="btn btn-sm ${ok ? 'btn-success' : 'btn-outline'}" title="${ok ? 'Retorno já enviado' : 'Enviar retorno'}" style="min-width:52px;">
        <i class="fas fa-circle" style="color:${ok ? 'var(--success)' : 'var(--medium-gray)'}"></i>
      </button>
    `;

    div.querySelector('button')?.addEventListener('click', () => {
      selectedRow = r;
      openRetornoModal(r, ok);
    });

    box.appendChild(div);
  });
}

function openRetornoModal(row, alreadySent) {
  const incidencia = String(getField(row, 'INCIDENCIA') || '').trim();
  const elemento = String(getField(row, 'ELEMENTO') || '').trim();
  const causa = String(getField(row, 'CAUSA') || '').trim();
  const cli = String(getField(row, 'CLI. AFE') || getField(row, 'CLI AFE') || '').trim();
  const dataRef = String(getField(row, 'DATA') || '').trim();
  const alim = String(getField(row, 'ALIMENT.') || getField(row, 'ALIMENTADOR') || '').trim();

  const tit = document.getElementById('retornoTitulo');
  const meta = document.getElementById('retornoMeta');
  const ta = document.getElementById('retornoTexto');

  if (tit) tit.textContent = `Retorno — ${elemento || '—'} (${incidencia || '—'})`;
  if (meta) {
    meta.innerHTML =
      `${cli ? `<b>Cliente:</b> ${cli} &nbsp;•&nbsp; ` : ''}` +
      `${causa ? `<b>Causa:</b> ${causa} &nbsp;•&nbsp; ` : ''}` +
      `${dataRef ? `<b>Data:</b> ${dataRef} &nbsp;•&nbsp; ` : ''}` +
      `${alim ? `<b>Alim:</b> ${alim}` : ''}` +
      (alreadySent ? `<div style="margin-top:6px;color:var(--success);"><i class="fas fa-check"></i> Já existe retorno enviado (você pode atualizar)</div>` : '');
  }

  // se já existe retorno, pré-carrega texto
  const key = retornoKey(incidencia);
  const existing = cacheRetornos.find(r => r.id === key);
  if (ta) ta.value = existing?.retornoTexto || '';

  // FIX: evitar “modal por trás”
  // fecha qualquer modal ativo e sobe este por cima
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
  openModal('modalRetornoInspetor');
}

// ===== carregamento =====
async function loadRetornosDoInspetor() {
  const res = await DataService.getRetornosDoInspetor();
  cacheRetornos = (res?.success && Array.isArray(res.data)) ? res.data : [];
}

async function loadReiteradas() {
  const di = document.getElementById('inspDataInicial')?.value || '';
  const df = document.getElementById('inspDataFinal')?.value || '';

  if (!regional) {
    showToast('Selecione AO/DN/DO/TODOS.', 'error');
    return;
  }
  if (!di && !df) {
    showToast('Informe ao menos uma data (inicial ou final).', 'error');
    return;
  }

  const box = document.getElementById('inspLista');
  if (box) box.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>`;

  const res = await DataService.getData({
    regional,
    dataInicial: di,
    dataFinal: df
  });

  cacheReiteradas = (res?.success && Array.isArray(res.data)) ? res.data : [];

  // atualiza retornos e renderiza
  await loadRetornosDoInspetor();
  renderList();

  showToast(`Carregado: ${cacheReiteradas.length} reiterada(s).`, 'success');
}

// ===== eventos =====
function bindUI() {
  // login
  document.getElementById('loginInspetorForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('inspEmail')?.value || '';
    const senha = document.getElementById('inspSenha')?.value || '';
    const err = document.getElementById('inspLoginError');

    const r = await AuthService.login(email, senha);
    if (!r.success) {
      if (err) { err.textContent = r.error || 'Erro ao logar'; err.classList.add('show'); }
      showToast('Falha no login.', 'error');
      return;
    }

    if (err) { err.textContent = ''; err.classList.remove('show'); }
    showToast('Login OK.', 'success');
  });

  // logout
  document.getElementById('logoutInspetorBtn')?.addEventListener('click', async () => {
    await AuthService.logout();
  });

  // regionais
  const regBtns = ['btnAO','btnDN','btnDO','btnTODOS'];
  document.getElementById('btnAO')?.addEventListener('click', () => { regional = mapRegional('AO'); setActive(regBtns,'btnAO'); });
  document.getElementById('btnDN')?.addEventListener('click', () => { regional = mapRegional('DN'); setActive(regBtns,'btnDN'); });
  document.getElementById('btnDO')?.addEventListener('click', () => { regional = mapRegional('DO'); setActive(regBtns,'btnDO'); });
  document.getElementById('btnTODOS')?.addEventListener('click', () => { regional = 'TODOS'; setActive(regBtns,'btnTODOS'); });

  // tipos
  const tipoBtns = ['btnTipoTrafo','btnTipoFusivel','btnTipoReligador','btnTipoTodos'];
  document.getElementById('btnTipoTrafo')?.addEventListener('click', () => { tipoElemento='T'; setActive(tipoBtns,'btnTipoTrafo'); renderList(); });
  document.getElementById('btnTipoFusivel')?.addEventListener('click', () => { tipoElemento='F'; setActive(tipoBtns,'btnTipoFusivel'); renderList(); });
  document.getElementById('btnTipoReligador')?.addEventListener('click', () => { tipoElemento='OUTROS'; setActive(tipoBtns,'btnTipoReligador'); renderList(); });
  document.getElementById('btnTipoTodos')?.addEventListener('click', () => { tipoElemento='TODOS'; setActive(tipoBtns,'btnTipoTodos'); renderList(); });

  // aplicar
  document.getElementById('btnAplicarInsp')?.addEventListener('click', loadReiteradas);
  document.getElementById('btnReloadInspetor')?.addEventListener('click', loadReiteradas);

  // busca
  const onBusca = debounce(() => { renderList(); }, 180);
  document.getElementById('inspBusca')?.addEventListener('input', (e) => {
    busca = e.target.value || '';
    onBusca();
  });

  // modal retorno
  document.getElementById('btnLimparRetorno')?.addEventListener('click', () => {
    const ta = document.getElementById('retornoTexto');
    if (ta) ta.value = '';
  });

  document.getElementById('btnEnviarRetorno')?.addEventListener('click', async () => {
    if (!selectedRow) return;

    const incidencia = String(getField(selectedRow, 'INCIDENCIA') || '').trim();
    const elemento = String(getField(selectedRow, 'ELEMENTO') || '').trim();
    const causa = String(getField(selectedRow, 'CAUSA') || '').trim();
    const cli = String(getField(selectedRow, 'CLI. AFE') || getField(selectedRow, 'CLI AFE') || '').trim();
    const dataRef = toISODate(getField(selectedRow, 'DATA') || '');
    const alim = String(getField(selectedRow, 'ALIMENT.') || getField(selectedRow, 'ALIMENTADOR') || '').trim();

    const texto = String(document.getElementById('retornoTexto')?.value || '').trim();
    if (!texto) {
      showToast('Digite um retorno antes de enviar.', 'error');
      return;
    }

    const save = await DataService.saveRetornoInspetor({
      incidencia,
      regional,
      dataRef,
      elemento,
      causa,
      clienteAfetado: cli,
      alimentador: alim,
      retornoTexto: texto
    });

    if (!save.success) {
      showToast(`Erro ao salvar retorno: ${save.error}`, 'error');
      return;
    }

    showToast('Retorno enviado!', 'success');
    closeModal('modalRetornoInspetor');

    await loadRetornosDoInspetor();
    renderList();
  });
}

function applyAuthUI(user) {
  currentUser = user;

  const loginSec = document.getElementById('loginInspetorSection');
  const painelSec = document.getElementById('inspetorSection');
  const logoutBtn = document.getElementById('logoutInspetorBtn');

  if (user) {
    loginSec.style.display = 'none';
    painelSec.style.display = 'block';
    logoutBtn.style.display = 'inline-flex';

    // defaults
    setActive(['btnAO','btnDN','btnDO','btnTODOS'], 'btnTODOS');
    setActive(['btnTipoTrafo','btnTipoFusivel','btnTipoReligador','btnTipoTodos'], 'btnTipoTodos');

    // se quiser já preencher credencial default (opcional)
  } else {
    loginSec.style.display = 'block';
    painelSec.style.display = 'none';
    logoutBtn.style.display = 'none';
  }
}

// ===== init =====
function init() {
  bindUI();

  AuthService.onAuthStateChanged((user) => {
    applyAuthUI(user);
  });

  // prefill (primeiro momento)
  const e = document.getElementById('inspEmail');
  const s = document.getElementById('inspSenha');
  if (e && !e.value) e.value = 'enelinspetor@enel.com';
  if (s && !s.value) s.value = '1234567';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}