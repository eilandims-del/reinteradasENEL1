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
            if (activeModal) {
                closeModal(activeModal.id);
            }
        }
    });
}

/**
 * Preencher modal de detalhes
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

    // Processar cada ocorrência
    ocorrencias.forEach((ocorrencia, index) => {
        const ocorrenciaDiv = document.createElement('div');
        ocorrenciaDiv.className = 'ocorrencia-group';
        if (index < ocorrencias.length - 1) {
            ocorrenciaDiv.style.borderBottom = '2px solid rgba(30, 124, 232, 0.1)';
            ocorrenciaDiv.style.marginBottom = '2rem';
            ocorrenciaDiv.style.paddingBottom = '2rem';
        }

        // Adicionar título da ocorrência
        const titulo = document.createElement('h3');
        titulo.textContent = `Ocorrência ${index + 1} de ${ocorrencias.length}`;
        ocorrenciaDiv.appendChild(titulo);

        // Campos fixos
        fixedFields.forEach(field => {
            // Buscar pela chave original, normalizada, e variações
            // Para DATA, tentar várias variações incluindo busca em todas as chaves
            let value = ocorrencia[field.key] || 
                       ocorrencia[normalizeKey(field.key)] || 
                       ocorrencia[field.key.replace(/\./g, '')] ||
                       ocorrencia[field.key.toUpperCase()] ||
                       ocorrencia[field.key.toLowerCase()] ||
                       null;
            
            // Se ainda não encontrou, buscar em todas as chaves (caso esteja normalizada)
            if (!value || value === null || value === undefined) {
                const normalizedField = normalizeKey(field.key);
                for (const key in ocorrencia) {
                    if (normalizeKey(key) === normalizedField) {
                        value = ocorrencia[key];
                        break;
                    }
                }
            }
            
            // Se ainda não encontrou, usar 'N/A'
            if (!value || value === null || value === undefined || value === '') {
                value = 'N/A';
            }
            
            const itemDiv = document.createElement('div');
            itemDiv.className = 'detalhe-item';

            const label = document.createElement('span');
            label.className = 'detalhe-label';
            label.textContent = field.label + ':';

            const valueSpan = document.createElement('span');
            valueSpan.className = 'detalhe-value';

            // Tratamento especial para INCIDENCIA
            if (field.key === 'INCIDENCIA' && value !== 'N/A') {
                const url = formatIncidenciaUrl(value);
                if (url) {
                    const link = document.createElement('a');
                    link.href = url;
                    link.target = '_blank';
                    link.textContent = value;
                    valueSpan.appendChild(link);
                } else {
                    valueSpan.textContent = value;
                }
            } else if (field.key === 'DATA' && value !== 'N/A') {
                valueSpan.textContent = formatDate(value);
            } else {
                valueSpan.textContent = value;
            }

            itemDiv.appendChild(label);
            itemDiv.appendChild(valueSpan);
            ocorrenciaDiv.appendChild(itemDiv);
        });

        // Campos adicionais selecionados
        if (selectedColumns.length > 0) {
            selectedColumns.forEach(colKey => {
                const value = ocorrencia[colKey] || ocorrencia[normalizeKey(colKey)] || 'N/A';
                
                if (value !== 'N/A') {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'detalhe-item';

                    const label = document.createElement('span');
                    label.className = 'detalhe-label';
                    label.textContent = colKey + ':';

                    const valueSpan = document.createElement('span');
                    valueSpan.className = 'detalhe-value';
                    valueSpan.textContent = value;

                    itemDiv.appendChild(label);
                    itemDiv.appendChild(valueSpan);
                    ocorrenciaDiv.appendChild(itemDiv);
                }
            });
        }

        modalContent.appendChild(ocorrenciaDiv);
    });

    // Salvar dados para uso posterior
    modalContent.dataset.elemento = elemento;
    modalContent.dataset.selectedColumns = JSON.stringify(selectedColumns);
}

/**
 * Normalizar chave (remove espaços, acentos)
 */
function normalizeKey(key) {
    return key.toUpperCase().trim()
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

