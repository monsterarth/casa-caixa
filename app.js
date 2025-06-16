// Configuração do firebase
const firebaseConfig = {
  apiKey: "AIzaSyBa9ptFhgKmO0DvicaemuLKPn_kcb94XXU",
  authDomain: "casa-e-caixa.firebaseapp.com",
  projectId: "casa-e-caixa",
  storageBucket: "casa-e-caixa.firebasestorage.app",
  messagingSenderId: "210887017905",
  appId: "1:210887017905:web:c59e8cd3ea04bdcbcbe990",
  measurementId: "G-6LQY4W77XF"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

// --- PONTO DE ENTRADA PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    
    // --- ELEMENTOS DA UI ---
    const loginContainer = document.getElementById('login-container');
    const loginButton = document.getElementById('login-button');
    const appContainer = document.getElementById('app');
    const logoutButton = document.getElementById('logout-button');
    const welcomeMessage = document.getElementById('welcome-message');
    const userEmail = document.getElementById('user-email');
    const transactionForm = document.getElementById('transaction-form');

    // --- LÓGICA DE AUTENTICAÇÃO ---
    if(loginButton) {
        loginButton.addEventListener('click', () => {
            auth.signInWithPopup(provider).catch(error => console.error("Erro no login:", error));
        });
    }

    if(logoutButton) {
        logoutButton.addEventListener('click', () => auth.signOut());
    }

    auth.onAuthStateChanged(user => {
        if (user) {
            loginContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            const firstName = user.displayName ? user.displayName.split(' ')[0] : "Usuário";
            welcomeMessage.textContent = `Bem-vindo(a), ${firstName}.`;
            userEmail.textContent = user.email;
            initializeApp();
        } else {
            loginContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
        }
    });

    // --- LÓGICA PRINCIPAL DO APP ---
    function initializeApp() {
        listenForTransactionsAndUpdateDashboard(); // <-- Função principal agora
        if(transactionForm) {
            transactionForm.addEventListener('submit', handleAddTransaction);
        }
        showTab('dashboard'); // <-- Inicia na aba Dashboard
    }
});

// --- LÓGICA DE DADOS (Firestore) ---
function listenForTransactionsAndUpdateDashboard() {
    db.collection('financial_transactions').orderBy('date', 'desc').onSnapshot(querySnapshot => {
        
        let allTransactions = [];
        querySnapshot.forEach(doc => {
            allTransactions.push(doc.data());
        });

        // 1. Renderiza a tabela de lançamentos
        renderTransactionsTable(allTransactions);

        // 2. Calcula os totais do Dashboard
        const financialSummary = calculateFinancialSummary(allTransactions);

        // 3. Atualiza a UI do Dashboard
        updateDashboardUI(financialSummary);
        
        // 4. Atualiza o Gráfico
        updateFinancialChart(financialSummary);

    }, error => {
        console.error("Erro ao buscar dados: ", error);
    });
}

function calculateFinancialSummary(transactions) {
    const summary = {
        confirmedRevenue: 0,
        condominiumExpenses: 0,
        arthurPersonalExpenses: 0,
        lucasPersonalExpenses: 0,
        totalExpenses: 0
    };

    transactions.forEach(tx => {
        if (tx.type === '