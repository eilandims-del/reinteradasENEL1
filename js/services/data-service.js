/**
 * Serviço de Dados - Lógica de negócio para rankings e análises
 */

import { DataService } from './firebase-service.js';

/**
 * Gerar ranking por ELEMENTO
 */
export function generateRankingElemento(data) {
    const elementos = {};
  
    const getCliAfet = (item) => {
      if (!item) return 0;
  
      // tenta várias chaves possíveis
      const raw =
        item['CLI AFET'] ??
        item['CLI_AFET'] ??
        item['CLI_AFET.'] ??
        item['CLIAFET'] ??
        item['CLI'] ??
        item['CLI_AFETADO'] ??
        item['CLI AFETADO'];
  
      const n = parseInt(String(raw ?? '').replace(/[^\d\-]/g, ''), 10);
      return Number.isFinite(n) ? n : 0;
    };
  
    data.forEach(item => {
      const elemento = item.ELEMENTO || item['ELEMENTO'] || '';
      if (!elemento) return;
  
      if (!elementos[elemento]) elementos[elemento] = [];
      elementos[elemento].push(item);
    });
  
    const ranking = Object.entries(elementos)
      // só elementos com repetição (>=2)
      .filter(([_, ocorrencias]) => ocorrencias.length > 1)
      // regra: se começa com T, precisa ter algum CLI AFET >= 3
      .filter(([elemento, ocorrencias]) => {
        const el = String(elemento).trim().toUpperCase();
        if (!el.startsWith('T')) return true;
  
        // entra se QUALQUER ocorrência tiver CLI AFET >= 3
        return ocorrencias.some(o => getCliAfet(o) >= 3);
      })
      .map(([elemento, ocorrencias]) => ({
        elemento,
        count: ocorrencias.length,
        ocorrencias
      }))
      .sort((a, b) => b.count - a.count);
  
    return ranking;
  }
  

/**
 * Gerar ranking por CAUSA
 * Ajustes:
 * - remove causas desnecessárias
 * - limita top 10
 */
export function generateRankingCausa(data) {
    const causas = {};

    const bloqueadas = new Set([
        'DEFEITO EM CONEXAO RAMAL CONCENTRICO',
        'DEFEITO EM CONEXAO',
        'DEFEITO EM RAMAL DE LIGAÇÃO',
        'DEFEITO EM RAMAL DE LIGACAO',
        'DEFEITO EM CONEXAO DE MEDIDOR',
    ].map(x => x.trim().toUpperCase()));

    const CHUNK_SIZE = 1000;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        chunk.forEach(item => {
            const causaRaw = item.CAUSA || item['CAUSA'] || 'Não especificado';
            const causaNorm = String(causaRaw).trim().toUpperCase();

            if (bloqueadas.has(causaNorm)) return;

            causas[causaRaw] = (causas[causaRaw] || 0) + 1;
        });
    }

    return Object.entries(causas)
        .map(([causa, count]) => ({ causa, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10
}

/**
 * Gerar ranking por ALIMENTADOR
 * OTIMIZADO: Limita a top 20 e processa em chunks para melhor performance
 */
export function generateRankingAlimentador(data) {
    const alimentadores = {};
    
    // Otimização: processar em chunks para não travar com 10k+ registros
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        chunk.forEach(item => {
            // Tentar várias variações possíveis da chave (com ponto, sem ponto, normalizado)
            const alimentador = item['ALIMENT.'] || item.ALIMENTADOR || item['ALIMENT'] || item.ALIMENT || 'Não especificado';
            alimentadores[alimentador] = (alimentadores[alimentador] || 0) + 1;
        });
    }

    const ranking = Object.entries(alimentadores)
        .map(([alimentador, count]) => ({ alimentador, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20); // Top 20 (aumentado de 10 para melhor visualização)

    return ranking;
}

/**
 * Gerar dados para mapa de calor (baseado em CONJUNTO)
 */
export function generateHeatmapData(data) {
    const conjuntos = {};
    
    data.forEach(item => {
        const conjunto = item.CONJUNTO || item['CONJUNTO'] || '';
        if (conjunto) {
            conjuntos[conjunto] = (conjuntos[conjunto] || 0) + 1;
        }
    });

    // Coordenadas dos principais municípios do Ceará
    // Mapeamento de CONJUNTO para coordenadas geográficas
    const coordenadasConjuntos = {
        'FORTALEZA': [-3.7172, -38.5433],
        'MARACANAÚ': [-3.8770, -38.6256],
        'CAUCAIA': [-3.7361, -38.6533],
        'JUAZEIRO DO NORTE': [-7.2133, -39.3153],
        'SOBRAL': [-3.6856, -40.3442],
        'CRATO': [-7.2337, -39.4097],
        'ITAPIPOCA': [-3.4944, -39.5786],
        'MARANGUAPE': [-3.8906, -38.6853],
        'QUIXADÁ': [-4.9681, -39.0153],
        'IGUATU': [-6.3614, -39.2978],
        'PACATUBA': [-3.9808, -38.6181],
        'AQUIRAZ': [-3.9017, -38.3914],
        'PARACURU': [-3.4106, -39.0317],
        'HORIZONTE': [-4.0917, -38.4956],
        'EUSÉBIO': [-3.8936, -38.4508],
        'CANINDÉ': [-4.3597, -39.3117],
        'TIANGUÁ': [-3.7322, -40.9917],
        'CRATEÚS': [-5.1756, -40.6764],
        'BARBALHA': [-7.3056, -39.3036],
        'ARACATI': [-4.5606, -37.7717],
        'ARARAS I': [-4.2096, -40.4498],
        'QUIXADÁ': [-4.9716, -39.0161],
        'CRATEÚS': [-5.1986, -40.6689],
        'IPU': [-4.3256, -40.7109],
        'INDEPENDÊNCIA': [-5.3964, -40.3086],
        'NOVA RUSSAS': [-4.7044, -40.5669],
        'BANABUIÚ': [-5.3140, -38.9230],
        'SANTA QUITÉRIA': [-4.3319, -40.1570],
        'MONSENHOR TABOSA': [-4.7861, -40.0606],
        'MACAOCA': [-4.7626, -39.4837],
        'BOA VIAGEM': [-5.1310, -39.7336],
        'ARARENDA': [-4.7525, -40.8330],
        'QUIXERAMOBIM': [-5.0939, -39.3619],
        'CANINDÉ': [-4.3579, -39.3020],
        'INHUPORANGA': [-4.0908, -39.0585],
        // Adicione mais conforme necessário
    };

    const heatmapPoints = [];
    
    Object.entries(conjuntos).forEach(([conjunto, count]) => {
        const coords = coordenadasConjuntos[conjunto.toUpperCase()];
        if (coords) {
            heatmapPoints.push({
                lat: coords[0],
                lng: coords[1],
                intensity: count
            });
        }
    });

    return heatmapPoints;
}

/**
 * Filtrar dados por período
 * Compara strings ISO (YYYY-MM-DD) diretamente para maior precisão
 */
export function filterByDateRange(data, dataInicial, dataFinal) {
    if (!dataInicial && !dataFinal) {
        return data;
    }

    // Normalizar datas iniciais e finais para formato ISO
    const inicioISO = dataInicial ? dataInicial.split('T')[0] : null;
    const fimISO = dataFinal ? dataFinal.split('T')[0] : null;

    return data.filter(item => {
        let itemDate = item.DATA || item['DATA'] || item.DATA_ISO;
        
        if (!itemDate) {
            return false;
        }

        let dateISO = null;

        // Se for Timestamp do Firestore, converter usando métodos locais
        if (itemDate && typeof itemDate.toDate === 'function') {
            const date = itemDate.toDate();
            // Usar métodos locais para evitar timezone
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            dateISO = `${year}-${month}-${day}`;
        }
        // Se for Date object, converter usando métodos locais
        else if (itemDate instanceof Date) {
            const year = itemDate.getFullYear();
            const month = String(itemDate.getMonth() + 1).padStart(2, '0');
            const day = String(itemDate.getDate()).padStart(2, '0');
            dateISO = `${year}-${month}-${day}`;
        }
        // Se for string, garantir formato ISO sem usar new Date()
        else if (typeof itemDate === 'string') {
            const trimmed = itemDate.trim();
            // Se já estiver no formato ISO, usar direto (NUNCA new Date())
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                dateISO = trimmed;
            }
            // Se for formato brasileiro, parsear manualmente
            else if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(trimmed)) {
                const parts = trimmed.split(/[\/\-\.]/);
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10);
                    const year = parseInt(parts[2], 10);
                    dateISO = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                } else {
                    return false;
                }
            }
            // Formato reverso: YYYY/MM/DD
            else if (/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/.test(trimmed)) {
                const parts = trimmed.split(/[\/\-\.]/);
                if (parts.length === 3) {
                    const year = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10);
                    const day = parseInt(parts[2], 10);
                    dateISO = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                } else {
                    return false;
                }
            }
            // Outro formato - tentar como último recurso
            else {
                const parsed = new Date(trimmed);
                if (!isNaN(parsed.getTime())) {
                    const year = parsed.getFullYear();
                    const month = String(parsed.getMonth() + 1).padStart(2, '0');
                    const day = String(parsed.getDate()).padStart(2, '0');
                    dateISO = `${year}-${month}-${day}`;
                } else {
                    return false;
                }
            }
        }
        
        if (!dateISO) {
            return false;
        }
        
        itemDate = dateISO;

        // Comparação de strings ISO (YYYY-MM-DD) funciona diretamente
        if (inicioISO && itemDate < inicioISO) {
            return false;
        }
        if (fimISO && itemDate > fimISO) {
            return false;
        }

        return true;
    });
}

/**
 * Obter todas as colunas disponíveis nos dados
 */
export function getAllColumns(data) {
    const columns = new Set();
    
    data.forEach(item => {
        Object.keys(item).forEach(key => {
            columns.add(key);
        });
    });

    return Array.from(columns);
}

/**
 * Obter ocorrências de um elemento específico
 */
export function getOcorrenciasByElemento(data, elemento) {
    return data.filter(item => {
        const itemElemento = item.ELEMENTO || item['ELEMENTO'] || '';
        return itemElemento === elemento;
    });
}
