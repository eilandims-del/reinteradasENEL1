// js/components/clientes-modal.js

import { openModal, closeModal, fillDetailsModal } from './modal.js';

/* ========= helpers ========= */
function normKey(k) {
  return String(k || '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
}

function getFieldValue(row, fieldName) {
  if (!row) return '';
  if (row[fieldName] != null) return row[fieldName];

  const noDot = String(fieldName).replace(/\./g, '');
  if (row[noDot] != null) return row[noDot];

  const target = normKey(fieldName);
  const foundKey = Object.keys(row).find(k => normKey(k) === target);
  if (foundKey) return row[foundKey];

  return '';
}

function sanitizeOneLine(v) {
  return String(v ?? '').replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
}

function fmtPeriodo(di, df) {
  const fmt = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  };
  if (di && df) return `${fmt(di)} até ${fmt(df)}`;
  if (di && !df) return `a partir de ${fmt(di)}`;
  if (!di && df) return `até ${fmt(df)}`;
  return 'Sem filtro de data';
}

function getNumCliente(row) {
  return String(
    getFieldValue(row, 'NUM_CLIENTE') ||
    getFieldValue(row, 'Nº CLIENTE') ||
    getFieldValue(row, 'NUM CLIENTE') ||
    ''
  ).trim();
}

function getNomeCliente(row) {
  return String(
    getFieldValue(row, 'NOME CLIENTE') ||
    getFieldValue(row, 'CLI. AFE') ||
    getFieldValue(row, 'CLI AFE') ||
    ''
  ).trim();
}

function getDataAvisoISO(row) {
  // seu parser já transforma em ISO (YYYY-MM-DD)
  return String(getFieldValue(row, 'DATA AVISO') || '').trim();
}

function inPeriodoISO(iso, di, df) {
  if (!iso) return false;
  // ISO YYYY-MM-DD permite comparar por string
  if (di && iso < di) return false;
  if (df && iso > df) return false;
  return true;
}

/* ========= rankings ========= */
function rankByField(rows, field) {
  const counts = new Map();
  const occ = new Map();

  for (const r of (rows || [])) {
    const v = String(getFieldValue(r, field) || '').trim();
    if (!v) continue;

    counts.set(v, (counts.get(v) || 0) + 1);
    if (!occ.has(v)) occ.set(v, []);
    occ.get(v).push(r);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, ocorrencias: occ.get(name) }))
    .sort((a, b) => b.count - a.count);
}

function rankClientesTop(rows) {
  const counts = new Map();
  const occ = new Map();

  for (const r of (rows || [])) {
    const num = getNumCliente(r);
    if (!num) continue;

    counts.set(num, (counts.get(num) || 0) + 1);
    if (!occ.has(num)) occ.set(num, []);
    occ.get(num).push(r);
  }

  return Array.from(counts.entries())
    .map(([num, count]) => ({ num, count, ocorrencias: occ.get(num) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function renderRanking(containerId, items, onClick) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || !items.length) {
    container.innerHTML =
      '<p style="text-align:center; padding: 2rem; color: var(--medium-gray);">Nenhum dado.</p>';
    return;
  }

  container.innerHTML = '';

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'ranking-item';
    div.onclick = () => onClick?.(item);

    const name = item.num ?? item.name ?? '';
    div.innerHTML = `
      <span class="ranking-item-position">${idx + 1}º</span>
      <span class="ranking-item-name">${sanitizeOneLine(name)}</span>
      <span class="ranking-item-count">(${item.count} vezes)</span>
    `;
    container.appendChild(div);
  });
}

/* ========= modal stacking helpers ========= */
function bringDetalhesToFront() {
  const mClientes = document.getElementById('modalClientes');
  const mDetalhes = document.getElementById('modalDetalhes');

  // fallback por JS (mesmo que o CSS não esteja perfeito)
  if (mClientes) {
    mClientes.classList.add('is-behind');
    mClientes.style.zIndex = '2000';
  }

  if (mDetalhes) {
    mDetalhes.style.zIndex = '3000';
    const content = mDetalhes.querySelector('.modal-content');
    if (content) content.style.zIndex = '3001';
  }
}

function restoreClientesLayer() {
  const mClientes = document.getElementById('modalClientes');
  if (!mClientes) return;
  mClientes.classList.remove('is-behind');
  mClientes.style.zIndex = '';
}

/* ========= modal ========= */
export function setupClientesModalUI() {
  // fechar no X do modalClientes
  document.getElementById('fecharModalClientes')?.addEventListener('click', () => {
    restoreClientesLayer();
    closeModal?.('modalClientes');
  });

  // quando fechar o modalDetalhes, destrava o modalClientes (se estiver aberto)
  document.getElementById('fecharModal')?.addEventListener('click', () => {
    restoreClientesLayer();
  });

  // ESC/backdrop também podem fechar o detalhes via modal.js,
  // então escuta o evento de "transition" / clique do backdrop é global.
  // Aqui é um fallback simples: quando não existir modalDetalhes ativo, destrava.
  document.addEventListener('click', () => {
    const detalhesAtivo = document.querySelector('#modalDetalhes.modal.active');
    if (!detalhesAtivo) restoreClientesLayer();
  });
}

export function openClientesModal({ rows, regionalLabel, dataInicial, dataFinal }) {
  // labels
  const regEl = document.getElementById('clientesRegionalLabel');
  const perEl = document.getElementById('clientesPeriodoLabel');
  if (regEl) regEl.textContent = regionalLabel || '—';
  if (perEl) perEl.textContent = fmtPeriodo(dataInicial, dataFinal);

  // 1) filtra período
  const filtradas = (rows || []).filter(r => {
    const iso = getDataAvisoISO(r);
    return inPeriodoISO(iso, dataInicial, dataFinal);
  });

  // 2) rankings
  const top10 = rankClientesTop(filtradas);
  const rankingCausa = rankByField(filtradas, 'CAUSA');

  // 3) render (somente 2 cards)
  renderRanking('rankingClientesTop10', top10, (item) => {
    const num = item.num;
    const ocorr = item.ocorrencias || [];

    // título do modalDetalhes: "CLIENTE: <NUM> - <NOME>"
    const nome = getNomeCliente(ocorr[0]) || '';
    const tit = document.getElementById('detalhesTitulo');
    if (tit) {
      tit.textContent = nome
        ? `CLIENTE: ${sanitizeOneLine(num)} - ${sanitizeOneLine(nome)}`
        : `CLIENTE: ${sanitizeOneLine(num)}`;
    }

    // tenta reaproveitar colunas selecionadas (mas removendo OBS CC)
    const modalContent = document.getElementById('detalhesConteudo');
    let selectedColumns = [];

    if (modalContent && modalContent.dataset.selectedColumns) {
      try { selectedColumns = JSON.parse(modalContent.dataset.selectedColumns); }
      catch (_) { selectedColumns = []; }
    }

    selectedColumns = (selectedColumns || []).filter(c => {
      const cc = String(c || '').toUpperCase();
      return !cc.includes('OBS') && !cc.includes('CC');
    });

    fillDetailsModal(String(num || '').trim(), ocorr, selectedColumns);

    // garante que o detalhes fique acima
    bringDetalhesToFront();
    openModal('modalDetalhes');
  });

  renderRanking('rankingClientesCausa', rankingCausa, (item) => {
    const tit = document.getElementById('detalhesTitulo');
    if (tit) tit.textContent = `CAUSA: ${sanitizeOneLine(item.name)}`;

    fillDetailsModal(String(item.name || ''), item.ocorrencias || [], []);

    bringDetalhesToFront();
    openModal('modalDetalhes');
  });

  // abre modalClientes
  openModal('modalClientes');
}