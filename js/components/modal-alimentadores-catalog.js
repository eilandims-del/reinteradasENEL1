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

  let selected = new Set();   // normKey(alimentador)
  let lastRegional = '';

  function dispatchChanged(regional, mode) {
    const all = getAllAlimentadoresForRegional(regional);
    const selectedArr = Array.from(selected);

    // blocos selecionados = blocos que têm 1+ alimentador selecionado
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
      const cidades = getCidadesByBloco(regional, bloco);
      if (!cidades.length) return;

      // Se nada dentro do bloco bater com busca, não renderiza o bloco
      const blocoMatches = cidades.some(cidade => {
        const alims = getAlimentadoresByCidade(regional, bloco, cidade);
        return alims.some(a => matchesSearch(`${bloco} ${cidade} ${a}`, term));
      });
      if (!blocoMatches) return;

      const block = document.createElement('div');
      block.className = 'alim-block';

      const blockTitle = document.createElement('div');
      blockTitle.className = 'alim-block-title';
      blockTitle.innerHTML = `<span class="alim-diamond">◆</span> <span>${bloco}</span>`;
      block.appendChild(blockTitle);

      cidades.forEach(cidade => {
        const alims = getAlimentadoresByCidade(regional, bloco, cidade);
        if (!alims.length) return;

        const cidadeMatches = alims.some(a => matchesSearch(`${bloco} ${cidade} ${a}`, term));
        if (!cidadeMatches) return;

        const city = document.createElement('div');
        city.className = 'alim-city';

        const cityHeader = document.createElement('div');
        cityHeader.className = 'alim-city-header';

        const left = document.createElement('label');
        left.className = 'alim-city-left';

        const cityToggle = document.createElement('input');
        cityToggle.type = 'checkbox';

        const allInCitySelected = alims.every(a => selected.has(normKey(a)));
        const anyInCitySelected = alims.some(a => selected.has(normKey(a)));
        cityToggle.checked = allInCitySelected;
        cityToggle.indeterminate = !allInCitySelected && anyInCitySelected;

        cityToggle.onchange = () => {
          if (cityToggle.checked) alims.forEach(a => selected.add(normKey(a)));
          else alims.forEach(a => selected.delete(normKey(a)));
          renderList(regional); // atualiza indeterminate e chips
        };

        const cityName = document.createElement('span');
        cityName.className = 'alim-city-name';
        cityName.textContent = cidade;

        left.appendChild(cityToggle);
        left.appendChild(cityName);

        cityHeader.appendChild(left);
        city.appendChild(cityHeader);

        const grid = document.createElement('div');
        grid.className = 'alim-grid';

        alims.forEach(a => {
          if (!matchesSearch(`${bloco} ${cidade} ${a}`, term)) return;

          const key = normKey(a);
          const checked = selected.has(key);

          const chip = document.createElement('label');
          chip.className = 'alim-chip';
          chip.classList.toggle('is-checked', checked);

          chip.innerHTML = `
            <input type="checkbox" ${checked ? 'checked' : ''} />
            <span>${a}</span>
          `;

          const input = chip.querySelector('input');
          input.onchange = () => {
            if (input.checked) selected.add(key);
            else selected.delete(key);
            renderHint(regional);

            // atualiza “select city”
            const allSel = alims.every(x => selected.has(normKey(x)));
            const anySel = alims.some(x => selected.has(normKey(x)));
            cityToggle.checked = allSel;
            cityToggle.indeterminate = !allSel && anySel;

            chip.classList.toggle('is-checked', input.checked);
          };

          grid.appendChild(chip);
        });

        city.appendChild(grid);
        block.appendChild(city);
      });

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

    // troca regional => limpa seleção e busca
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
