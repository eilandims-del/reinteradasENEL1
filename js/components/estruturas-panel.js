// =========================
// FILE: js/components/estruturas-panel.js
// =========================
import { updateEstruturasPins } from './mapa.js';
import { extractAlimBaseFlex } from '../utils/estruturas-utils.js';

let lastCtx = {
  regional: '',
  rows: [],
  catalog: [],
  selectedAlims: new Set()
};

function getSelectedCats() {
  const cd = document.getElementById('estrCatCD')?.checked;
  const f  = document.getElementById('estrCatF')?.checked;
  const r  = document.getElementById('estrCatR')?.checked;

  const out = [];
  if (cd) out.push('CD');
  if (f) out.push('F');
  if (r) out.push('R');
  return out.length ? out : ['CD','F','R'];
}

function setStatus(txt) {
  const el = document.getElementById('estrStatus');
  if (el) el.textContent = `• ${txt}`;
}

function setList(items = []) {
  const list = document.getElementById('estrList');
  if (!list) return;

  if (!items.length) {
    list.innerHTML = `<div class="estr-empty">Nenhuma estrutura (CD/F/R) encontrada para as reiteradas da visão atual.</div>`;
    return;
  }

  list.innerHTML = '';

  items.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'estr-item';
    div.innerHTML = `
      <div class="estr-left">
        <div class="estr-name">${p.name}</div>
        <div class="estr-meta">• (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})</div>
      </div>
      <div class="estr-badge">${p.category}</div>
    `;

    div.onclick = () => {
      try {
        window.dispatchEvent(new CustomEvent('estruturas:focus', { detail: { lat: p.lat, lng: p.lng, name: p.name } }));
      } catch (_) {}
    };

    list.appendChild(div);
  });
}

function fillAlimOptions(catalog = [], selectedAlims = new Set()) {
  const sel = document.getElementById('estrAlimentador');
  if (!sel) return;

  const opts = ['TODOS', ...catalog.map(extractAlimBaseFlex).filter(Boolean)];
  const uniq = Array.from(new Set(opts.map(v => String(v).toUpperCase())));

  const current = sel.value || 'TODOS';
  sel.innerHTML = '';

  uniq.forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });

  const exists = uniq.includes(current);
  sel.value = exists ? current : 'TODOS';
}

async function run() {
  const regionalSelect = document.getElementById('estrRegional');
  const alimSelect = document.getElementById('estrAlimentador');

  const regionalMode = regionalSelect?.value || 'AUTO';
  const regional = (regionalMode === 'AUTO') ? lastCtx.regional : regionalMode;

  if (!regional) {
    setStatus('selecione uma regional');
    setList([]);
    return;
  }

  const alimBase = alimSelect?.value || 'TODOS';
  const cats = getSelectedCats();

  setStatus('carregando...');
  const res = await updateEstruturasPins(lastCtx.rows, {
    regional,
    alimentadorBase: alimBase,
    categories: cats
  });

  const matches = res?.matches || [];
  setStatus(`exibindo ${matches.length}`);
  setList(matches);

  window.addEventListener('estruturas:focus', (e) => {
    const d = e?.detail || {};
    if (!d.lat || !d.lng) return;
    try {
      if (window.__leaflet_map_instance && window.__leaflet_map_instance.setView) {
        window.__leaflet_map_instance.setView([d.lat, d.lng], 14);
      }
    } catch (_) {}
  }, { once: true });
}

export function initEstruturasPanel() {
  const btn = document.getElementById('estrRecarregar');
  const reg = document.getElementById('estrRegional');
  const alim = document.getElementById('estrAlimentador');

  btn?.addEventListener('click', run);
  reg?.addEventListener('change', run);
  alim?.addEventListener('change', run);

  document.getElementById('estrCatCD')?.addEventListener('change', run);
  document.getElementById('estrCatF')?.addEventListener('change', run);
  document.getElementById('estrCatR')?.addEventListener('change', run);

  const panel = document.getElementById('estruturasPanel');
  const toggle = document.getElementById('estrToggle');

  const applyCollapsedUI = (collapsed) => {
    if (!panel || !toggle) return;
    panel.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
  };

  try {
    const saved = localStorage.getItem('estrPanelCollapsed');
    applyCollapsedUI(saved === '1');
  } catch (_) {}

  toggle?.addEventListener('click', () => {
    if (!panel) return;
    const collapsedNow = !panel.classList.contains('is-collapsed');
    applyCollapsedUI(collapsedNow);
    try { localStorage.setItem('estrPanelCollapsed', collapsedNow ? '1' : '0'); } catch (_) {}
  });

  setStatus('aguardando dados');
}

export function updateEstruturasContext({ regional, rows, catalog, selectedAlimentadores }) {
  lastCtx.regional = String(regional || '').toUpperCase().trim();
  lastCtx.rows = Array.isArray(rows) ? rows : [];
  lastCtx.catalog = Array.isArray(catalog) ? catalog : [];
  lastCtx.selectedAlims = selectedAlimentadores instanceof Set ? selectedAlimentadores : new Set();

  fillAlimOptions(lastCtx.catalog, lastCtx.selectedAlims);

  run();
}
