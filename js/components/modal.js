/**
 * Componente Modal - Gerenciamento de Modais
 */

import { formatDate } from '../utils/helpers.js';

/**
 * Abrir modal
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Fechar modal
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/**
 * Inicializar eventos de fechamento de modal
 */
export function initModalEvents() {
  // Fechar ao clicar fora (BACKDROP) — EXCETO modalDetalhes
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('modal')) return;

    // modalDetalhes NÃO fecha clicando fora
    if (e.target.id === 'modalDetalhes') return;

    closeModal(e.target.id);
  });

  // Fechar com ESC — EXCETO modalDetalhes
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    const activeModal = document.querySelector('.modal.active');
    if (!activeModal) return;

    // modalDetalhes NÃO fecha no ESC
    if (activeModal.id === 'modalDetalhes') return;

    closeModal(activeModal.id);
  });

  // Fechar modal ao clicar no botão X (delegação)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.modal-close');
    if (!btn) return;

    const modal = btn.closest('.modal');
    if (modal) closeModal(modal.id);
  });
}


/**
 * Preencher modal de detalhes (AGORA EM TABELA/HORIZONTAL)
 */
export function fillDetailsModal(elemento, ocorrencias, selectedColumns = []) {
  const modalContent = document.getElementById('detalhesConteudo');
  if (!modalContent) return;

  // Limpar conteúdo anterior
  modalContent.innerHTML = '';

  // Ordem fixa dos campos principais
  const fixedFields = [
    { key: 'INCIDENCIA', label: 'INCIDÊNCIA' },
    { key: 'ELEMENTO', label: 'ELEMENTO' },
    { key: 'DATA', label: 'DATA' },
    { key: 'CAUSA', label: 'CAUSA' },
    { key: 'CLI. AFE', label: 'CLI. AFE' },
    { key: 'ALIMENT.', label: 'ALIMENTADOR' },
    { key: 'CONJUNTO', label: 'CONJUNTO' }
  ];
  

  // Normaliza colunas adicionais e remove duplicadas (por segurança)
  const extraCols = Array.from(new Set((selectedColumns || []).filter(Boolean)));

  // Wrapper com scroll horizontal
  const wrap = document.createElement('div');
  wrap.className = 'detalhes-table-wrap';

  const table = document.createElement('table');
  table.className = 'detalhes-table';

  // THEAD
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');

  // Cabeçalhos fixos
  fixedFields.forEach(f => {
    const th = document.createElement('th');
    th.textContent = f.label;
    trHead.appendChild(th);
  });

  // Cabeçalhos extras
  extraCols.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    trHead.appendChild(th);
  });

  thead.appendChild(trHead);
  table.appendChild(thead);

  // TBODY
  const tbody = document.createElement('tbody');

  if (!Array.isArray(ocorrencias) || ocorrencias.length === 0) {
    const trEmpty = document.createElement('tr');
    const tdEmpty = document.createElement('td');
    tdEmpty.colSpan = fixedFields.length + extraCols.length;
    tdEmpty.textContent = 'Nenhuma ocorrência encontrada.';
    tdEmpty.style.textAlign = 'center';
    tdEmpty.style.padding = '1rem';
    trEmpty.appendChild(tdEmpty);
    tbody.appendChild(trEmpty);
  } else {
    ocorrencias.forEach((ocorrencia) => {
      const tr = document.createElement('tr');

      // colunas fixas
      fixedFields.forEach(field => {
        const td = document.createElement('td');

        let value = getValueSmart(ocorrencia, field.key);
        if (value === '' || value == null) value = 'N/A';

        // INCIDENCIA com link
        if (field.key === 'INCIDENCIA' && value !== 'N/A') {
          const url = formatIncidenciaUrl(value);
          if (url) {
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = String(value);
            td.appendChild(a);
          } else {
            td.textContent = String(value);
          }
        }
        // DATA formatada
        else if (field.key === 'DATA' && value !== 'N/A') {
          td.textContent = formatDate(value);
        }
        else {
          td.textContent = String(value);
        }

        tr.appendChild(td);
      });

      // colunas extras
      extraCols.forEach(colKey => {
        const td = document.createElement('td');
        let value = getValueSmart(ocorrencia, colKey);
        if (value === '' || value == null) value = 'N/A';
        td.textContent = String(value);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  modalContent.appendChild(wrap);

  // Salvar dados para uso posterior
  modalContent.dataset.elemento = elemento;
  modalContent.dataset.selectedColumns = JSON.stringify(extraCols);
}

/**
 * Buscar valor no objeto tentando variações de chave
 */
function getValueSmart(obj, key) {
  if (!obj) return '';

  // tentativa direta
  if (obj[key] != null) return obj[key];

  // variações comuns
  const normalizedTarget = normalizeKey(key);
  const keyNoDot = String(key).replace(/\./g, '');
  if (obj[keyNoDot] != null) return obj[keyNoDot];

  const upper = String(key).toUpperCase();
  const lower = String(key).toLowerCase();
  if (obj[upper] != null) return obj[upper];
  if (obj[lower] != null) return obj[lower];

  // busca em todas as chaves por normalização
  for (const k in obj) {
    if (normalizeKey(k) === normalizedTarget) return obj[k];
  }

  return '';
}

/**
 * Normalizar chave (remove espaços, acentos, pontos)
 */
function normalizeKey(key) {
  return String(key || '')
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '');
}

/**
 * Formatar URL de incidência
 */
function formatIncidenciaUrl(incidencia) {
  if (!incidencia) return null;
  const cleaned = String(incidencia).trim();
  return `http://sdeice.enelint.global/SAC_Detalhe_Inci.asp?inci_ref=${cleaned}`;
}

/**
 * Exportar a tabela de detalhes (modal) para Excel (.xlsx)
 * Requer SheetJS carregado via CDN (window.XLSX)
 */
export function exportDetailsToExcel() {
  const modalContent = document.getElementById('detalhesConteudo');
  if (!modalContent) return;

  const table = modalContent.querySelector('table.detalhes-table');
  if (!table) {
    alert('Nenhuma tabela encontrada para exportar.');
    return;
  }

  if (!window.XLSX) {
    alert('Biblioteca XLSX não carregada. Verifique se o script do SheetJS foi incluído no index.html.');
    return;
  }

  // Extrai dados da tabela (thead + tbody) para matriz (AOA)
  const aoa = [];

  // Cabeçalho
  const headCells = table.querySelectorAll('thead th');
  const headerRow = Array.from(headCells).map(th => (th.textContent || '').trim());
  aoa.push(headerRow);

  // Linhas
  const bodyRows = table.querySelectorAll('tbody tr');
  bodyRows.forEach(tr => {
    const cells = tr.querySelectorAll('td');
    const row = Array.from(cells).map(td => {
      const a = td.querySelector('a');
      const txt = (a ? a.textContent : td.textContent) || '';
      return String(txt).trim();
    });

    // Evita exportar a linha "Nenhuma ocorrência encontrada."
    const isEmptyRow = row.length === 1 && /nenhuma ocorr/i.test(row[0]);
    if (!isEmptyRow) aoa.push(row);
  });

  if (aoa.length <= 1) {
    alert('Sem ocorrências para exportar.');
    return;
  }

  // Nome do arquivo
  const elemento = (modalContent.dataset.elemento || 'ELEMENTO').toString().trim();
  const safeElemento = elemento.replace(/[\\/:*?"<>|]/g, '-');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileName = `Detalhes_${safeElemento}_${stamp}.xlsx`;

  // Gera worksheet
  const ws = window.XLSX.utils.aoa_to_sheet(aoa);

  // Ajuste simples de largura das colunas
  const colWidths = headerRow.map((h, i) => {
    let maxLen = String(h || '').length;
    for (let r = 1; r < aoa.length; r++) {
      maxLen = Math.max(maxLen, String(aoa[r][i] || '').length);
    }
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });
  ws['!cols'] = colWidths;

  // Workbook
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Detalhes');

  // Download
  window.XLSX.writeFile(wb, fileName);
}
/**
 * Monta (ou atualiza) o modal de relatório por Alimentador
 */
export function buildAlimentadorReportModal(alimentadores = []) {
  // cria o modal se não existir
  let modal = document.getElementById('modalRelatorioAlimentador');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalRelatorioAlimentador';
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 720px;">
        <div class="modal-header">
          <h2>Relatório por Alimentador</h2>
          <button class="modal-close" aria-label="Fechar">&times;</button>
        </div>

        <div class="modal-body">
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <input id="alimentadorReportSearch" type="text" placeholder="Buscar alimentador..." style="flex:1; padding:10px;" />
            <button id="alimentadorReportSelectAll" class="btn btn-secondary btn-sm" type="button">Marcar todos</button>
            <button id="alimentadorReportClearAll" class="btn btn-secondary btn-sm" type="button">Limpar</button>
          </div>

          <div id="alimentadorReportList" style="max-height: 320px; overflow:auto; border:1px solid var(--border-color); border-radius:8px; padding:10px;"></div>
        </div>

        <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
          <button id="alimentadorReportExport" class="btn btn-primary" type="button">EXPORTAR</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // ordena e remove vazios
  const list = [...new Set(alimentadores.map(a => String(a || '').trim()).filter(Boolean))].sort();

  const listEl = modal.querySelector('#alimentadorReportList');
  const searchEl = modal.querySelector('#alimentadorReportSearch');
  const btnAll = modal.querySelector('#alimentadorReportSelectAll');
  const btnClear = modal.querySelector('#alimentadorReportClearAll');
  const btnExport = modal.querySelector('#alimentadorReportExport');

  const renderList = (filterText = '') => {
    const ft = String(filterText || '').trim().toUpperCase();
    listEl.innerHTML = '';

    const frag = document.createDocumentFragment();
    list
      .filter(a => !ft || a.toUpperCase().includes(ft))
      .forEach((a) => {
        const id = `chk_${a.replace(/\W+/g, '_')}`;

        const row = document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '6px 4px';
        row.style.cursor = 'pointer';

        row.innerHTML = `
          <input type="checkbox" class="alimentadorReportChk" value="${escapeHtml(a)}" />
          <span>${escapeHtml(a)}</span>
        `;

        frag.appendChild(row);
      });

    listEl.appendChild(frag);
  };

  renderList('');

  searchEl.oninput = (e) => renderList(e.target.value);

  btnAll.onclick = () => {
    modal.querySelectorAll('.alimentadorReportChk').forEach(chk => chk.checked = true);
  };

  btnClear.onclick = () => {
    modal.querySelectorAll('.alimentadorReportChk').forEach(chk => chk.checked = false);
  };

  btnExport.onclick = async () => {
    const selected = Array.from(modal.querySelectorAll('.alimentadorReportChk'))
      .filter(chk => chk.checked)
      .map(chk => chk.value);

    if (!selected.length) {
      alert('Selecione pelo menos 1 alimentador.');
      return;
    }

    // dispara a exportação (implementada no ranking.js para usar os dados atuais)
    // este evento customizado é simples e evita import circular
    window.dispatchEvent(new CustomEvent('export-alimentador-report', { detail: { selected } }));
  };
}

/**
 * Escape básico para HTML
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
