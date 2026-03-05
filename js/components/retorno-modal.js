// js/components/retorno-modal.js
import { openModal, closeModal } from './modal.js';

let state = {
  isOpen: false,
  current: null,        // dados da linha (incidencia, etc)
  onSubmit: null
};

function qs(id) {
  return document.getElementById(id);
}

function setLoading(isLoading) {
  const btnEnviar = qs('btnEnviarRetorno');
  const btnLimpar = qs('btnLimparRetorno');
  const txt = qs('retornoTexto');

  if (btnEnviar) btnEnviar.disabled = !!isLoading;
  if (btnLimpar) btnLimpar.disabled = !!isLoading;
  if (txt) txt.disabled = !!isLoading;

  if (btnEnviar) {
    btnEnviar.innerHTML = isLoading
      ? '<i class="fas fa-spinner fa-spin"></i> Enviando...'
      : '<i class="fas fa-paper-plane"></i> Enviar';
  }
}

function clearFields() {
  const txt = qs('retornoTexto');
  const err = qs('retornoError');
  if (txt) txt.value = '';
  if (err) err.textContent = '';
}

function fillHeader(row) {
  const hEl = qs('retornoHeaderElemento');
  const hInc = qs('retornoHeaderIncidencia');
  const hReg = qs('retornoHeaderRegional');
  const hCli = qs('retornoHeaderCliente');

  if (hEl) hEl.textContent = row?.elemento || row?.ELEMENTO || '—';
  if (hInc) hInc.textContent = row?.incidencia || row?.INCIDENCIA || '—';
  if (hReg) hReg.textContent = row?.regional || row?.REGIONAL || '—';
  if (hCli) hCli.textContent = row?.clienteAfetado || row?.['CLI. AFE'] || row?.CLI_AFE || '—';
}

function openRetornoModal(row = {}, initialText = '') {
  state.current = row || {};
  state.isOpen = true;

  fillHeader(state.current);

  const txt = qs('retornoTexto');
  if (txt) txt.value = initialText || state.current?.retornoTexto || '';

  const err = qs('retornoError');
  if (err) err.textContent = '';

  openModal('modalRetorno');
}

function closeRetornoModal() {
  state.isOpen = false;
  state.current = null;
  setLoading(false);
  closeModal('modalRetorno');
}

function wireOnce() {
  const btnClose = qs('fecharModalRetorno');
  const btnEnviar = qs('btnEnviarRetorno');
  const btnLimpar = qs('btnLimparRetorno');

  btnClose?.addEventListener('click', closeRetornoModal);

  btnLimpar?.addEventListener('click', () => {
    clearFields();
  });

  btnEnviar?.addEventListener('click', async () => {
    const err = qs('retornoError');
    if (err) err.textContent = '';

    const txt = qs('retornoTexto');
    const texto = String(txt?.value || '').trim();

    if (!texto) {
      if (err) err.textContent = 'Digite o retorno antes de enviar.';
      return;
    }

    if (typeof state.onSubmit !== 'function') {
      if (err) err.textContent = 'Handler de envio não configurado.';
      return;
    }

    try {
      setLoading(true);
      await state.onSubmit({ row: state.current, retornoTexto: texto });
      closeRetornoModal();
    } catch (e) {
      if (err) err.textContent = e?.message || String(e);
      setLoading(false);
    }
  });

  // Bloqueia ESC/backdrop se quiser impedir fechar durante envio:
  window.__beforeCloseModal = (modalId) => {
    if (modalId !== 'modalRetorno') return true;
    const btnEnviarLocal = qs('btnEnviarRetorno');
    const locked = btnEnviarLocal?.disabled;
    return !locked; // se estiver disabled (enviando), não fecha
  };
}

export function setupRetornoModal({ onSubmit } = {}) {
  state.onSubmit = onSubmit || null;
  wireOnce();

  return {
    open: openRetornoModal,
    close: closeRetornoModal,
    setLoading
  };
}