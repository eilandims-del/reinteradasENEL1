// =========================
// FILE: js/components/modal-alimentadores-catalog.js
// =========================
import { openModal, closeModal } from './modal.js';
import {
  getBlocosForRegional,
  getCidadesByBloco,
  getAlimentadoresByCidade,
  getAllAlimentadoresForRegional
} from '../services/alimentadores-catalog.js';

function normKey(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function setupAlimentadoresCatalogModal(opts = {}) {
  const {
    getSelectedRegional = () => '',
    onMissingRegional = null
  } = opts;

  const modalId = 'modalAlimentadores';

  const listEl = document.getElementById('alimListModal');
  const hintEl = document.getElementById('alimHintModal');
  const searchEl = document.getElementById('alimSearchModal');

  const btnAll = document.getElementById('btnAlimAllModal');
  const btnClear = document.getElementById('btnAlimClearModal');
  const btnApply = document.getElementById('btnConfirmarAlimModal');

  if (!listEl || !hintEl || !btnAll || !btnClear || !btnApply) {
    console.error('[ALIM-CAT] IDs do modal não encontrados no index.html.');
    return { open: () => console.warn('[ALIM-CAT] modal não inicializado (IDs faltando).') };
  }

  let selected = new Set(); // normKey(alimentador)
  let lastRegional = '';

  function dispatchChanged(regional, mode) {
    const all = getAllAlimentadoresForRegional(regional);
    const selectedArr = Array.from(selected);

    const blocos = getBlocosForRegional(regional);
    const blocosSel = [];

    blocos.forEach(bloco => {
      const cidades = getCidadesByBloco(regional, bloco);
      const hasAny = cidades.some(c => {
        const alims = getAlimentadoresByCidade(regional, bloco, c);
        return alims.some(a => selected.has(normKey(a)));
      });
      if (hasAny) blocosSel.push(bloco);
    });

    document.dispatchEvent(
      new CustomEvent('alimentadores:changed', {
        detail: {
          regional,
          mode, // 'TODOS' | 'CUSTOM'
          conjuntos: blocosSel,
          alimentadores: mode === 'TODOS' ? all : selectedArr
        }
      })
    );
  }

  function renderHint(regional) {
    const all = getAllAlimentadoresForRegional(regional);
    const total = all.length;

    if (!total) {
      hintEl.innerHTML = `Catálogo: <b>0</b>`;
      return;
    }

    if (selected.size === total) {
      hintEl.innerHTML = `Modo: <b>TODOS</b> • Catálogo: <b>${total}</b>`;
      return;
    }

    if (selected.size > 0) {
      hintEl.innerHTML = `Selecionados: <b>${selected.size}</b> • Catálogo: <b>${total}</b>`;
      return;
    }

    hintEl.innerHTML = `Escolha <b>TODOS</b> ou selecione <b>1+</b> alimentadores.`;
  }

  function matchesSearch(text, term) {
    if (!term) return true;
    return normKey(text).includes(normKey(term));
  }

  // Junta TODOS os alimentadores de um BLOCO (conjunto), sem separar por cidade
  function getAlimsDoBloco(regional, bloco) {
    const cidades = getCidadesByBloco(regional, bloco) || [];
    const out = [];
    cidades.forEach(cidade => {
      const alims = getAlimentadoresByCidade(regional, bloco, cidade) || [];
      alims.forEach(a => out.push({ alim: a, cidade }));
    });
    // ordena pelo código do alimentador
    out.sort((x, y) => String(x.alim).localeCompare(String(y.alim), 'pt-BR'));
    return out;
  }

  function renderList(regional) {
    listEl.innerHTML = '';

    const blocos = getBlocosForRegional(regional);
    if (!blocos.length) {
      listEl.innerHTML = `<div class="alim-empty">Catálogo não encontrado para ${regional}.</div>`;
      renderHint(regional);
      return;
    }

    const term = String(searchEl?.value || '').trim();

    blocos.forEach(bloco => {
      const itens = getAlimsDoBloco(regional, bloco);
      if (!itens.length) return;

      // filtro por busca (considera bloco + cidade + alim)
      const visiveis = itens.filter(({ alim, cidade }) =>
        matchesSearch(`${bloco} ${cidade} ${alim}`, term)
      );
      if (!visiveis.length) return;

      const block = document.createElement('div');
      block.className = 'alim-block';

      // ===== Header do BLOCO (Conjunto) + checkbox selecionar tudo =====
      const header = document.createElement('div');
      header.className = 'alim-block-header';

      const left = document.createElement('label');
      left.className = 'alim-block-left';

      const blocoToggle = document.createElement('input');
      blocoToggle.type = 'checkbox';

      const alimsDoBloco = itens.map(x => x.alim);
      const allSelected = alimsDoBloco.length > 0 && alimsDoBloco.every(a => selected.has(normKey(a)));
      const anySelected = alimsDoBloco.some(a => selected.has(normKey(a)));

      blocoToggle.checked = allSelected;
      blocoToggle.indeterminate = !allSelected && anySelected;

      blocoToggle.onchange = () => {
        if (blocoToggle.checked) alimsDoBloco.forEach(a => selected.add(normKey(a)));
        else alimsDoBloco.forEach(a => selected.delete(normKey(a)));
        renderList(regional);
      };

      const title = document.createElement('span');
      title.className = 'alim-block-title';
      title.innerHTML = `<span class="alim-diamond">◆</span> <span>${bloco}</span>`;

      left.appendChild(blocoToggle);
      left.appendChild(title);

      header.appendChild(left);
      block.appendChild(header);

      // ===== Grid do BLOCO (horizontal) =====
      const grid = document.createElement('div');
      grid.className = 'alim-grid';

      visiveis.forEach(({ alim }) => {
        const key = normKey(alim);
        const checked = selected.has(key);

        const chip = document.createElement('label');
        chip.className = 'alim-chip';
        if (checked) chip.classList.add('is-checked');

        chip.innerHTML = `
          <input type="checkbox" ${checked ? 'checked' : ''} />
          <span title="${alim}">${alim}</span>
        `;

        const input = chip.querySelector('input');
        input.onchange = () => {
          if (input.checked) selected.add(key);
          else selected.delete(key);

          chip.classList.toggle('is-checked', input.checked);
          renderHint(regional);

          // atualiza checkbox do bloco (checked/indeterminate)
          const allSel = alimsDoBloco.every(a => selected.has(normKey(a)));
          const anySel = alimsDoBloco.some(a => selected.has(normKey(a)));
          blocoToggle.checked = allSel;
          blocoToggle.indeterminate = !allSel && anySel;
        };

        grid.appendChild(chip);
      });

      block.appendChild(grid);
      listEl.appendChild(block);
    });

    renderHint(regional);
  }

  function open() {
    const regional = String(getSelectedRegional() || '').trim().toUpperCase();

    if (!regional) {
      if (typeof onMissingRegional === 'function') onMissingRegional();
      return;
    }

    if (regional !== lastRegional) {
      selected = new Set();
      lastRegional = regional;
      if (searchEl) searchEl.value = '';
    }

    renderList(regional);
    openModal(modalId);
  }

  // ====== eventos (topbar) ======
  btnAll.onclick = (e) => {
    e.preventDefault();
    const regional = String(getSelectedRegional() || '').trim().toUpperCase();
    if (!regional) return;

    const all = getAllAlimentadoresForRegional(regional);
    selected = new Set(all.map(normKey));

    renderList(regional);
    dispatchChanged(regional, 'TODOS');
    closeModal(modalId);
  };

  btnClear.onclick = (e) => {
    e.preventDefault();
    const regional = String(getSelectedRegional() || '').trim().toUpperCase();
    if (!regional) return;

    selected = new Set();
    renderList(regional);
  };

  if (searchEl) {
    searchEl.oninput = () => {
      const regional = String(getSelectedRegional() || '').trim().toUpperCase();
      if (!regional) return;
      renderList(regional);
    };
  }

  btnApply.onclick = (e) => {
    e.preventDefault();
    const regional = String(getSelectedRegional() || '').trim().toUpperCase();
    if (!regional) return;

    const all = getAllAlimentadoresForRegional(regional);
    const total = all.length;

    if (selected.size === 0) {
      renderHint(regional);
      return;
    }

    const mode = selected.size === total ? 'TODOS' : 'CUSTOM';
    dispatchChanged(regional, mode);
    closeModal(modalId);
  };

  return { open };
}
