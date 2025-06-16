import { auth } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { setupUI, showTab, openModal, closeModal } from './ui.js';
import { listenForData } from './data.js';

// --- Estado Global da Aplicação ---
const appState = {
    user: null,
    reservations: [],
    transactions: [],
    currentDate: new Date(),
};

// --- Autenticação ---
function handleAuthState(user) {
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app');
    
    appState.user = user;

    if (user) {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        document.getElementById('welcome-message').textContent = `Bem-vindo(a), ${user.displayName.split(' ')[0]}.`;
        document.getElementById('user-email').textContent = user.email;
        initializeApp();
    } else {
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
}

// --- Inicialização ---
function initializeApp() {
    setupUI(appState);
    listenForData(appState);
    showTab('dashboard', appState);
    
    // Torna as funções de modal globalmente acessíveis
    window.openModal = (modalId, context) => openModal(modalId, { ...context, ...appState });
    window.closeModal = closeModal;
}

// --- Ponto de Entrada ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, handleAuthState);
});
