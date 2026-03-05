/**
 * Serviços Firebase - MODULAR (Auth + Firestore)
 *
 * ✅ Esta versão adiciona suporte a "CLIENTES AFETADOS" em uma coleção separada.
 * - Reiteradas:   coleção "reinteradas" (mantido)
 * - Clientes:     coleção "clientes_afetados"
 * - Histórico:    coleção "uploads" (mantido), com campo dataset = "REITERADAS" | "CLIENTES"
 */

import { auth, db } from "../firebase-config.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   Serviço de Autenticação
========================= */
export class AuthService {
  static async login(email, senha) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, senha);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  static async logout() {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  static getCurrentUser() {
    return auth.currentUser;
  }

  static onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  }
}

/* =========================
   Serviço de Dados - Firestore
========================= */
export class DataService {
  // ⚠️ mantém o nome atual para não quebrar o site existente
  static COLLECTION_NAME = "reinteradas";
  static CLIENTES_COLLECTION = "clientes_afetados";
  static UPLOADS_COLLECTION = "uploads";
  static CLIENTES_TOP_COLLECTION = "clientes_top";
  static RETORNOS_COLLECTION = "retornos_inspetores";

  static REGIONAIS = {
    ATLANTICO: "ATLANTICO",
    NORTE: "NORTE",
    CENTRO_NORTE: "CENTRO NORTE"
  };

  static normalizeRegional(value) {
    const raw = String(value ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const compact = raw.replace(/[^A-Z0-9]/g, '');

    if (compact === 'TODOS' || compact === 'TODAS') return 'TODOS';
    if (compact === 'CNORTE' || compact === 'CENTRONORTE') return 'CENTRO NORTE';
    if (compact === 'NORTE') return 'NORTE';
    if (compact === 'ATLANTICO') return 'ATLANTICO';

    return '';
  }

  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static generateUploadId() {
    return doc(collection(db, this.UPLOADS_COLLECTION)).id;
  }

  /* =========================
     Helpers internos
  ========================= */
  static _pickRegionalFromRow(row) {
    if (!row || typeof row !== 'object') return '';

    const direct =
      row['ÁREA'] ?? row['AREA'] ?? row.AREA ?? row.area ??
      row['REGIONAL'] ?? row.REGIONAL ?? row.regional;

    const r1 = this.normalizeRegional(direct);
    if (r1) return r1;

    const keys = Object.keys(row);

    const normKey = (k) => String(k ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\./g, '')
      .replace(/\s+/g, '');

    const kArea = keys.find(k => normKey(k) === 'AREA');
    if (kArea != null) {
      const r2 = this.normalizeRegional(row[kArea]);
      if (r2) return r2;
    }

    const kReg = keys.find(k => normKey(k) === 'REGIONAL');
    if (kReg != null) {
      const r3 = this.normalizeRegional(row[kReg]);
      if (r3) return r3;
    }

    return '';
  }

  static _resolveDatasetFromMetadata(metadata = {}) {
    const ds = String(metadata.dataset || '').trim().toUpperCase();
    if (ds === 'CLIENTES') return 'CLIENTES';
    return 'REITERADAS';
  }

  static _getCollectionForDataset(dataset) {
    return dataset === 'CLIENTES' ? this.CLIENTES_COLLECTION : this.COLLECTION_NAME;
  }

  /* =========================
     SAVE DATA (REITERADAS)
  ========================= */
  static async saveData(data, metadata = {}, progressCallback = null) {
    return this._saveGeneric({
      dataset: this._resolveDatasetFromMetadata(metadata),
      data,
      metadata,
      progressCallback
    });
  }
  
  static async saveClientesTopData(topRows, metadata = {}, progressCallback = null) {
    // salva só ~30 docs (TOP10 por regional)
    return this._saveClientesTopGeneric({ topRows, metadata, progressCallback });
  }
  
  static async _saveClientesTopGeneric({ topRows, metadata = {}, progressCallback = null }) {
    try {
      const uploadId = metadata.uploadId;
      if (!uploadId) throw new Error("uploadId é obrigatório");
      if (!Array.isArray(topRows)) throw new Error("topRows precisa ser um array");
  
      const BATCH_SIZE = 450; // aqui vai ser 30, então 1 batch só
      const totalBatches = Math.ceil(topRows.length / BATCH_SIZE);
  
      let totalSaved = 0;
  
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, topRows.length);
        const batchData = topRows.slice(startIndex, endIndex);
  
        const batch = writeBatch(db);
  
        batchData.forEach((item, index) => {
          const rowIndex = startIndex + index;
  
          // docId estável: upload + regional + num_cliente (evita duplicar)
          const num = String(item.NUM_CLIENTE || '').trim();
          const reg = String(item.REGIONAL || 'GERAL').trim();
          const docId = `${uploadId}_${reg}_${num || rowIndex}`;
  
          const ref = doc(db, this.CLIENTES_TOP_COLLECTION, docId);
  
          batch.set(ref, {
            ...item,
            dataset: 'CLIENTES_TOP',
            uploadId,
            rowIndex,
            createdAt: serverTimestamp()
          }, { merge: true });
        });
  
        await batch.commit();
        totalSaved += batchData.length;
  
        if (progressCallback) {
          progressCallback({
            batch: batchIndex + 1,
            totalBatches,
            saved: totalSaved,
            total: topRows.length,
            progress: Math.round((totalSaved / topRows.length) * 100),
            retrying: false,
            retryCount: 0,
            nextRetryIn: 0
          });
        }
      }
  
      // histórico do upload (continua em uploads)
      await setDoc(
        doc(db, this.UPLOADS_COLLECTION, uploadId),
        {
          ...metadata,
          dataset: 'CLIENTES_TOP',
          REGIONAL: "MISTO",
          regional: "MISTO",
          totalRecords: topRows.length,
          uploadedAt: serverTimestamp(),
          uploadedBy: auth.currentUser?.email || "unknown"
        },
        { merge: true }
      );
  
      return { success: true, count: totalSaved };
    } catch (error) {
      console.error("[UPLOAD CLIENTES_TOP]", error);
      return { success: false, error: error?.message || String(error) };
    }
  }
  
  // leitura dos TOPs
  static async getClientesTopData(filters = {}) {
    try {
      const regional = this.normalizeRegional(filters.regional);
  
      const colRef = collection(db, this.CLIENTES_TOP_COLLECTION);
  
      if (regional === 'TODOS' || !regional) {
        const qAll = query(colRef, orderBy("createdAt", "desc"), limit(200));
        const snap = await getDocs(qAll);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return { success: true, data };
      }
  
      const q1 = query(
        colRef,
        where("REGIONAL", "==", regional),
        orderBy("createdAt", "desc"),
        limit(200)
      );
  
      const snap = await getDocs(q1);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return { success: true, data };
  
    } catch (error) {
      console.error("[GET CLIENTES_TOP]", error);
      return { success: false, error: error?.message || String(error), data: [] };
    }
  }
  /* =========================
     SAVE CLIENTES (NOVO)
  ========================= */
  static async saveClientesData(data, metadata = {}, progressCallback = null) {
    return this._saveGeneric({
      dataset: 'CLIENTES',
      data,
      metadata: { ...metadata, dataset: 'CLIENTES' },
      progressCallback
    });
  }

  /* =========================
     SAVE genérico (com retries)
  ========================= */
  static async _saveGeneric({ dataset, data, metadata = {}, progressCallback = null }) {
    try {
      const uploadId = metadata.uploadId;
      const fallbackRegional = this.normalizeRegional(metadata.regional || metadata.REGIONAL) || '';

      if (!uploadId) throw new Error("uploadId é obrigatório");
      if (!Array.isArray(data)) throw new Error("data precisa ser um array");

      const collectionName = this._getCollectionForDataset(dataset);

      // validação mínima (reiteradas exige regional em algum lugar)
      if (!fallbackRegional && dataset === 'REITERADAS') {
        const hasAnyRowRegional = (data || []).some((row) => !!this._pickRegionalFromRow(row));
        if (!hasAnyRowRegional) {
          throw new Error('REGIONAL é obrigatória: inclua a coluna "ÁREA" (ou "REGIONAL") na planilha.');
        }
      }

      const BATCH_SIZE = 450;
      const THROTTLE_MS = 0;

      const MAX_RETRIES = 3;
      const INITIAL_BACKOFF_MS = 800;

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
            const batch = writeBatch(db);
        
            batchData.forEach((item, index) => {
              const rowIndex = startIndex + index;
              const docId = `${uploadId}_${rowIndex}`;
              const ref = doc(db, collectionName, docId);
        
              const rowRegional = this._pickRegionalFromRow(item);
              let finalRegional = rowRegional || fallbackRegional;
        
              if (!finalRegional && dataset === 'CLIENTES') finalRegional = 'GERAL';
              if (!finalRegional && dataset === 'REITERADAS') return;

        // Remover campos pesados antes de salvar (mantém a UI leve e evita doc grande)
              const DROP_FIELDS = ['CC', 'OBS', 'OBSERVACAO', 'OBSERVAÇÃO', 'COMENTARIOS', 'COMENTÁRIOS'];

              const sanitized = { ...item };
              for (const f of DROP_FIELDS) {
                if (f in sanitized) delete sanitized[f];
              }
              batch.set(ref, {
                ...sanitized,
                REGIONAL: finalRegional,
                regional: finalRegional,
                dataset,
                uploadId,
                rowIndex,
                createdAt: serverTimestamp()
              }, { merge: true });
            });
        
            await batch.commit();

            totalSaved += batchData.length;
            batchSuccess = true;
            
            // pequena pausa a cada 10 batches
            if (batchIndex % 10 === 0) await this.sleep(50);
        
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
        
            console.error('[FIRESTORE BATCH ERROR]', {
              dataset,
              batch: batchIndex + 1,
              retry: retryCount,
              code: error?.code,
              message: error?.message
            }, error);
        
            retryCount++;
        
            const delay = Math.min(
              INITIAL_BACKOFF_MS * Math.pow(2, retryCount),
              60000
            );
        
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
        
            if (retryCount >= MAX_RETRIES) {
              throw error;
            }
        
            await this.sleep(delay);
          }
        }

        if (batchIndex < totalBatches - 1) {
          await this.sleep(THROTTLE_MS);
        }
      }

      // histórico do upload
      await setDoc(
        doc(db, this.UPLOADS_COLLECTION, uploadId),
        {
          ...metadata,
          dataset,
          REGIONAL: fallbackRegional || (dataset === 'CLIENTES' ? "GERAL" : "MISTO"),
          regional: fallbackRegional || (dataset === 'CLIENTES' ? "GERAL" : "MISTO"),
          totalRecords: data.length,
          uploadedAt: serverTimestamp(),
          uploadedBy: auth.currentUser?.email || "unknown"
        },
        { merge: true }
      );

      return { success: true, count: totalSaved };
    } catch (error) {
      console.error("[UPLOAD]", error);
      return { success: false, error: error?.message || String(error) };
    }
  }

  /* =========================
     GET DATA (REITERADAS)
  ========================= */
  static async getData(filters = {}) {
    try {
      const regional = this.normalizeRegional(filters.regional);
      const di = String(filters.dataInicial || "").trim();
      const df = String(filters.dataFinal || "").trim();

      const colRef = collection(db, this.COLLECTION_NAME);

      if (regional === 'TODOS') {
        const clauses = [];
        if (di) clauses.push(where("DATA", ">=", di));
        if (df) clauses.push(where("DATA", "<=", df));

        const qAll = query(colRef, ...clauses, orderBy("DATA", "desc"), limit(5000));
        const snap = await getDocs(qAll);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return { success: true, data };
      }

      if (!regional) return { success: true, data: [] };

      const clauses = [where("REGIONAL", "==", regional)];
      if (di) clauses.push(where("DATA", ">=", di));
      if (df) clauses.push(where("DATA", "<=", df));

      const q1 = query(colRef, ...clauses, orderBy("DATA", "desc"), limit(5000));
      const snap = await getDocs(q1);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      return { success: true, data };
    } catch (error) {
      console.error("[GET DATA]", error);
      return { success: false, error: error?.message || String(error), data: [] };
    }
  }
/* =========================
   GET CLIENTES (CLIENTES_AFETADOS)
   - NÃO depende de DATA (a planilha de clientes pode não ter período)
   - filtra por REGIONAL se vier (ATLANTICO/NORTE/CENTRO NORTE)
========================= */
static async getClientesData(filters = {}) {
  try {
    const regional = this.normalizeRegional(filters.regional);

    const colRef = collection(db, this.CLIENTES_COLLECTION);

    // ✅ TODOS: não filtra REGIONAL
    if (regional === 'TODOS') {
      const qAll = query(colRef, orderBy("createdAt", "desc"), limit(5000));
      const snap = await getDocs(qAll);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return { success: true, data };
    }

    // ✅ Regional específica
    if (regional) {
      const q1 = query(
        colRef,
        where("REGIONAL", "==", regional),
        orderBy("createdAt", "desc"),
        limit(5000)
      );
      const snap = await getDocs(q1);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return { success: true, data };
    }

    // sem regional selecionada
    return { success: true, data: [] };
  } catch (error) {
    console.error("[GET CLIENTES]", error);
    return { success: false, error: error?.message || String(error), data: [] };
  }
}

/**
 * Admin: retorna retornos filtrados client-side por regional e período (dataRef).
 * Evita índice composto no Firestore.
 */
static async getRetornosAdminFiltrado(filters = {}) {
  try {
    const regional = this.normalizeRegional(filters.regional);
    const di = String(filters.dataInicial || '').trim();
    const df = String(filters.dataFinal || '').trim();

    const baseRes = await this.getRetornosAdmin();
    if (!baseRes?.success) return baseRes;

    let rows = Array.isArray(baseRes.data) ? baseRes.data : [];

    // regional
    if (regional && regional !== 'TODOS') {
      rows = rows.filter(r => String(r.regional || r.REGIONAL || '').toUpperCase() === regional);
    }

    // período (usa dataRef ISO)
    if (di) rows = rows.filter(r => String(r.dataRef || '').trim() >= di);
    if (df) rows = rows.filter(r => String(r.dataRef || '').trim() <= df);

    return { success: true, data: rows };
  } catch (error) {
    console.error('[GET RETORNOS ADMIN FILTRADO]', error);
    return { success: false, error: error?.message || String(error), data: [] };
  }
}

  /* =========================
     GET UPLOAD HISTORY
     - key: "GERAL" (reiteradas) | "CLIENTES"
  ========================= */
  static async getUploadHistory(key = null) {
    try {
      const colRef = collection(db, this.UPLOADS_COLLECTION);
      const k = String(key || '').trim().toUpperCase();

      if (k === 'CLIENTES') {
        const q = query(colRef, where("dataset", "==", "CLIENTES"), orderBy("uploadedAt", "desc"), limit(5000));
        const snap = await getDocs(q);
        const history = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return { success: true, history };
      }

      // default: reiteradas (filtra client-side para não exigir índice adicional)
      const q = query(colRef, orderBy("uploadedAt", "desc"), limit(5000));
      const snap = await getDocs(q);
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const history = all.filter(it => String(it.dataset || '').toUpperCase() !== 'CLIENTES');
      return { success: true, history };

    } catch (error) {
      console.error("[UPLOAD HISTORY]", error);
      return { success: false, error: error?.message || String(error), history: [] };
    }
  }

  /* =========================
     DELETE UPLOAD
  ========================= */
  static async deleteUpload(uploadId) {
    try {
      const id = String(uploadId || "").trim();
      if (!id) throw new Error("uploadId inválido");

      let dataset = 'REITERADAS';
      try {
        const upRef = doc(db, this.UPLOADS_COLLECTION, id);
        const upSnap = await getDoc(upRef);
        if (upSnap.exists()) {
          const d = upSnap.data() || {};
          dataset = String(d.dataset || 'REITERADAS').toUpperCase() === 'CLIENTES' ? 'CLIENTES' : 'REITERADAS';
        }
      } catch (_) {}

      const collectionName = this._getCollectionForDataset(dataset);

      let deletedCount = 0;

      while (true) {
        const q = query(
          collection(db, collectionName),
          where("uploadId", "==", id),
          limit(450)
        );

        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        deletedCount += snap.size;
        await this.sleep(250);
      }

      await deleteDoc(doc(db, this.UPLOADS_COLLECTION, id));

      return { success: true, deletedCount };
    } catch (error) {
      console.error("[DELETE UPLOAD]", error);
      return { success: false, error: error?.message || String(error), deletedCount: 0 };
    }
  }

  
  /* =========================
   RETORNOS INSPETORES (NOVO)
========================= */

  /**
   * Salva/atualiza retorno do inspetor para uma incidência.
   * docId estável: "<INCIDENCIA>__<UID>"
   */
  static async saveRetornoInspetor(payload = {}) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Usuário não autenticado.');

      const incidencia = String(payload.incidencia || '').trim();
      if (!incidencia) throw new Error('incidencia é obrigatória.');

      const uid = user.uid;
      const email = user.email || 'unknown';

      const docId = `${incidencia}__${uid}`;
      const ref = doc(db, this.RETORNOS_COLLECTION, docId);

      // preservar createdAt se já existir
      let createdAtValue = null;
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) createdAtValue = snap.data()?.createdAt || null;
      } catch (_) {}

      const row = {
        incidencia,
        regional: String(payload.regional || '').trim().toUpperCase() || '',
        dataRef: String(payload.dataRef || '').trim(), // ISO YYYY-MM-DD (se tiver)
        elemento: String(payload.elemento || '').trim(),
        alimentador: String(payload.alimentador || '').trim(),
        causa: String(payload.causa || '').trim(),
        clienteAfetado: String(payload.clienteAfetado || '').trim(),
        retornoTexto: String(payload.retornoTexto || '').trim(),

        inspectorUid: uid,
        inspectorEmail: email,

        createdAt: createdAtValue ? createdAtValue : serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(ref, row, { merge: true });
      return { success: true, id: docId };

    } catch (error) {
      console.error('[SAVE RETORNO]', error);
      return { success: false, error: error?.message || String(error) };
    }
  }

  /**
   * Retorna retornos do inspetor logado (para marcar bolinha verde no painel).
   * Sem orderBy para evitar índice composto.
   */
  static async getRetornosDoInspetor() {
    try {
      const user = auth.currentUser;
      if (!user) return { success: true, data: [] };

      const uid = user.uid;

      const colRef = collection(db, this.RETORNOS_COLLECTION);
      const q1 = query(colRef, where('inspectorUid', '==', uid), limit(5000));
      const snap = await getDocs(q1);

      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { success: true, data };

    } catch (error) {
      console.error('[GET RETORNOS INSPETOR]', error);
      return { success: false, error: error?.message || String(error), data: [] };
    }
  }

  /**
   * Admin: lista retornos (últimos 5000) ordenados por updatedAt.
   */
  static async getRetornosAdmin() {
    try {
      const colRef = collection(db, this.RETORNOS_COLLECTION);
      const q1 = query(colRef, orderBy('updatedAt', 'desc'), limit(5000));
      const snap = await getDocs(q1);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { success: true, data };

    } catch (error) {
      console.error('[GET RETORNOS ADMIN]', error);
      return { success: false, error: error?.message || String(error), data: [] };
    }
  }

  /**
   * Admin: filtra retornos por regional e período (filtro client-side para evitar índices compostos).
   */
  static async getRetornosAdminFiltrado(filters = {}) {
    try {
      const regional = this.normalizeRegional(filters.regional);
      const di = String(filters.dataInicial || '').trim();
      const df = String(filters.dataFinal || '').trim();

      const res = await this.getRetornosAdmin();
      if (!res?.success) return res;

      let data = Array.isArray(res.data) ? res.data : [];

      if (regional && regional !== 'TODOS') {
        data = data.filter(r => String(r.regional || r.REGIONAL || '').toUpperCase() === regional);
      }

      if (di) data = data.filter(r => String(r.dataRef || '') >= di);
      if (df) data = data.filter(r => String(r.dataRef || '') <= df);

      return { success: true, data };
    } catch (error) {
      console.error('[GET RETORNOS ADMIN FILTRADO]', error);
      return { success: false, error: error?.message || String(error), data: [] };
    }
  }

/* =========================
     CLEAR ALL DATA
  ========================= */
  static async clearAllData() {
    try {
      let deletedData = 0;
      let deletedClientes = 0;
      let deletedUploads = 0;

      while (true) {
        const q = query(collection(db, this.COLLECTION_NAME), limit(450));
        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        deletedData += snap.size;
        await this.sleep(300);
      }

      while (true) {
        const q = query(collection(db, this.CLIENTES_COLLECTION), limit(450));
        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        deletedClientes += snap.size;
        await this.sleep(300);
      }

      while (true) {
        const q = query(collection(db, this.UPLOADS_COLLECTION), limit(450));
        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        deletedUploads += snap.size;
        await this.sleep(300);
      }

      return { success: true, deletedData, deletedClientes, deletedUploads };
    } catch (error) {
      console.error("[CLEAR ALL]", error);
      return { success: false, error: error?.message || String(error) };
    }
  }
}