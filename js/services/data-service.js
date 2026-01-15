/**
 * Serviço de Dados - Lógica de negócio para rankings e análises
 */

import { DataService } from './firebase-service.js';

/**
 * Gerar ranking por ELEMENTO
 */
export function generateRankingElemento(data) {
    const elementos = {};
    
    data.forEach(item => {
        const elemento = item.ELEMENTO || item['ELEMENTO'] || '';
        if (elemento) {
            if (!elementos[elemento]) {
                elementos[elemento] = [];
            }
            elementos[elemento].push(item);
        }
    });

    // Filtrar apenas elementos com mais de uma ocorrência e ordenar
    const ranking = Object.entries(elementos)
        .filter(([_, ocorrencias]) => ocorrencias.length > 1)
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
 */
export function generateRankingCausa(data) {
    const causas = {};
    
    data.forEach(item => {
        const causa = item.CAUSA || item['CAUSA'] || 'Não especificado';
        causas[causa] = (causas[causa] || 0) + 1;
    });

    const ranking = Object.entries(causas)
        .map(([causa, count]) => ({ causa, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10

    return ranking;
}

/**
 * Gerar ranking por ALIMENTADOR
 */
export function generateRankingAlimentador(data) {
    const alimentadores = {};
    
    data.forEach(item => {
        // Tentar várias variações possíveis da chave (com ponto, sem ponto, normalizado)
        const alimentador = item['ALIMENT.'] || item.ALIMENTADOR || item['ALIMENT'] || item.ALIMENT || 'Não especificado';
        alimentadores[alimentador] = (alimentadores[alimentador] || 0) + 1;
    });

    const ranking = Object.entries(alimentadores)
        .map(([alimentador, count]) => ({ alimentador, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10

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

        // Se for Timestamp do Firestore, converter
        if (itemDate && typeof itemDate.toDate === 'function') {
            const date = itemDate.toDate();
            itemDate = date.toISOString().split('T')[0];
        }
        // Se for Date object, converter
        else if (itemDate instanceof Date) {
            itemDate = itemDate.toISOString().split('T')[0];
        }
        // Se for string, garantir formato ISO
        else if (typeof itemDate === 'string') {
            // Se já estiver no formato ISO, usar direto
            if (!/^\d{4}-\d{2}-\d{2}$/.test(itemDate)) {
                // Tentar converter
                const parsed = new Date(itemDate);
                if (!isNaN(parsed.getTime())) {
                    itemDate = parsed.toISOString().split('T')[0];
                } else {
                    return false;
                }
            }
        }

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
