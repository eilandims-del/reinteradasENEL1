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
  // Fechar ao clicar fora
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      closeModal(e.target.id);
    }
  });

  // Fechar com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal.active');
      if (activeModal) closeModal(activeModal.id);
    }
  });
      // Fechar modal ao clicar no botão X
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.modal-close');
        if (!btn) return;

        const modal = btn.closest('.modal');
        if (modal) {
            closeModal(modal.id);
        }
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
