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

// --- ELEMENTOS DA UI ---
const loginContainer = document.getElementById('login-container');
const loginButton = document.getElementById('login-button');
const appContainer = document.getElementById('app');
const logoutButton = document.getElementById('logout-button');
const welcomeMessage = document.getElementById('welcome-message');
const userEmail = document.getElementById('user-email');

// Modal de Transação
const transactionModal = document.getElementById('transaction-modal');
const transactionForm = document.getElementById('transaction-form');
const transactionModalTitle = document.getElementById('transaction-modal-title');
const categoryWrapper = document.getElementById('category-wrapper');
const transactionSubmitButton = document.getElementById('transaction-submit-button');

// --- LÓGICA DE AUTENTICAÇÃO ---
loginButton.addEventListener('click', () => auth.signInWithPopup(provider).catch(error => console.error("Erro no login:", error)));
logoutButton.addEventListener('click', () => auth.signOut());

auth.onAuthStateChanged(user => {
    if (user) {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        const firstName = user.displayName.split(' ')[0];
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
    listenForTransactions();
    setupEventListeners();
    // Funções com dados mock que serão substituídas
    // renderDashboard();
    // renderCalendar();
    // renderFinancialChart();
}

function setupEventListeners() {
    transactionForm.addEventListener('submit', handleAddTransaction);
}

// --- LÓGICA DE TRANSAÇÕES (Adicionar/Listar) ---
async function handleAddTransaction(event) {
    event.preventDefault(); // Impede o recarregamento da página
    
    const type = transactionForm.dataset.type;
    const description = document.getElementById('trans-desc').value;
    const amount = parseFloat(document.getElementById('trans-amount').value);
    
    if (!description || isNaN(amount)) {
        alert("Por favor, preencha a descrição e um valor válido.");
        return;
    }

    const transactionData = {
        description: description,
        amount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
        type: type,
        date: firebase.firestore.Timestamp.now(),
    };

    if (type === 'expense') {
        transactionData.category = document.getElementById('trans-category').value;
    } else {
        transactionData.category = 'Receita Avulsa';
    }

    try {
        await db.collection('financial_transactions').add(transactionData);
        closeModal('transaction-modal');
    } catch (error) {
        console.error("Erro ao adicionar transação: ", error);
        alert("Não foi possível salvar o lançamento. Tente novamente.");
    }
}

function listenForTransactions() {
    const tableBody = document.getElementById('transactions-table-body');
    db.collection('financial_transactions').orderBy('date', 'desc').onSnapshot(querySnapshot => {
        tableBody.innerHTML = '';
        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-slate-500">Nenhum lançamento encontrado.</td></tr>';
            return;
        }
        querySnapshot.forEach(doc => {
            const tx = doc.data();
            const isRevenue = tx.type === 'revenue';
            const date = tx.date ? tx.date.toDate().toLocaleDateString('pt-BR') : 'Data inválida';
            
            const row = `
                <tr>
                    <td class="p-3">${tx.description}</td>
                    <td class="p-3 font-medium ${isRevenue ? 'text-green-600' : 'text-red-600'}">${isRevenue ? '+' : ''} ${formatCurrency(tx.amount)}</td>
                    <td class="p-3 text-slate-600">${tx.category}</td>
                    <td class="p-3 text-slate-600">${date}</td>
                </tr>
            `;
            tableBody.insertAdjacentHTML('beforeend', row);
        });
    }, error => {
        console.error("Erro ao buscar lançamentos: ", error);
        tableBody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-red-500">Erro ao carregar dados.</td></tr>';
    });
}

// --- CONTROLES DE MODAL ---
function openTransactionModal(type) {
    transactionForm.reset(); // Limpa o formulário
    transactionForm.dataset.type = type; // Guarda o tipo ('expense' ou 'revenue')

    if (type === 'expense') {
        transactionModalTitle.textContent = 'Nova Despesa';
        categoryWrapper.classList.remove('hidden');
        transactionSubmitButton.className = "bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors";
        transactionSubmitButton.textContent = "Adicionar Despesa";
    } else {
        transactionModalTitle.textContent = 'Nova Receita Avulsa';
        categoryWrapper.classList.add('hidden');
        transactionSubmitButton.className = "bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition-colors";
        transactionSubmitButton.textContent = "Adicionar Receita";
    }

    transactionModal.classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// --- FUNÇÕES DE NAVEGAÇÃO E UTILITÁRIOS ---
function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

let currentTab = 'transactions'; // Mudei a aba inicial para a que estamos trabalhando
function showTab(tabId) {
    // Esconde todas as abas
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    // Desativa todos os botões
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    
    // Ativa a aba e o botão corretos
    document.querySelector(`#${tabId}-tab`).classList.add('active');
    document.querySelector(`button[onclick="showTab('${tabId}')"]`).classList.add('active');
    
    currentTab = tabId;
}

// Força a aba de transações a ser a primeira a ser exibida
document.addEventListener('DOMContentLoaded', () => {
    showTab('transactions');
});