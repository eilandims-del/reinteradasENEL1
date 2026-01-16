/**
 * Funções Auxiliares
 */

/**
 * Exibir toast notification
 */
export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Formatar data para exibição (DD/MM/YYYY)
 * IMPORTANTE: NUNCA usa new Date() com strings YYYY-MM-DD para evitar timezone
 * Parse manual para manter fidelidade total ao valor original
 */
export function formatDate(dateValue) {
    if (!dateValue) return 'N/A';
    
    try {
        let day, month, year;

        // Se for Timestamp do Firestore
        if (dateValue && typeof dateValue.toDate === 'function') {
            const date = dateValue.toDate(); // Já é Date local
            day = date.getDate();
            month = date.getMonth() + 1;
            year = date.getFullYear();
        }
        // Se for objeto Date
        // IMPORTANTE: Usar métodos locais (getDate, getMonth, getFullYear) que retornam valores locais
        // Não usar getUTCDate, getUTCMonth, getUTCFullYear para evitar problemas de timezone
        else if (dateValue instanceof Date) {
            day = dateValue.getDate(); // Método local, não UTC
            month = dateValue.getMonth() + 1; // Método local, não UTC
            year = dateValue.getFullYear(); // Método local, não UTC
        }
        // Se for string ISO (YYYY-MM-DD) - PARSEAR MANUALMENTE
        else if (typeof dateValue === 'string') {
            const trimmed = dateValue.trim();
            
            // Formato ISO: YYYY-MM-DD (com ou sem hora) - PARSEAR MANUALMENTE (NUNCA new Date())
            // Aceita YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss ou YYYY-MM-DD HH:mm:ss
            const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
            if (isoMatch) {
                year = parseInt(isoMatch[1], 10);
                month = parseInt(isoMatch[2], 10);
                day = parseInt(isoMatch[3], 10);
            }
            // Formato brasileiro: DD/MM/YYYY
            else if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(trimmed)) {
                const parts = trimmed.split(/[\/\-\.]/);
                if (parts.length === 3) {
                    day = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10);
                    year = parseInt(parts[2], 10);
                } else {
                    return dateValue;
                }
            }
            // Formato reverso: YYYY/MM/DD ou YYYY-MM-DD (já tratado acima, mas mantido para compatibilidade)
            else if (/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/.test(trimmed)) {
                const parts = trimmed.split(/[\/\-\.]/);
                if (parts.length === 3) {
                    year = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10);
                    day = parseInt(parts[2], 10);
                } else {
                    return dateValue;
                }
            }
            // Outro formato - tentar como último recurso (evitar new Date() para strings ISO)
            else {
                // Se parecer ser uma data ISO mas não passou no teste anterior, tentar parse manual
                const fallbackMatch = trimmed.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
                if (fallbackMatch) {
                    year = parseInt(fallbackMatch[1], 10);
                    month = parseInt(fallbackMatch[2], 10);
                    day = parseInt(fallbackMatch[3], 10);
                } else {
                    // Último recurso - usar new Date() apenas se não for formato ISO
                    // ATENÇÃO: Isso pode causar problemas de timezone, mas é necessário para formatos desconhecidos
                    const date = new Date(trimmed);
                    if (!isNaN(date.getTime())) {
                        // Usar métodos locais para evitar timezone
                        day = date.getDate();
                        month = date.getMonth() + 1;
                        year = date.getFullYear();
                    } else {
                        return dateValue; // Retornar original se não conseguir parsear
                    }
                }
            }
        }
        // Outro tipo - tentar converter
        else {
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
                day = date.getDate();
                month = date.getMonth() + 1;
                year = date.getFullYear();
            } else {
                return String(dateValue);
            }
        }

        // Validar valores
        if (!day || !month || !year) {
            return String(dateValue);
        }

        // Formatar para DD/MM/YYYY sem aplicar timezone
        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(month).padStart(2, '0');
        const yearStr = String(year);

        return `${dayStr}/${monthStr}/${yearStr}`;
    } catch (e) {
        console.warn('Erro ao formatar data:', dateValue, e);
        return String(dateValue || 'N/A');
    }
}

/**
 * Copiar texto para clipboard
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return { success: true };
    } catch (err) {
        // Fallback para navegadores antigos
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return { success: true };
        } catch (e) {
            document.body.removeChild(textArea);
            return { success: false, error: e.message };
        }
    }
}

/**
 * Formatador de número (adiciona separadores)
 */
export function formatNumber(num) {
    return new Intl.NumberFormat('pt-BR').format(num);
}

/**
 * Validar email
 */
export function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Formatar URL de incidência
 */
export function formatIncidenciaUrl(incidencia) {
    if (!incidencia) return null;
    
    // Remove espaços e caracteres especiais
    const cleaned = String(incidencia).trim();
    return `http://sdeice.enelint.global/SAC_Detalhe_Inci.asp?inci_ref=${cleaned}`;
}

/**
 * Obter colunas não fixas (todas exceto as obrigatórias)
 */
export function getNonFixedColumns(headers) {
    const fixedColumns = ['INCIDENCIA', 'CAUSA', 'ALIMENT.', 'DATA', 'ELEMENTO', 'CONJUNTO'];
    const normalizedFixed = fixedColumns.map(c => c.toUpperCase().replace(/\s+/g, ' '));
    
    return headers.filter(header => {
        const normalized = header.toUpperCase().replace(/\s+/g, ' ');
        return !normalizedFixed.includes(normalized);
    });
}

