// =========================
// FILE: js/components/modal-alimentadores-catalog.js
// =========================

import { openModal, closeModal } from './modal.js';
import {
  getCatalogForRegional,
  getAlimentadoresByConjunto,
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

    document.dispatchEvent(
      new CustomEvent('alimentadores:changed', {
        detail: {
          regional,
          mode, // 'TODOS' | 'CUSTOM'
          conjuntos: [], // opcional (você não está usando isso agora)
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

    const catalog = getCatalogForRegional(regional);
    const conjuntos = (catalog && Array.isArray(catalog.conjuntos)) ? catalog.conjuntos : [];

    if (!conjuntos.length) {
      listEl.innerHTML = `<div style="padding:12px; color:#666; font-weight:800;">Catálogo não encontrado para esta regional.</div>`;
      renderHint(regional);
      return;
    }

    const term = String(searchEl?.value || '').trim();

    conjuntos.forEach(conj => {
      const alims = getAlimentadoresByConjunto(regional, conj);
      if (!alims.length) return;

      // filtro de busca: se nada no grupo bater, não renderiza
      const anyVisible = alims.some(a => matchesSearch(`${conj} ${a}`, term));
      if (!anyVisible) return;

      const block = document.createElement('div');
      block.className = 'alim-block';
      block.style.border = '1px solid rgba(0,0,0,0.08)';
      block.style.borderRadius = '12px';
      block.style.padding = '10px';
      block.style.background = 'rgba(255,255,255,0.92)';
      block.style.marginTop = '10px';

      // ===== HEADER DO CONJUNTO (mantém) =====
      const headerConj = document.createElement('div');
      headerConj.style.fontWeight = '900';
      headerConj.style.marginBottom = '10px';
      headerConj.style.display = 'flex';
      headerConj.style.alignItems = 'center';
      headerConj.style.gap = '8px';
      headerConj.innerHTML = `🔷 <span>${conj}</span>`;
      block.appendChild(headerConj);

      // ===== Agora: o conj (ex: "Acaraú", "Marco") é representado como subgrupos? =====
      // No seu catálogo atual você já está usando "BLOCO X" como conjunto.
      // Então dentro dele, os alimentadores já são a lista direta.
      // Para continuar exibindo como você está vendo (com cidades),
      // a cidade está vindo no próprio label do alimentador? NÃO.
      // Então vamos fazer o agrupamento por "prefixo" caso você esteja usando isso.
      //
      // ✅ Regra prática:
      // - Se você quer "Acaraú" / "Marco" dentro do BLOCO, você precisa
      //   que o catálogo traga esses subgrupos como chaves. Ex:
      //   "BLOCO ACARAÚ - Acaraú": [...]
      //   "BLOCO ACARAÚ - Marco": [...]
      //
      // Como no seu print isso já existe, então aqui vamos detectar:
      // se o conj tiver " - " vamos separar (Bloco - Cidade)
      //
      // Porém, no seu print o bloco já aparece e abaixo aparecem as cidades,
      // então seu catálogo provavelmente já está no formato:
      // "BLOCO ACARAÚ" (conj) e dentro do array você está renderizando subheaders manualmente.
      //
      // Para não quebrar sua estrutura atual, vamos assumir que você quer
      // o subheader por cidade pelo texto "📍 Cidade" que você já estava montando
      // no render anterior. Então: vamos reconstruir a lógica para gerar subgrupos
      // a partir de um "mapa" que vem embutido no próprio array? (não temos)
      //
      // ✅ SOLUÇÃO SEM INVENTAR:
      // Se você quer mesmo "Acaraú"/"Marco" como subgrupos, o certo é o catálogo
      // já devolver isso separado. Então vamos suportar OS DOIS formatos:
      // 1) Conjunto normal (sem subgrupos): lista direta
      // 2) Conjunto com subgrupos: se o "conj" vier como "BLOCO ACARAÚ - Acaraú"
      //
      // Como você já tem isso acontecendo na UI, vou implementar o formato 2
      // com agrupamento por chave do conjunto quando tiver " - ".
      //
      // Então: primeiro, vamos criar um agrupamento local de subgrupos por "cidade"
      // quando o conj vier no formato "BLOCO X - Cidade".
      //
      // Mas aqui estamos iterando por conj (cada conj é uma chave única).
      // Logo, se seu catálogo estiver no formato "BLOCO X - Cidade", o header do bloco
      // acima não deve ficar como "BLOCO X - Cidade".
      //
      // ✅ Melhor: detectar e separar:
      const parts = String(conj).split(' - ').map(s => s.trim()).filter(Boolean);
      const blocoName = parts[0] || conj;
      const cidadeName = parts[1] || ''; // se houver

      // se tinha " - ", ajusta o header do bloco para só BLOCO
      if (parts.length >= 2) {
        headerConj.innerHTML = `🔷 <span>${blocoName}</span>`;
      }

      // Se NÃO tiver cidade (conjunto "normal"), renderiza lista simples
      if (!cidadeName) {
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
        grid.style.gap = '8px';

        alims.forEach(a => {
          if (!matchesSearch(`${conj} ${a}`, term)) return;

          const key = normKey(a);
          const checked = selected.has(key);

          const chip = document.createElement('label');
          chip.className = 'alim-chip';
          chip.style.display = 'flex';
          chip.style.alignItems = 'center';
          chip.style.justifyContent = 'space-between';
          chip.style.padding = '8px 10px';
          chip.style.borderRadius = '10px';
          chip.style.border = checked ? '2px solid #0A4A8C' : '1px solid rgba(0,0,0,0.12)';
          chip.style.background = checked ? 'rgba(10,74,140,0.10)' : '#fff';
          chip.style.cursor = 'pointer';
          chip.style.fontWeight = '900';

          chip.innerHTML = `
            <span style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" ${checked ? 'checked' : ''} style="transform:scale(1.05);" />
              <span>${a}</span>
            </span>
          `;

          const input = chip.querySelector('input');

          input.onchange = () => {
            if (input.checked) selected.add(key);
            else selected.delete(key);
            renderHint(regional);
          };

          chip.onclick = (e) => {
            if (e.target?.tagName?.toLowerCase() === 'input') return;
            input.checked = !input.checked;
            input.dispatchEvent(new Event('change'));
          };

          grid.appendChild(chip);
        });

        block.appendChild(grid);
        listEl.appendChild(block);
        renderHint(regional);
        return;
      }

      // ✅ Se tiver cidadeName: cria SUBHEADER com checkbox (seleciona tudo da cidade)
      const cityRow = document.createElement('div');
      cityRow.className = 'alim-city-row';
      cityRow.style.display = 'flex';
      cityRow.style.alignItems = 'center';
      cityRow.style.justifyContent = 'space-between';
      cityRow.style.gap = '10px';
      cityRow.style.margin = '6px 0 10px 0';
      cityRow.style.padding = '8px 10px';
      cityRow.style.borderRadius = '10px';
      cityRow.style.border = '1px solid rgba(0,0,0,0.10)';
      cityRow.style.background = 'rgba(0,0,0,0.03)';
      cityRow.style.fontWeight = '900';

      const leftCity = document.createElement('label');
      leftCity.style.display = 'flex';
      leftCity.style.alignItems = 'center';
      leftCity.style.gap = '10px';
      leftCity.style.cursor = 'pointer';

      const cityToggle = document.createElement('input');
      cityToggle.type = 'checkbox';

      const allInCitySelected = alims.every(a => selected.has(normKey(a)));
      cityToggle.checked = allInCitySelected;

      cityToggle.onchange = () => {
        if (cityToggle.checked) alims.forEach(a => selected.add(normKey(a)));
        else alims.forEach(a => selected.delete(normKey(a)));

        renderList(regional); // re-render para atualizar checks
      };

      const cityNameEl = document.createElement('span');
      cityNameEl.textContent = cidadeName;

      leftCity.appendChild(cityToggle);
      leftCity.appendChild(cityNameEl);

      cityRow.appendChild(leftCity);
      block.appendChild(cityRow);

      // grid alimentadores (da cidade)
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
      grid.style.gap = '8px';

      alims.forEach(a => {
        if (!matchesSearch(`${conj} ${a}`, term)) return;

        const key = normKey(a);
        const checked = selected.has(key);

        const chip = document.createElement('label');
        chip.className = 'alim-chip';
        chip.style.display = 'flex';
        chip.style.alignItems = 'center';
        chip.style.justifyContent = 'space-between';
        chip.style.padding = '8px 10px';
        chip.style.borderRadius = '10px';
        chip.style.border = checked ? '2px solid #0A4A8C' : '1px solid rgba(0,0,0,0.12)';
        chip.style.background = checked ? 'rgba(10,74,140,0.10)' : '#fff';
        chip.style.cursor = 'pointer';
        chip.style.fontWeight = '900';

        chip.innerHTML = `
          <span style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" ${checked ? 'checked' : ''} style="transform:scale(1.05);" />
            <span>${a}</span>
          </span>
        `;

        const input = chip.querySelector('input');

        input.onchange = () => {
          if (input.checked) selected.add(key);
          else selected.delete(key);

          renderHint(regional);
          cityToggle.checked = alims.every(x => selected.has(normKey(x)));
        };

        chip.onclick = (e) => {
          if (e.target?.tagName?.toLowerCase() === 'input') return;
          input.checked = !input.checked;
          input.dispatchEvent(new Event('change'));
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
      else console.warn('[ALIM-CAT] Nenhuma regional selecionada.');
      return;
    }

    const catalog = getCatalogForRegional(regional);
    if (!catalog || !Array.isArray(catalog.conjuntos) || !catalog.conjuntos.length) {
      listEl.innerHTML = `<div style="padding:12px; color:#666; font-weight:800;">Catálogo não encontrado para ${regional}.</div>`;
      hintEl.innerHTML = '';
      openModal(modalId);
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

  // ====== eventos ======
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
