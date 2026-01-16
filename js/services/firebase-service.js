/**
 * Serviços Firebase - Autenticação e Firestore
 */

import { auth, db } from '../firebase-config.js';

/**
 * Serviço de Autenticação
 */
export class AuthService {
    /**
     * Fazer login com email e senha
     */
    static async login(email, senha) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, senha);
            return {
                success: true,
                user: userCredential.user
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Fazer logout
     */
    static async logout() {
        try {
            await auth.signOut();
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Verificar se usuário está autenticado
     */
    static getCurrentUser() {
        return auth.currentUser;
    }

    /**
     * Observar mudanças no estado de autenticação
     */
    static onAuthStateChanged(callback) {
        return auth.onAuthStateChanged(callback);
    }
}

/**
 * Serviço de Dados - Firestore
 */
export class DataService {
    static COLLECTION_NAME = 'reinteradas';
    static UPLOADS_COLLECTION = 'uploads';

    /**
     * Salvar dados processados no Firestore
     * CORRIGIDO: Implementa batching seguro, throttling, retry com backoff e idempotência
     */
    static async saveData(data, metadata = {}, progressCallback = null) {
        try {
            const timestamp = firebase.firestore.FieldValue.serverTimestamp();
            const uploadId = metadata.uploadId;
            
            if (!uploadId) {
                throw new Error('uploadId é obrigatório para garantir idempotência');
            }

            // Configurações de batching seguro (evitar quota exceeded)
            // OTIMIZADO para volumes grandes (10k+): batch menor + throttling maior
            const BATCH_SIZE = 200; // Reduzido de 250 para 200 (margem maior de segurança)
            const THROTTLE_MS = 1000; // Aumentado de 500ms para 1000ms (1 segundo entre batches)
            const MAX_RETRIES = 8; // Aumentado de 5 para 8 tentativas
            const INITIAL_BACKOFF_MS = 2000; // Aumentado de 1s para 2s (backoff mais conservador)
            
            let totalSaved = 0;
            const totalBatches = Math.ceil(data.length / BATCH_SIZE);
            
            console.log(`[UPLOAD] Iniciando upload de ${data.length} registros em ${totalBatches} batches`);

            // Processar em batches com throttling
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const startIndex = batchIndex * BATCH_SIZE;
                const endIndex = Math.min(startIndex + BATCH_SIZE, data.length);
                const batchData = data.slice(startIndex, endIndex);
                
                let retryCount = 0;
                let batchSuccess = false;
                
                // Retry com exponential backoff
                while (retryCount < MAX_RETRIES && !batchSuccess) {
                    try {
                        const batch = db.batch();
                        
                        // Adicionar documentos ao batch com ID determinístico (idempotência)
                        batchData.forEach((item, index) => {
                            const rowIndex = startIndex + index;
                            // ID determinístico: uploadId_rowIndex garante idempotência
                            const docId = `${uploadId}_${rowIndex}`;
                            const docRef = db.collection(this.COLLECTION_NAME).doc(docId);
                            
                            const itemData = {
                                ...item,
                                createdAt: timestamp,
                                uploadId: uploadId,
                                rowIndex: rowIndex // Para rastreamento
                            };
                            
                            // Usar set com merge para idempotência (não duplica se reimportar)
                            batch.set(docRef, itemData, { merge: true });
                        });
                        
                        // Commit do batch
                        await batch.commit();
                        totalSaved += batchData.length;
                        batchSuccess = true;
                        
                        const progress = Math.round((totalSaved / data.length) * 100);
                        console.log(`[UPLOAD] Batch ${batchIndex + 1}/${totalBatches} commitado: ${batchData.length} registros (${totalSaved}/${data.length} - ${progress}%)`);
                        
                        if (progressCallback) {
                            progressCallback({
                                batch: batchIndex + 1,
                                totalBatches: totalBatches,
                                saved: totalSaved,
                                total: data.length,
                                progress: progress
                            });
                        }
                        
                    } catch (error) {
                        retryCount++;
                        const errorCode = error.code || error.message;
                        
                        // Verificar se é erro transitório (retry) ou permanente (fail)
                        const isTransientError = 
                            errorCode === 'resource-exhausted' ||
                            errorCode === 'unavailable' ||
                            errorCode === 'deadline-exceeded' ||
                            error.message?.includes('Quota exceeded') ||
                            error.message?.includes('maximum backoff');
                        
                        if (isTransientError && retryCount < MAX_RETRIES) {
                            // Exponential backoff com jitter (mais conservador para quota exceeded)
                            const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount - 1);
                            const jitter = Math.random() * 1000; // Aumentado de 500ms para 1000ms de jitter
                            const delay = Math.min(backoffMs + jitter, 60000); // Limite máximo de 60s
                            
                            const delaySeconds = Math.round(delay / 1000);
                            console.warn(
                                `[UPLOAD] Erro transitório no batch ${batchIndex + 1} (tentativa ${retryCount}/${MAX_RETRIES}):`,
                                errorCode,
                                `Aguardando ${delaySeconds}s antes do próximo retry...`
                            );
                            
                            // Atualizar UI durante retry
                            if (progressCallback) {
                                progressCallback({
                                    batch: batchIndex + 1,
                                    totalBatches: totalBatches,
                                    saved: totalSaved,
                                    total: data.length,
                                    progress: Math.round((totalSaved / data.length) * 100),
                                    retrying: true,
                                    retryCount: retryCount,
                                    nextRetryIn: delaySeconds
                                });
                            }
                            
                            await this.sleep(delay);
                        } else {
                            // Erro permanente ou esgotou retries
                            console.error(`[UPLOAD] Erro ao salvar batch ${batchIndex + 1}:`, error);
                            throw error;
                        }
                    }
                }
                
                // Throttling entre batches (exceto no último)
                // Throttling progressivo: aumenta delay conforme o número de batches processados
                if (batchIndex < totalBatches - 1) {
                    // Throttling progressivo: batches iniciais mais rápidos, depois mais lentos
                    const progressiveThrottle = batchIndex < 3 
                        ? THROTTLE_MS 
                        : THROTTLE_MS * 1.5; // Aumenta 50% após 3 batches
                    await this.sleep(progressiveThrottle);
                }
            }

            // Salvar metadata do upload (com merge para idempotência)
            if (uploadId) {
                await db.collection(this.UPLOADS_COLLECTION).doc(uploadId).set({
                    ...metadata,
                    totalRecords: data.length,
                    uploadedAt: timestamp,
                    uploadedBy: auth.currentUser?.email || 'unknown',
                    lastUpdated: timestamp
                }, { merge: true });
            }

            console.log(`[UPLOAD] Upload concluído: ${totalSaved} registros salvos com sucesso`);
            return { success: true, count: totalSaved };
            
        } catch (error) {
            console.error('[UPLOAD] Erro ao salvar dados:', error);
            return {
                success: false,
                error: error.message,
                errorCode: error.code
            };
        }
    }

    /**
     * Helper: Sleep para throttling
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Buscar todos os dados com paginação/streaming para suportar grandes volumes (10k+)
     * Nota: Filtros de data são aplicados no cliente para maior flexibilidade
     */
    static async getData(filters = {}) {
        try {
            // Firestore tem limite de 1MB por query, então usamos paginação
            const BATCH_SIZE = 1000; // Máximo seguro por query
            let query = db.collection(this.COLLECTION_NAME).orderBy('DATA', 'desc').limit(BATCH_SIZE);
            const data = [];
            let lastDoc = null;
            let batchCount = 0;
            const MAX_BATCHES = 20; // Limite de segurança: 20k registros (pode aumentar se necessário)

            console.log('[GET DATA] Iniciando busca de dados com paginação...');

            // Buscar em batches até não haver mais documentos
            do {
                try {
                    if (lastDoc) {
                        query = db.collection(this.COLLECTION_NAME)
                            .orderBy('DATA', 'desc')
                            .startAfter(lastDoc)
                            .limit(BATCH_SIZE);
                    }

                    const snapshot = await query.get();
                    
                    if (snapshot.empty) {
                        break;
                    }

                    batchCount++;
                    console.log(`[GET DATA] Batch ${batchCount}: ${snapshot.size} documentos carregados (total: ${data.length + snapshot.size})`);

                    snapshot.forEach(doc => {
                const docData = doc.data();
                
                // Converter Timestamp do Firestore para string ISO usando métodos locais
                // IMPORTANTE: NUNCA usar toISOString() que aplica UTC e causa deslocamento de dia
                if (docData.DATA) {
                    if (docData.DATA.toDate && typeof docData.DATA.toDate === 'function') {
                        // É Timestamp do Firestore - usar métodos locais
                        const date = docData.DATA.toDate();
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        docData.DATA = `${year}-${month}-${day}`;
                    } else if (docData.DATA instanceof Date) {
                        // BUG CORRIGIDO: Date objects criados com new Date("YYYY-MM-DD") são UTC
                        // Verificar se há diferença entre UTC e local para corrigir
                        const date = docData.DATA;
                        const utcDay = date.getUTCDate();
                        const localDay = date.getDate();
                        const utcMonth = date.getUTCMonth();
                        const localMonth = date.getMonth();
                        
                        let year, month, day;
                        if (utcDay !== localDay || utcMonth !== localMonth) {
                            // Date foi criado incorretamente, usar valores UTC e recriar como local
                            year = date.getUTCFullYear();
                            month = date.getUTCMonth() + 1;
                            day = date.getUTCDate();
                            // Recriar como data local
                            const localDate = new Date(year, month - 1, day);
                            year = localDate.getFullYear();
                            month = localDate.getMonth() + 1;
                            day = localDate.getDate();
                        } else {
                            // Date foi criado corretamente, usar métodos locais
                            year = date.getFullYear();
                            month = date.getMonth() + 1;
                            day = date.getDate();
                        }
                        docData.DATA = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    } else if (typeof docData.DATA === 'string') {
                        // Já é string, garantir formato ISO sem usar new Date()
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(docData.DATA.trim())) {
                            // Tentar parse manual
                            const trimmed = docData.DATA.trim();
                            // Formato brasileiro: DD/MM/YYYY
                            if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(trimmed)) {
                                const parts = trimmed.split(/[\/\-\.]/);
                                if (parts.length === 3) {
                                    const day = parseInt(parts[0], 10);
                                    const month = parseInt(parts[1], 10);
                                    const year = parseInt(parts[2], 10);
                                    docData.DATA = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                }
                            } else {
                                // Tentar parse manual de formato YYYY/MM/DD ou YYYY-MM-DD
                                const reverseMatch = trimmed.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
                                if (reverseMatch) {
                                    const year = parseInt(reverseMatch[1], 10);
                                    const month = parseInt(reverseMatch[2], 10);
                                    const day = parseInt(reverseMatch[3], 10);
                                    docData.DATA = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                } else {
                                    // Último recurso - usar new Date() apenas se necessário
                                    // BUG CORRIGIDO: Aplicar mesma lógica de correção para evitar "-1 dia"
                                    const parsed = new Date(trimmed);
                                    if (!isNaN(parsed.getTime())) {
                                        // Verificar se há diferença UTC/local
                                        const utcDay = parsed.getUTCDate();
                                        const localDay = parsed.getDate();
                                        let year, month, day;
                                        
                                        if (utcDay !== localDay) {
                                            // Date foi criado incorretamente, usar valores UTC e recriar como local
                                            year = parsed.getUTCFullYear();
                                            month = parsed.getUTCMonth() + 1;
                                            day = parsed.getUTCDate();
                                            const localDate = new Date(year, month - 1, day);
                                            year = localDate.getFullYear();
                                            month = localDate.getMonth() + 1;
                                            day = localDate.getDate();
                                        } else {
                                            // Usar métodos locais normalmente
                                            year = parsed.getFullYear();
                                            month = parsed.getMonth() + 1;
                                            day = parsed.getDate();
                                        }
                                        docData.DATA = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    }
                                }
                            }
                        }
                        }
                    }
                    
                        data.push({
                            id: doc.id,
                            ...docData
                        });
                    });

                    // Preparar próximo batch
                    lastDoc = snapshot.docs[snapshot.docs.length - 1];
                    
                    // Limite de segurança para evitar loops infinitos
                    if (batchCount >= MAX_BATCHES) {
                        console.warn(`[GET DATA] Limite de batches atingido (${MAX_BATCHES}). Total carregado: ${data.length} registros`);
                        break;
                    }

                    // Throttling entre batches para não sobrecarregar
                    if (snapshot.size === BATCH_SIZE) {
                        await this.sleep(100); // Pequeno delay entre batches
                    }

                } catch (batchError) {
                    console.error(`[GET DATA] Erro ao buscar batch ${batchCount + 1}:`, batchError);
                    // Continuar com os dados já carregados
                    break;
                }
            } while (lastDoc);

            console.log(`[GET DATA] Busca concluída: ${data.length} registros carregados em ${batchCount} batches`);
            return { success: true, data };
        } catch (error) {
            console.error('Erro ao buscar dados:', error);
            // Se erro de índice, tenta sem orderBy
            try {
                const snapshot = await db.collection(this.COLLECTION_NAME).get();
                const data = [];

                snapshot.forEach(doc => {
                    const docData = doc.data();
                    
                    // Converter Timestamp do Firestore para string ISO usando métodos locais
                    // IMPORTANTE: NUNCA usar toISOString() que aplica UTC e causa deslocamento
                    if (docData.DATA) {
                        if (docData.DATA.toDate && typeof docData.DATA.toDate === 'function') {
                            // É Timestamp do Firestore - usar métodos locais
                            const date = docData.DATA.toDate();
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            docData.DATA = `${year}-${month}-${day}`;
                        } else if (docData.DATA instanceof Date) {
                            // É objeto Date - usar métodos locais
                            const year = docData.DATA.getFullYear();
                            const month = String(docData.DATA.getMonth() + 1).padStart(2, '0');
                            const day = String(docData.DATA.getDate()).padStart(2, '0');
                            docData.DATA = `${year}-${month}-${day}`;
                        } else if (typeof docData.DATA === 'string') {
                            // Já é string, garantir formato ISO sem usar new Date()
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(docData.DATA.trim())) {
                                // Tentar parse manual
                                const trimmed = docData.DATA.trim();
                                // Formato brasileiro: DD/MM/YYYY
                                if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(trimmed)) {
                                    const parts = trimmed.split(/[\/\-\.]/);
                                    if (parts.length === 3) {
                                        const day = parseInt(parts[0], 10);
                                        const month = parseInt(parts[1], 10);
                                        const year = parseInt(parts[2], 10);
                                        docData.DATA = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    }
                                } else {
                                    // Último recurso - usar new Date() apenas se necessário
                                    const parsed = new Date(trimmed);
                                    if (!isNaN(parsed.getTime())) {
                                        const year = parsed.getFullYear();
                                        const month = String(parsed.getMonth() + 1).padStart(2, '0');
                                        const day = String(parsed.getDate()).padStart(2, '0');
                                        docData.DATA = `${year}-${month}-${day}`;
                                    }
                                }
                            }
                        }
                    }
                    
                    data.push({
                        id: doc.id,
                        ...docData
                    });
                });

                    console.log(`[GET DATA] Fallback concluído: ${data.length} registros carregados`);
                return { success: true, data };
            } catch (retryError) {
                console.error('[GET DATA] Erro no fallback:', retryError);
                return {
                    success: false,
                    error: retryError.message,
                    data: []
                };
            }
        }
    }

    /**
     * Buscar histórico de uploads
     */
    static async getUploadHistory() {
        try {
            const snapshot = await db.collection(this.UPLOADS_COLLECTION)
                .orderBy('uploadedAt', 'desc')
                .limit(5000)
                .get();

            const history = [];
            snapshot.forEach(doc => {
                history.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return { success: true, history };
        } catch (error) {
            console.error('Erro ao buscar histórico:', error);
            return {
                success: false,
                error: error.message,
                history: []
            };
        }
    }

    /**
     * Gerar ID único para upload
     */
    static generateUploadId() {
        return db.collection(this.UPLOADS_COLLECTION).doc().id;
    }

    /**
     * Excluir dados de um upload específico
     * Implementação robusta com verificação e fallback
     */
    static async deleteUpload(uploadId) {
        if (!uploadId) {
            return {
                success: false,
                error: 'UploadId não fornecido'
            };
        }

        console.log('[DELETE] Iniciando exclusão do upload:', uploadId);

        try {
            let snapshot;
            let queryMethod = 'indexed';

            // Tentar buscar usando query com índice (método preferido)
            try {
                snapshot = await db.collection(this.COLLECTION_NAME)
                    .where('uploadId', '==', uploadId)
                    .get();
                console.log('[DELETE] Query indexada encontrou:', snapshot.size, 'registros');
            } catch (queryError) {
                // Se a query falhar (provavelmente falta de índice), usar fallback
                console.warn('[DELETE] Query indexada falhou, usando método alternativo:', queryError.message);
                
                // Fallback: Buscar todos os registros e filtrar no cliente
                // ATENÇÃO: Isso pode ser lento para grandes volumes
                const allSnapshot = await db.collection(this.COLLECTION_NAME).get();
                const filteredDocs = [];
                
                allSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.uploadId === uploadId) {
                        filteredDocs.push(doc);
                    }
                });

                // Criar um QuerySnapshot simulado
                snapshot = {
                    size: filteredDocs.length,
                    empty: filteredDocs.length === 0,
                    forEach: (callback) => {
                        filteredDocs.forEach(callback);
                    },
                    docs: filteredDocs
                };

                queryMethod = 'fallback';
                console.log('[DELETE] Método alternativo encontrou:', snapshot.size, 'registros');
            }

            // Verificar se há registros para excluir
            if (snapshot.empty || snapshot.size === 0) {
                console.log('[DELETE] Nenhum registro encontrado para uploadId:', uploadId);
                
                // Mesmo sem registros, deletar o registro do upload (limpeza)
                try {
                    await db.collection(this.UPLOADS_COLLECTION).doc(uploadId).delete();
                    console.log('[DELETE] Registro de upload removido da coleção uploads');
                } catch (deleteError) {
                    console.warn('[DELETE] Erro ao remover registro de upload:', deleteError.message);
                }

                return {
                    success: true,
                    deletedCount: 0,
                    method: queryMethod
                };
            }

            // Processar exclusão em batches com throttling e retry
            // CONFIGURAÇÃO ULTRA CONSERVADORA para evitar quota exceeded
            const BATCH_SIZE = 100; // Reduzido drasticamente para evitar quota
            const THROTTLE_MS = 2000; // 2 segundos entre batches (muito conservador)
            const MAX_RETRIES = 10; // Mais tentativas
            const INITIAL_BACKOFF_MS = 5000; // 5 segundos inicial (muito conservador)
            
            let deletedCount = 0;
            const docsToDelete = [];
            snapshot.forEach((doc) => {
                docsToDelete.push(doc);
            });

            const totalBatches = Math.ceil(docsToDelete.length / BATCH_SIZE);
            console.log(`[DELETE] Preparando exclusão de ${docsToDelete.length} registros em ${totalBatches} batches`);

            // Processar batches com throttling e retry
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const startIndex = batchIndex * BATCH_SIZE;
                const endIndex = Math.min(startIndex + BATCH_SIZE, docsToDelete.length);
                const batchDocs = docsToDelete.slice(startIndex, endIndex);
                
                let retryCount = 0;
                let batchSuccess = false;
                
                // Retry com exponential backoff
                while (retryCount < MAX_RETRIES && !batchSuccess) {
                    try {
                        const batch = db.batch();
                        batchDocs.forEach(doc => {
                            batch.delete(doc.ref);
                        });
                        
                        await batch.commit();
                        deletedCount += batchDocs.length;
                        batchSuccess = true;
                        
                        console.log(`[DELETE] Batch ${batchIndex + 1}/${totalBatches} commitado: ${batchDocs.length} registros (${deletedCount}/${docsToDelete.length})`);
                        
                    } catch (error) {
                        retryCount++;
                        const errorCode = error.code || error.message;
                        
                        const isTransientError = 
                            errorCode === 'resource-exhausted' ||
                            errorCode === 'unavailable' ||
                            errorCode === 'deadline-exceeded' ||
                            error.message?.includes('Quota exceeded');
                        
                        if (isTransientError && retryCount < MAX_RETRIES) {
                            // Backoff muito mais conservador para quota exceeded
                            const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount - 1);
                            const jitter = Math.random() * 2000; // Jitter maior
                            const delay = Math.min(backoffMs + jitter, 120000); // Máximo 2 minutos
                            const delaySeconds = Math.round(delay / 1000);
                            
                            console.warn(
                                `[DELETE] Erro transitório no batch ${batchIndex + 1} (tentativa ${retryCount}/${MAX_RETRIES}):`,
                                errorCode,
                                `Aguardando ${delaySeconds}s (${Math.round(delaySeconds / 60)}min) antes do próximo retry...`
                            );
                            
                            await this.sleep(delay);
                        } else {
                            console.error(`[DELETE] Erro ao excluir batch ${batchIndex + 1}:`, error);
                            throw error;
                        }
                    }
                }
                
                // Throttling progressivo entre batches (aumenta conforme avança)
                if (batchIndex < totalBatches - 1) {
                    // Throttling progressivo: começa com 2s, aumenta para 3s após 5 batches
                    const progressiveThrottle = batchIndex < 5 
                        ? THROTTLE_MS 
                        : THROTTLE_MS * 1.5; // 3 segundos após 5 batches
                    console.log(`[DELETE] Aguardando ${Math.round(progressiveThrottle / 1000)}s antes do próximo batch...`);
                    await this.sleep(progressiveThrottle);
                }
            }

            // Verificar se a exclusão foi bem-sucedida
            // Aguardar um pouco para garantir propagação
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verificar se ainda existem registros (verificação opcional)
            let verificationSnapshot;
            try {
                verificationSnapshot = await db.collection(this.COLLECTION_NAME)
                    .where('uploadId', '==', uploadId)
                    .limit(1)
                    .get();
            } catch (e) {
                // Se a verificação falhar (falta de índice), pular
                verificationSnapshot = { size: 0 };
            }

            if (verificationSnapshot.size > 0) {
                console.warn('[DELETE] AVISO: Ainda existem', verificationSnapshot.size, 'registros após exclusão');
                return {
                    success: false,
                    error: `Exclusão parcial: ${verificationSnapshot.size} registros ainda existem`,
                    deletedCount: deletedCount,
                    remainingCount: verificationSnapshot.size
                };
            }

            // Deletar o registro do upload na coleção uploads
            try {
                await db.collection(this.UPLOADS_COLLECTION).doc(uploadId).delete();
                console.log('[DELETE] Registro de upload removido da coleção uploads');
            } catch (deleteError) {
                console.warn('[DELETE] Erro ao remover registro de upload:', deleteError.message);
                // Não falhar a operação se apenas o registro de upload não for deletado
            }

            console.log('[DELETE] Exclusão concluída com sucesso:', deletedCount, 'registros removidos');

            return {
                success: true,
                deletedCount: deletedCount,
                method: queryMethod
            };

        } catch (error) {
            console.error('[DELETE] Erro ao excluir upload:', error);
            console.error('[DELETE] Stack trace:', error.stack);
            
            return {
                success: false,
                error: error.message,
                errorCode: error.code || 'UNKNOWN',
                deletedCount: 0
            };
        }
    }

    /**
     * LIMPEZA COMPLETA - Remove TODOS os dados das coleções
     * ⚠️ ATENÇÃO: Esta função é DESTRUTIVA e não pode ser desfeita!
     * Requer confirmação dupla antes de executar.
     * Use apenas quando necessário limpar completamente o banco.
     */
    static async clearAllData() {
        console.log('[CLEAR ALL] Iniciando limpeza completa do banco de dados...');
        
        // CONFIGURAÇÃO ULTRA CONSERVADORA para evitar quota exceeded
        const CLEAR_BATCH_SIZE = 100; // Batches muito pequenos
        const CLEAR_THROTTLE_MS = 3000; // 3 segundos entre batches
        const CLEAR_MAX_RETRIES = 15; // Muitas tentativas
        const CLEAR_INITIAL_BACKOFF = 10000; // 10 segundos inicial
        const MAX_SNAPSHOT_RETRIES = 5; // Tentativas para buscar snapshot
        
        let totalDeleted = 0;
        const results = {
            reinteradas: 0,
            uploads: 0
        };

        try {
            // 1. Limpar coleção 'reinteradas'
            console.log('[CLEAR ALL] Limpando coleção reinteradas...');
            let reinteradasSnapshot;
            let snapshotRetryCount = 0;
            
            // Tentar buscar snapshot com retry (pode falhar por quota)
            while (snapshotRetryCount < MAX_SNAPSHOT_RETRIES) {
                try {
                    reinteradasSnapshot = await db.collection(this.COLLECTION_NAME).limit(10000).get();
                    break; // Sucesso
                } catch (error) {
                    snapshotRetryCount++;
                    if (error.code === 'resource-exhausted' && snapshotRetryCount < MAX_SNAPSHOT_RETRIES) {
                        const waitTime = 5000 * snapshotRetryCount; // 5s, 10s, 15s, 20s, 25s
                        console.warn(`[CLEAR ALL] Quota exceeded ao buscar reinteradas. Aguardando ${waitTime/1000}s antes de tentar novamente... (tentativa ${snapshotRetryCount}/${MAX_SNAPSHOT_RETRIES})`);
                        await this.sleep(waitTime);
                    } else {
                        console.error('[CLEAR ALL] Erro ao buscar reinteradas:', error);
                        throw error;
                    }
                }
            }

            const reinteradasDocs = [];
            reinteradasSnapshot.forEach(doc => {
                reinteradasDocs.push(doc);
            });

            const reinteradasBatches = Math.ceil(reinteradasDocs.length / CLEAR_BATCH_SIZE);
            console.log(`[CLEAR ALL] Encontrados ${reinteradasDocs.length} documentos em reinteradas (${reinteradasBatches} batches de ${CLEAR_BATCH_SIZE})`);

            for (let batchIndex = 0; batchIndex < reinteradasBatches; batchIndex++) {
                const startIndex = batchIndex * CLEAR_BATCH_SIZE;
                const endIndex = Math.min(startIndex + CLEAR_BATCH_SIZE, reinteradasDocs.length);
                const batchDocs = reinteradasDocs.slice(startIndex, endIndex);
                
                let batchRetryCount = 0;
                let batchSuccess = false;
                
                // Retry com exponential backoff muito conservador
                while (batchRetryCount < CLEAR_MAX_RETRIES && !batchSuccess) {
                    try {
                        const batch = db.batch();
                        batchDocs.forEach(doc => {
                            batch.delete(doc.ref);
                        });
                        
                        await batch.commit();
                        results.reinteradas += batchDocs.length;
                        totalDeleted += batchDocs.length;
                        batchSuccess = true;
                        
                        console.log(`[CLEAR ALL] Batch ${batchIndex + 1}/${reinteradasBatches} de reinteradas commitado: ${batchDocs.length} documentos (${results.reinteradas}/${reinteradasDocs.length} total)`);
                        
                    } catch (error) {
                        batchRetryCount++;
                        const errorCode = error.code || error.message;
                        const isTransientError = 
                            errorCode === 'resource-exhausted' ||
                            errorCode === 'unavailable' ||
                            errorCode === 'deadline-exceeded';
                        
                        if (isTransientError && batchRetryCount < CLEAR_MAX_RETRIES) {
                            const backoffMs = CLEAR_INITIAL_BACKOFF * Math.pow(2, batchRetryCount - 1);
                            const jitter = Math.random() * 5000;
                            const delay = Math.min(backoffMs + jitter, 180000); // Máximo 3 minutos
                            const delaySeconds = Math.round(delay / 1000);
                            
                            console.warn(`[CLEAR ALL] Erro transitório no batch ${batchIndex + 1} de reinteradas (tentativa ${batchRetryCount}/${CLEAR_MAX_RETRIES}): ${errorCode}, aguardando ${delaySeconds}s (${Math.round(delaySeconds / 60)}min)...`);
                            await this.sleep(delay);
                        } else {
                            console.error(`[CLEAR ALL] Erro ao excluir batch ${batchIndex + 1} de reinteradas após ${batchRetryCount} tentativas:`, error);
                            // Continuar com próximo batch mesmo se este falhar (não parar tudo)
                            break;
                        }
                    }
                }
                
                // Throttling progressivo muito conservador
                if (batchIndex < reinteradasBatches - 1) {
                    const progressiveThrottle = batchIndex < 3 ? CLEAR_THROTTLE_MS : CLEAR_THROTTLE_MS * 2; // 6s após 3 batches
                    console.log(`[CLEAR ALL] Aguardando ${Math.round(progressiveThrottle / 1000)}s antes do próximo batch de reinteradas...`);
                    await this.sleep(progressiveThrottle);
                }
            }

            // 2. Limpar coleção 'uploads'
            console.log('[CLEAR ALL] Limpando coleção uploads...');
            let uploadsSnapshot;
            snapshotRetryCount = 0;
            
            // Tentar buscar snapshot com retry
            while (snapshotRetryCount < MAX_SNAPSHOT_RETRIES) {
                try {
                    uploadsSnapshot = await db.collection(this.UPLOADS_COLLECTION).limit(1000).get();
                    break; // Sucesso
                } catch (error) {
                    snapshotRetryCount++;
                    if (error.code === 'resource-exhausted' && snapshotRetryCount < MAX_SNAPSHOT_RETRIES) {
                        const waitTime = 5000 * snapshotRetryCount;
                        console.warn(`[CLEAR ALL] Quota exceeded ao buscar uploads. Aguardando ${waitTime/1000}s... (tentativa ${snapshotRetryCount}/${MAX_SNAPSHOT_RETRIES})`);
                        await this.sleep(waitTime);
                    } else {
                        console.error('[CLEAR ALL] Erro ao buscar uploads:', error);
                        throw error;
                    }
                }
            }

            const uploadsDocs = [];
            uploadsSnapshot.forEach(doc => {
                uploadsDocs.push(doc);
            });

            const uploadsBatches = Math.ceil(uploadsDocs.length / CLEAR_BATCH_SIZE);
            console.log(`[CLEAR ALL] Encontrados ${uploadsDocs.length} documentos em uploads (${uploadsBatches} batches de ${CLEAR_BATCH_SIZE})`);

            for (let batchIndex = 0; batchIndex < uploadsBatches; batchIndex++) {
                const startIndex = batchIndex * CLEAR_BATCH_SIZE;
                const endIndex = Math.min(startIndex + CLEAR_BATCH_SIZE, uploadsDocs.length);
                const batchDocs = uploadsDocs.slice(startIndex, endIndex);
                
                let batchRetryCount = 0;
                let batchSuccess = false;
                
                // Retry com exponential backoff muito conservador
                while (batchRetryCount < CLEAR_MAX_RETRIES && !batchSuccess) {
                    try {
                        const batch = db.batch();
                        batchDocs.forEach(doc => {
                            batch.delete(doc.ref);
                        });
                        
                        await batch.commit();
                        results.uploads += batchDocs.length;
                        totalDeleted += batchDocs.length;
                        batchSuccess = true;
                        
                        console.log(`[CLEAR ALL] Batch ${batchIndex + 1}/${uploadsBatches} de uploads commitado: ${batchDocs.length} documentos (${results.uploads}/${uploadsDocs.length} total)`);
                        
                    } catch (error) {
                        batchRetryCount++;
                        const errorCode = error.code || error.message;
                        const isTransientError = 
                            errorCode === 'resource-exhausted' ||
                            errorCode === 'unavailable' ||
                            errorCode === 'deadline-exceeded';
                        
                        if (isTransientError && batchRetryCount < CLEAR_MAX_RETRIES) {
                            const backoffMs = CLEAR_INITIAL_BACKOFF * Math.pow(2, batchRetryCount - 1);
                            const jitter = Math.random() * 5000;
                            const delay = Math.min(backoffMs + jitter, 180000); // Máximo 3 minutos
                            const delaySeconds = Math.round(delay / 1000);
                            
                            console.warn(`[CLEAR ALL] Erro transitório no batch ${batchIndex + 1} de uploads (tentativa ${batchRetryCount}/${CLEAR_MAX_RETRIES}): ${errorCode}, aguardando ${delaySeconds}s...`);
                            await this.sleep(delay);
                        } else {
                            console.error(`[CLEAR ALL] Erro ao excluir batch ${batchIndex + 1} de uploads após ${batchRetryCount} tentativas:`, error);
                            // Continuar com próximo batch
                            break;
                        }
                    }
                }
                
                // Throttling progressivo
                if (batchIndex < uploadsBatches - 1) {
                    const progressiveThrottle = batchIndex < 3 ? CLEAR_THROTTLE_MS : CLEAR_THROTTLE_MS * 2;
                    console.log(`[CLEAR ALL] Aguardando ${Math.round(progressiveThrottle / 1000)}s antes do próximo batch de uploads...`);
                    await this.sleep(progressiveThrottle);
                }
            }

            console.log(`[CLEAR ALL] Limpeza completa concluída: ${totalDeleted} documentos removidos (reinteradas: ${results.reinteradas}, uploads: ${results.uploads})`);
            
            return {
                success: true,
                deletedCount: totalDeleted,
                reinteradas: results.reinteradas,
                uploads: results.uploads
            };

        } catch (error) {
            console.error('[CLEAR ALL] Erro na limpeza completa:', error);
            return {
                success: false,
                error: error.message,
                errorCode: error.code || 'UNKNOWN',
                deletedCount: totalDeleted,
                reinteradas: results.reinteradas,
                uploads: results.uploads
            };
        }
    }
}

