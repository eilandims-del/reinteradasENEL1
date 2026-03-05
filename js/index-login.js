import { openModal, closeModal } from './components/modal.js';

function initIndexLogin() {
  const btnLogin = document.getElementById('btnLogin');
  const btnAdmin = document.getElementById('btnLoginAdmin');
  const btnInsp = document.getElementById('btnLoginInspetor');

  btnLogin?.addEventListener('click', () => {
    openModal('modalEscolhaLogin');
  });

  btnAdmin?.addEventListener('click', () => {
    closeModal('modalEscolhaLogin');
    window.location.href = 'admin.html';
  });

  btnInsp?.addEventListener('click', () => {
    closeModal('modalEscolhaLogin');
    window.location.href = 'inspetor.html';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIndexLogin);
} else {
  initIndexLogin();
}