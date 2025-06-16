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
// Este evento garante que todo o código abaixo só rode depois que o HTML foi completamente carregado.
document.addEventListener('DOMContentLoaded', () => {
    
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
    // Conecta os eventos aos botões de login/logout
    if(loginButton) {
        loginButton.addEventListener('click', () => {
            auth.signInWithPopup(provider).catch(error => console.error("Erro no login:", error));
        });
    }

    if(logoutButton) {
        logoutButton.addEventListener('click', () => {
            auth.signOut();
        });
    }

    // Escuta por mudanças no estado de autenticação
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
        listenForTransactions();
        setupEventListeners();
        showTab('transactions'); 
    }

    function setupEventListeners() {
        if(transactionForm) {
            transactionForm.addEventListener('submit', handleAddTransaction);
        }
    }

    // --- LÓGICA DE TRANSAÇÕES (Adicionar/Listar) ---
    async function handleAddTransaction(event) {
        event.preventDefault();
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
            if(!tableBody) return;
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

}); // Fim do 'DOMContentLoaded'

// --- FUNÇÕES GLOBAIS (podem ser chamadas pelo HTML) ---
function openTransactionModal(type) {
    const transactionModal = document.getElementById('transaction-modal');
    const transactionForm = document.getElementById('transaction-form');
    const transactionModalTitle = document.getElementById('transaction-modal-title');
    const categoryWrapper = document.getElementById('category-wrapper');
    const transactionSubmitButton = document.getElementById('transaction-submit-button');
    
    transactionForm.reset();
    transactionForm.dataset.type = type;

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

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    
    const tabToShow = document.querySelector(`#${tabId}-tab`);
    const buttonToActivate = document.querySelector(`button[onclick="showTab('${tabId}')"]`);

    if(tabToShow) tabToShow.classList.add('active');
    if(buttonToActivate) buttonToActivate.classList.add('active');
}

function formatCurrency(value) {
    if (typeof value !== 'number') return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
