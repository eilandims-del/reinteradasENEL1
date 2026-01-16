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
            const BATCH_SIZE = 250; // Margem segura abaixo do limite de 500
            const THROTTLE_MS = 500; // Delay entre batches
            const MAX_RETRIES = 5;
            const INITIAL_BACKOFF_MS = 1000;
            
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
                            // Exponential backoff com jitter
                            const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount - 1);
                            const jitter = Math.random() * 500; // 0-500ms de jitter
                            const delay = backoffMs + jitter;
                            
                            console.warn(
                                `[UPLOAD] Erro transitório no batch ${batchIndex + 1} (tentativa ${retryCount}/${MAX_RETRIES}):`,
                                errorCode,
                                `Próximo retry em ${Math.round(delay)}ms`
                            );
                            
                            await this.sleep(delay);
                        } else {
                            // Erro permanente ou esgotou retries
                            console.error(`[UPLOAD] Erro ao salvar batch ${batchIndex + 1}:`, error);
                            throw error;
                        }
                    }
                }
                
                // Throttling entre batches (exceto no último)
                if (batchIndex < totalBatches - 1) {
                    await this.sleep(THROTTLE_MS);
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
     * Buscar todos os dados
     * Nota: Filtros de data são aplicados no cliente para maior flexibilidade
     */
    static async getData(filters = {}) {
        try {
            let query = db.collection(this.COLLECTION_NAME).orderBy('DATA', 'desc');

            const snapshot = await query.get();
            const data = [];

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

                return { success: true, data };
            } catch (retryError) {
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
                .limit(20)
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
            const BATCH_SIZE = 250; // Margem segura
            const THROTTLE_MS = 500; // Delay entre batches
            const MAX_RETRIES = 5;
            const INITIAL_BACKOFF_MS = 1000;
            
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
                            const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount - 1);
                            const jitter = Math.random() * 500;
                            const delay = backoffMs + jitter;
                            
                            console.warn(
                                `[DELETE] Erro transitório no batch ${batchIndex + 1} (tentativa ${retryCount}/${MAX_RETRIES}):`,
                                errorCode,
                                `Próximo retry em ${Math.round(delay)}ms`
                            );
                            
                            await this.sleep(delay);
                        } else {
                            console.error(`[DELETE] Erro ao excluir batch ${batchIndex + 1}:`, error);
                            throw error;
                        }
                    }
                }
                
                // Throttling entre batches
                if (batchIndex < totalBatches - 1) {
                    await this.sleep(THROTTLE_MS);
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
}

