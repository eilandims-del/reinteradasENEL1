/**
 * Serviços Firebase - Autenticação e Firestore
 */

import { auth, db } from '../firebase-config.js';

/* =========================
   Helpers Firebase compat
========================= */
function getFieldValueServerTimestamp() {
  const fv = window?.firebase?.firestore?.FieldValue;
  if (!fv?.serverTimestamp) {
    throw new Error(
      'Firebase compat FieldValue não encontrado. Verifique se firebase-firestore-compat.js está carregado antes dos seus scripts.'
    );
  }
  return fv.serverTimestamp();
}

/* =========================
   Serviço de Autenticação
========================= */
export class AuthService {
  static async login(email, senha) {
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, senha);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async logout() {
    try {
      await auth.signOut();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static getCurrentUser() {
    return auth.currentUser;
  }

  static onAuthStateChanged(callback) {
    return auth.onAuthStateChanged(callback);
  }
}

/* =========================
   Serviço de Dados - Firestore
========================= */
export class DataService {
  static COLLECTION_NAME = 'reinteradas';
  static UPLOADS_COLLECTION = 'uploads';

  /* =========================
     Regionais suportadas
  ========================= */
  static REGIONAIS = {
    ATLANTICO: 'ATLANTICO',
    NORTE: 'NORTE',
    CENTRO_NORTE: 'CENTRO NORTE'
  };

  static normalizeRegional(regional) {
    const r = String(regional || '').trim().toUpperCase();
    if (r === 'CENTRO NORTE' || r === 'CENTRO_NORTE' || r === 'CENTRONORTE') return 'CENTRO NORTE';
    if (r === 'ATLÂNTICO' || r === 'ATLANTICO') return 'ATLANTICO';
    if (r === 'NORTE') return 'NORTE';
    return '';
  }

  /* =========================
     Helper
  ========================= */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static generateUploadId() {
    return db.collection(this.UPLOADS_COLLECTION).doc().id;
  }

  /* =========================
     SAVE DATA (com REGIONAL)
  ========================= */
  static async saveData(data, metadata = {}, progressCallback = null) {
    try {
      const timestamp = getFieldValueServerTimestamp();
      const uploadId = metadata.uploadId;
      const regional = this.normalizeRegional(metadata.regional || metadata.REGIONAL);

      if (!uploadId) throw new Error('uploadId é obrigatório');
      if (!regional) throw new Error('REGIONAL é obrigatória');
      if (!Array.isArray(data)) throw new Error('data precisa ser um array');

      const BATCH_SIZE = 200;
      const THROTTLE_MS = 900;

      const MAX_RETRIES = 8;
      const INITIAL_BACKOFF_MS = 2000;

      let totalSaved = 0;
      const totalBatches = Math.ceil(data.length / BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, data.length);
        const batchData = data.slice(startIndex, endIndex);

        let retryCount = 0;
        let batchSuccess = false;

        while (!batchSuccess && retryCount < MAX_RETRIES) {
          try {
            const batch = db.batch();

            batchData.forEach((item, index) => {
              const rowIndex = startIndex + index;
              const docId = `${uploadId}_${rowIndex}`;
              const ref = db.collection(this.COLLECTION_NAME).doc(docId);

              batch.set(
                ref,
                {
                  ...item,
                  REGIONAL: regional,
                  regional,
                  uploadId,
                  rowIndex,
                  createdAt: timestamp
                },
                { merge: true }
              );
            });

            await batch.commit();

            totalSaved += batchData.length;
            batchSuccess = true;

            if (progressCallback) {
              progressCallback({
                batch: batchIndex + 1,
                totalBatches,
                saved: totalSaved,
                total: data.length,
                progress: Math.round((totalSaved / data.length) * 100),
                retrying: false,
                retryCount: 0,
                nextRetryIn: 0
              });
            }
          } catch (error) {
            retryCount++;
            const delay = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, retryCount), 60000);

            if (progressCallback) {
              progressCallback({
                batch: batchIndex + 1,
                totalBatches,
                saved: totalSaved,
                total: data.length,
                progress: Math.round((totalSaved / data.length) * 100),
                retrying: true,
                retryCount,
                nextRetryIn: Math.round(delay / 1000)
              });
            }

            await this.sleep(delay);
            if (retryCount >= MAX_RETRIES) throw error;
          }
        }

        if (batchIndex < totalBatches - 1) {
          await this.sleep(THROTTLE_MS);
        }
      }

      // grava histórico de upload
      await db.collection(this.UPLOADS_COLLECTION).doc(uploadId).set(
        {
          ...metadata,
          REGIONAL: regional,
          regional,
          totalRecords: data.length,
          uploadedAt: timestamp,
          uploadedBy: auth.currentUser?.email || 'unknown'
        },
        { merge: true }
      );

      return { success: true, count: totalSaved };
    } catch (error) {
      console.error('[UPLOAD]', error);
      return { success: false, error: error.message };
    }
  }

  /* =========================
     GET DATA (REGIONAL + DATA)
     - DATA deve estar no formato "YYYY-MM-DD"
  ========================= */
  static async getData(filters = {}) {
    try {
      const regional = this.normalizeRegional(filters.regional);
      const di = String(filters.dataInicial || '').trim();
      const df = String(filters.dataFinal || '').trim();

      if (!regional) return { success: true, data: [] };

      let q = db.collection(this.COLLECTION_NAME).where('REGIONAL', '==', regional);

      // range por string ISO (YYYY-MM-DD) funciona
      if (di) q = q.where('DATA', '>=', di);
      if (df) q = q.where('DATA', '<=', df);

      // Firestore exige orderBy no campo do range
      q = q.orderBy('DATA', 'desc').limit(5000);

      const snapshot = await q.get();
      const data = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

      return { success: true, data };
    } catch (error) {
      console.error('[GET DATA]', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  /* =========================
     GET UPLOAD HISTORY (REGIONAL)
     com fallback (sem índice)
  ========================= */
  static async getUploadHistory(regional = null) {
    try {
      const reg = this.normalizeRegional(regional);

      if (!reg) {
        const snap = await db
          .collection(this.UPLOADS_COLLECTION)
          .orderBy('uploadedAt', 'desc')
          .limit(5000)
          .get();

        const history = [];
        snap.forEach(d => history.push({ id: d.id, ...d.data() }));
        return { success: true, history };
      }

      try {
        const snap = await db
          .collection(this.UPLOADS_COLLECTION)
          .where('REGIONAL', '==', reg)
          .orderBy('uploadedAt', 'desc')
          .limit(5000)
          .get();

        const history = [];
        snap.forEach(d => history.push({ id: d.id, ...d.data() }));
        return { success: true, history };
      } catch {
        // fallback sem orderBy (quando não há índice composto)
        const snap = await db
          .collection(this.UPLOADS_COLLECTION)
          .where('REGIONAL', '==', reg)
          .limit(5000)
          .get();

        const history = [];
        snap.forEach(d => history.push({ id: d.id, ...d.data() }));

        history.sort((a, b) => {
          const ta = a.uploadedAt?.toMillis?.() || 0;
          const tb = b.uploadedAt?.toMillis?.() || 0;
          return tb - ta;
        });

        return { success: true, history };
      }
    } catch (error) {
      console.error('[UPLOAD HISTORY]', error);
      return { success: false, error: error.message, history: [] };
    }
  }

  /* =========================
     DELETE UPLOAD
     - remove doc uploads/{uploadId}
     - remove registros reinteradas onde uploadId == {uploadId}
========================= */
  static async deleteUpload(uploadId) {
    try {
      const id = String(uploadId || '').trim();
      if (!id) throw new Error('uploadId inválido');

      let deletedCount = 0;

      // 1) apagar registros por uploadId em lotes
      while (true) {
        const snap = await db
          .collection(this.COLLECTION_NAME)
          .where('uploadId', '==', id)
          .limit(450)
          .get();

        if (snap.empty) break;

        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        deletedCount += snap.size;

        // pequeno respiro (evita burst)
        await this.sleep(250);
      }

      // 2) apagar histórico do upload
      await db.collection(this.UPLOADS_COLLECTION).doc(id).delete();

      return { success: true, deletedCount };
    } catch (error) {
      console.error('[DELETE UPLOAD]', error);
      return { success: false, error: error.message, deletedCount: 0 };
    }
  }

  /* =========================
     CLEAR ALL DATA
     - apaga TUDO em uploads e reinteradas
     (cuidado: operação pesada)
========================= */
  static async clearAllData() {
    try {
      let deletedData = 0;
      let deletedUploads = 0;

      // apagar reinteradas
      while (true) {
        const snap = await db.collection(this.COLLECTION_NAME).limit(450).get();
        if (snap.empty) break;

        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        deletedData += snap.size;
        await this.sleep(300);
      }

      // apagar uploads
      while (true) {
        const snap = await db.collection(this.UPLOADS_COLLECTION).limit(450).get();
        if (snap.empty) break;

        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        deletedUploads += snap.size;
        await this.sleep(300);
      }

      return { success: true, deletedData, deletedUploads };
    } catch (error) {
      console.error('[CLEAR ALL]', error);
      return { success: false, error: error.message };
    }
  }
}
