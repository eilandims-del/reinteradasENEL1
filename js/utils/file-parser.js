/**
 * Parser de Arquivos - CSV, XLS, XLSX, XLSB
 */

/**
 * Colunas obrigatórias que devem estar presentes
 */
// ✅ REITERADAS
const REQUIRED_COLUMNS_REITERADAS = ['INCIDENCIA', 'CAUSA', 'ALIMENT.', 'DATA', 'CONJUNTO'];

// ✅ CLIENTES
const REQUIRED_COLUMNS_CLIENTES = [
  'INCIDENCIA',
  'Nº CLIENTE',
  'NOME CLIENTE',
  'MUNICIPIO',
  'CAUSA',
  'CHI',
  'AFET.',
  'DATA AVISO'
];


/**
 * Normalizar nome da coluna (remove espaços, acentos, etc.)
 */
function normalizeColumnName(name) {
  const base = name.trim().toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '');

  return canonicalizeHeader(base);
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();
}

function canonicalizeHeader(normalizedHeader) {
  const h = String(normalizedHeader || '').trim().toUpperCase();

  // Nº / N° / NO / NUM -> NUM_CLIENTE
  if (
    h === 'Nº CLIENTE' || h === 'N° CLIENTE' || h === 'NO CLIENTE' ||
    h === 'NUM CLIENTE' || h === 'NUM_CLIENTE' || h === 'N CLIENTE'
  ) return 'NUM_CLIENTE';

  // padroniza AFET.
  if (h === 'AFET' || h === 'AFET.' || h === 'AFETADOS') return 'AFET.';

  // padroniza DATA AVISO
  if (h === 'DATAAVISO' || h === 'DATA AVISO' || h === 'DT AVISO') return 'DATA AVISO';

  return h;
}

function hasColumn(headers, candidates = []) {
  const set = new Set((headers || []).map(normalizeHeader));
  return candidates.some(c => set.has(normalizeHeader(c)));
}

function hasClientesColumn(headers = []) {
  // CLI. AFE / CLI AFE / CLI. AFET / CLIAFE / CLIAFET
  return hasColumn(headers, ['CLI. AFE', 'CLI AFE', 'CLI. AFET', 'CLIAFE', 'CLIAFET']);
}

/**
 * Validar estrutura do arquivo
 * Note: headers já devem estar normalizados
 */
function validateStructure(headers, options = {}) {
  const dataset = String(options.dataset || 'REITERADAS').toUpperCase();

  // =========================
  // ✅ REITERADAS
  // =========================
  if (dataset === 'REITERADAS') {
    const required = REQUIRED_COLUMNS_REITERADAS.map(col => normalizeColumnName(col));

    // ✅ precisa ter ELEMENTO OU ELEMENTOS
    const hasElemento = headers.includes('ELEMENTO') || headers.includes('ELEMENTOS');

    const missing = required.filter(req => !headers.includes(req));

    if (missing.length > 0 || !hasElemento) {
      const faltando = [];

      missing.forEach(norm => {
        const original = REQUIRED_COLUMNS_REITERADAS.find(col => normalizeColumnName(col) === norm);
        faltando.push(original || norm);
      });

      if (!hasElemento) faltando.push('ELEMENTO (ou ELEMENTOS)');

      return { valid: false, error: `Colunas obrigatórias faltando: ${faltando.join(', ')}` };
    }

    return { valid: true };
  }

  // =========================
  // ✅ CLIENTES
  // =========================
  if (dataset === 'CLIENTES') {
    const required = REQUIRED_COLUMNS_CLIENTES.map(col => normalizeColumnName(col));
    const missing = required.filter(req => !headers.includes(req));
  
    if (missing.length > 0) {
      const faltando = missing.map(m => m);
      return { valid: false, error: `Colunas obrigatórias faltando (CLIENTES): ${faltando.join(', ')}` };
    }
    return { valid: true };
  }

  // fallback
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
        if (normalizedHeader === 'DATA' || normalizedHeader === 'DATA AVISO') {
          value = parseDate(value);
        } else if (value !== null && value !== undefined) {
            value = String(value).trim();
        } else {
            value = '';
        }
        
        normalized[normalizedHeader] = value;
    });
  // ✅ compatibilidade: se vier ELEMENTOS, copia para ELEMENTO
  if (!normalized.ELEMENTO && normalized.ELEMENTOS) {
    normalized.ELEMENTO = normalized.ELEMENTOS;
  }
  
    return normalized;
}

/**
 * Converter data para formato padrão ISO (YYYY-MM-DD)
 * IMPORTANTE: Esta função NUNCA usa new Date() com strings YYYY-MM-DD
 * para evitar conversões automáticas de timezone que causam deslocamento de dia.
 * 
 * Suporta múltiplos formatos: Excel serial, Date object, strings diversas
 * Retorna sempre string ISO (YYYY-MM-DD) sem aplicar timezone
 */
function parseDate(value) {
    if (!value) return null;

    // Se já for uma string no formato correto (ISO), retornar direto
    // NUNCA passar para new Date() pois interpreta como UTC
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return value.trim();
    }

    try {
        let year, month, day;

        // Se for número (Excel serial date)
        if (typeof value === 'number') {
            // Excel serial date: dias desde 1900-01-01
            // Converter manualmente sem usar Date para evitar timezone
            const excelEpoch = new Date(1900, 0, 1); // 1 de janeiro de 1900 (local)
            const days = value - 2; // Excel considera 1900 como ano bissexto (bug do Excel)
            const milliseconds = days * 86400 * 1000;
            const date = new Date(excelEpoch.getTime() + milliseconds);
            
            // Usar métodos locais para evitar timezone
            year = date.getFullYear();
            month = date.getMonth() + 1; // getMonth() retorna 0-11
            day = date.getDate();
        }
        // Se for string, parsear manualmente
        else if (typeof value === 'string') {
            const trimmed = value.trim();
            
            // Formato ISO: YYYY-MM-DD - PARSEAR MANUALMENTE (NUNCA usar new Date())
            if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
                const parts = trimmed.split('-');
                if (parts.length >= 3) {
                    year = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10);
                    day = parseInt(parts[2], 10);
                }
            }
            // Formato brasileiro: DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
            else if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(trimmed)) {
                const parts = trimmed.split(/[\/\-\.]/);
                if (parts.length === 3) {
                    day = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10);
                    year = parseInt(parts[2], 10);
                }
            }
            // Formato reverso: YYYY/MM/DD ou YYYY-MM-DD
            else if (/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/.test(trimmed)) {
                const parts = trimmed.split(/[\/\-\.]/);
                if (parts.length === 3) {
                    year = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10);
                    day = parseInt(parts[2], 10);
                }
            }
            // Tentar parse padrão do JavaScript como último recurso
            else {
                const date = new Date(trimmed);
                if (!isNaN(date.getTime())) {
                    year = date.getFullYear();
                    month = date.getMonth() + 1;
                    day = date.getDate();
                } else {
                    console.warn('Data inválida (formato não reconhecido):', value);
                    return null;
                }
            }
        }
        // Se for objeto Date
        else if (value instanceof Date) {
            // Usar métodos locais (getFullYear, getMonth, getDate) que retornam valores locais
            year = value.getFullYear();
            month = value.getMonth() + 1;
            day = value.getDate();
        }
        // Se for Timestamp do Firestore
        else if (value && typeof value.toDate === 'function') {
            const date = value.toDate(); // Converte para Date local
            year = date.getFullYear();
            month = date.getMonth() + 1;
            day = date.getDate();
        }
        // Última tentativa
        else {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                year = date.getFullYear();
                month = date.getMonth() + 1;
                day = date.getDate();
            } else {
                console.warn('Data inválida:', value);
                return null;
            }
        }

        // Validar valores parseados
        if (!year || !month || !day) {
            console.warn('Data inválida (valores não encontrados):', value);
            return null;
        }

        if (month < 1 || month > 12 || day < 1 || day > 31) {
            console.warn('Data inválida (valores fora do range):', value, {year, month, day});
            return null;
        }

        // Montar string ISO sem aplicar timezone
        const yearStr = String(year).padStart(4, '0');
        const monthStr = String(month).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');

        return `${yearStr}-${monthStr}-${dayStr}`;
    } catch (e) {
        console.warn('Erro ao parsear data:', value, e);
        return null;
    }
}

/**
 * Processar arquivo CSV
 */
export async function parseCSV(file, options = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
  
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line);
  
          if (lines.length < 2) {
            reject(new Error('Arquivo CSV muito pequeno ou vazio'));
            return;
          }
  
          const originalHeaders = lines[0].split(',').map(h => h.trim());
          const headersNormalized = originalHeaders.map(h => normalizeColumnName(h));
  
          const validation = validateStructure(headersNormalized, options);
          if (!validation.valid) {
            reject(new Error(validation.error));
            return;
          }
  
          const data = [];
          const dataset = String(options.dataset || 'REITERADAS').toUpperCase();
  
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i]
              .split(',')
              .map(v => v.trim().replace(/^"|"$/g, ''));
  
            const normalizedRow = normalizeRow(values, originalHeaders);
  
            if (dataset === 'CLIENTES') {
              // agora o mínimo é ter NUM_CLIENTE e INCIDENCIA
              if (normalizedRow.NUM_CLIENTE && normalizedRow.INCIDENCIA) data.push(normalizedRow);
            } else {
              if (normalizedRow.ELEMENTO && normalizedRow.INCIDENCIA) data.push(normalizedRow);
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
  
      reader.onerror = () => reject(new Error('Erro ao ler arquivo CSV'));
      reader.readAsText(file, 'UTF-8');
    });
  }

/**
 * Processar arquivo Excel (XLS, XLSX, XLSB)
 */
export async function parseExcel(file, options = {}) {
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
                const validation = validateStructure(headers, options);
                if (!validation.valid) {
                    reject(new Error(validation.error));
                    return;
                }

                // Processar linhas
                const data = [];
                const dataset = String(options.dataset || 'REITERADAS').toUpperCase();

                for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                const normalizedRow = normalizeRow(row, originalHeaders);

                if (dataset === 'CLIENTES') {
                  // mínimo: ter NUM_CLIENTE e INCIDENCIA
                  if (normalizedRow.NUM_CLIENTE && normalizedRow.INCIDENCIA) data.push(normalizedRow);
                } else {
                  if (normalizedRow.ELEMENTO && normalizedRow.INCIDENCIA) data.push(normalizedRow);
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
export async function parseFile(file, options = {}) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv')) {
    return await parseCSV(file, options);
  } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx') || fileName.endsWith('.xlsb')) {
    return await parseExcel(file, options);
  } else {
    throw new Error('Formato de arquivo não suportado');
  }
}
