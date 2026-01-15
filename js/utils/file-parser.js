/**
 * Parser de Arquivos - CSV, XLS, XLSX, XLSB
 */

/**
 * Colunas obrigatórias que devem estar presentes
 */
const REQUIRED_COLUMNS = ['INCIDENCIA', 'CAUSA', 'ALIMENT.', 'DATA', 'ELEMENTO', 'CONJUNTO'];

/**
 * Normalizar nome da coluna (remove espaços, acentos, etc.)
 */
function normalizeColumnName(name) {
    return name.trim().toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\./g, '');
}

/**
 * Validar estrutura do arquivo
 * Note: headers já devem estar normalizados
 */
function validateStructure(headers) {
    // Normalizar as colunas obrigatórias para comparar com headers normalizados
    const normalizedRequiredColumns = REQUIRED_COLUMNS.map(col => normalizeColumnName(col));
    
    // Verificar quais colunas estão faltando
    const missingNormalizedColumns = normalizedRequiredColumns.filter(normalizedCol => 
        !headers.includes(normalizedCol)
    );
    
    if (missingNormalizedColumns.length > 0) {
        // Mapear de volta para nomes originais para mensagem de erro
        const missingOriginalColumns = missingNormalizedColumns.map(normalizedCol => {
            // Tentar encontrar o nome original na lista REQUIRED_COLUMNS
            const original = REQUIRED_COLUMNS.find(col => normalizeColumnName(col) === normalizedCol);
            return original || normalizedCol;
        });
        
        return {
            valid: false,
            error: `Colunas obrigatórias faltando: ${missingOriginalColumns.join(', ')}`
        };
    }

    return { valid: true };
}

/**
 * Normalizar dados da linha
 */
function normalizeRow(row, headers) {
    const normalized = {};
    
    headers.forEach((header, index) => {
        const normalizedHeader = normalizeColumnName(header);
        let value = row[index];
        
        // Tratamento especial para DATA
        if (normalizedHeader === 'DATA') {
            value = parseDate(value);
        } else if (value !== null && value !== undefined) {
            value = String(value).trim();
        } else {
            value = '';
        }
        
        normalized[normalizedHeader] = value;
    });

    return normalized;
}

/**
 * Converter data para formato padrão ISO (YYYY-MM-DD)
 * Suporta múltiplos formatos: Excel serial, Date object, strings diversas
 */
function parseDate(value) {
    if (!value) return null;

    // Se já for uma string no formato correto (ISO)
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    let date = null;

    try {
        // Se for objeto Date
        if (value instanceof Date) {
            date = value;
        }
        // Se for número (Excel serial date)
        else if (typeof value === 'number') {
            // Excel serial date (dias desde 1900-01-01)
            date = new Date((value - 25569) * 86400 * 1000);
        }
        // Se for string, tentar múltiplos formatos
        else if (typeof value === 'string') {
            const trimmed = value.trim();
            
            // Formato ISO: YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
                date = new Date(trimmed);
            }
            // Formato brasileiro: DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
            else if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(trimmed)) {
                const parts = trimmed.split(/[\/\-\.]/);
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1; // Month é 0-indexed
                    const year = parseInt(parts[2], 10);
                    date = new Date(year, month, day);
                }
            }
            // Formato reverso: YYYY/MM/DD
            else if (/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/.test(trimmed)) {
                const parts = trimmed.split(/[\/\-\.]/);
                if (parts.length === 3) {
                    const year = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const day = parseInt(parts[2], 10);
                    date = new Date(year, month, day);
                }
            }
            // Tentar parse padrão do JavaScript
            else {
                date = new Date(trimmed);
            }
        }
        // Se for Timestamp do Firestore
        else if (value && typeof value.toDate === 'function') {
            date = value.toDate();
        }
        // Última tentativa: new Date()
        else {
            date = new Date(value);
        }

        // Validar se a data é válida
        if (!date || isNaN(date.getTime())) {
            console.warn('Data inválida:', value);
            return null;
        }

        // Converter para formato ISO (YYYY-MM-DD)
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    } catch (e) {
        console.warn('Erro ao parsear data:', value, e);
        return null;
    }
}

/**
 * Processar arquivo CSV
 */
export async function parseCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n').map(line => line.trim()).filter(line => line);
                
                if (lines.length < 2) {
                    reject(new Error('Arquivo CSV muito pequeno ou vazio'));
                    return;
                }

                // Parsear header
                const headers = lines[0].split(',').map(h => normalizeColumnName(h));
                const validation = validateStructure(headers);

                if (!validation.valid) {
                    reject(new Error(validation.error));
                    return;
                }

                // Processar linhas
                const data = [];
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                    const row = normalizeRow(values, lines[0].split(','));
                    if (row.ELEMENTO && row.INCIDENCIA) {
                        data.push(row);
                    }
                }

                resolve({
                    data,
                    headers: lines[0].split(',').map(h => h.trim()),
                    totalRows: data.length
                });
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Erro ao ler arquivo CSV'));
        reader.readAsText(file, 'UTF-8');
    });
}

/**
 * Processar arquivo Excel (XLS, XLSX, XLSB)
 */
export async function parseExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const arrayBuffer = new Uint8Array(e.target.result);
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                // Pegar primeira planilha
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Converter para JSON
                // raw: true para capturar números (datas serial do Excel)
                // Depois converteremos usando parseDate
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });

                if (jsonData.length < 2) {
                    reject(new Error('Planilha muito pequena ou vazia'));
                    return;
                }

                // Headers (primeira linha)
                const originalHeaders = jsonData[0].map(h => String(h || '').trim());
                const headers = originalHeaders.map(h => normalizeColumnName(h));

                // Validar estrutura
                const validation = validateStructure(headers);
                if (!validation.valid) {
                    reject(new Error(validation.error));
                    return;
                }

                // Processar linhas
                const data = [];
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    const normalizedRow = normalizeRow(row, originalHeaders);
                    if (normalizedRow.ELEMENTO && normalizedRow.INCIDENCIA) {
                        data.push(normalizedRow);
                    }
                }

                resolve({
                    data,
                    headers: originalHeaders,
                    totalRows: data.length
                });
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Erro ao ler arquivo Excel'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Processar arquivo (detecta tipo automaticamente)
 */
export async function parseFile(file) {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
        return await parseCSV(file);
    } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx') || fileName.endsWith('.xlsb')) {
        return await parseExcel(file);
    } else {
        throw new Error('Formato de arquivo não suportado');
    }
}
