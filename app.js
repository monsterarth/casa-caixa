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
        listenForTransactionsAndUpdateDashboard();
        if(transactionForm) {
            transactionForm.addEventListener('submit', handleAddTransaction);
        }
        showTab('dashboard');
    }
});

// --- LÓGICA DE DADOS (Firestore) ---
function listenForTransactionsAndUpdateDashboard() {
    db.collection('financial_transactions').onSnapshot(querySnapshot => {
        let allTransactions = [];
        querySnapshot.forEach(doc => {
            allTransactions.push(doc.data());
        });

        renderTransactionsTable(allTransactions);
        const financialSummary = calculateFinancialSummary(allTransactions);
        updateDashboardUI(financialSummary);
        updateFinancialChart(financialSummary);

    }, error => {
        console.error("Erro ao buscar dados do Firestore: ", error);
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
        if (tx.type === 'revenue') {
            summary.confirmedRevenue += tx.amount;
        } else if (tx.type === 'expense') {
            summary.totalExpenses += tx.amount;
            if (tx.category === 'Condomínio') {
                summary.condominiumExpenses += tx.amount;
            } else if (tx.category === 'Pessoal - Arthur') {
                summary.arthurPersonalExpenses += tx.amount;
            } else if (tx.category === 'Pessoal - Lucas') {
                summary.lucasPersonalExpenses += tx.amount;
            }
        }
    });

    const netProfitToDivide = summary.confirmedRevenue + summary.condominiumExpenses;
    const arthurShare = netProfitToDivide / 2;
    const lucasShare = netProfitToDivide / 2;

    return {
        ...summary,
        cashBalance: summary.confirmedRevenue + summary.totalExpenses,
        netProfitToDivide: netProfitToDivide,
        arthurShare: arthurShare,
        lucasShare: lucasShare,
        arthurFinalPayout: arthurShare + summary.arthurPersonalExpenses,
        lucasFinalPayout: lucasShare + summary.lucasPersonalExpenses,
        forecastedRevenue: 0 
    };
}

// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---
function updateDashboardUI(summary) {
    const el = (id) => document.getElementById(id);

    if (el('netProfit')) el('netProfit').textContent = formatCurrency(summary.netProfitToDivide);
    if (el('cashBalance')) el('cashBalance').textContent = formatCurrency(summary.cashBalance);
    if (el('forecastedRevenue')) el('forecastedRevenue').textContent = formatCurrency(summary.forecastedRevenue);
    if (el('confirmedRevenue')) el('confirmedRevenue').textContent = formatCurrency(summary.confirmedRevenue);
    if (el('condominiumExpenses')) el('condominiumExpenses').textContent = formatCurrency(summary.condominiumExpenses);
    
    if (el('arthurShare')) el('arthurShare').textContent = formatCurrency(summary.arthurShare);
    if (el('arthurPersonalExpenses')) el('arthurPersonalExpenses').textContent = formatCurrency(Math.abs(summary.arthurPersonalExpenses));
    if (el('arthurFinalPayout')) el('arthurFinalPayout').textContent = formatCurrency(summary.arthurFinalPayout);

    if (el('lucasShare')) el('lucasShare').textContent = formatCurrency(summary.lucasShare);
    if (el('lucasPersonalExpenses')) el('lucasPersonalExpenses').textContent = formatCurrency(Math.abs(summary.lucasPersonalExpenses));
    if (el('lucasFinalPayout')) el('lucasFinalPayout').textContent = formatCurrency(summary.lucasFinalPayout);
}

let financialChart = null;
function updateFinancialChart(summary) {
    const ctx = document.getElementById('financialCompositionChart')?.getContext('2d');
    if (!ctx) return;

    const chartData = {
        labels: ['Receita Confirmada', 'Despesas Condomínio'],
        datasets: [{
            data: [summary.confirmedRevenue, Math.abs(summary.condominiumExpenses)],
            backgroundColor: ['#22c55e', '#ef4444'],
            borderColor: '#f0f4f8',
            borderWidth: 4
        }]
    };
    
    if (financialChart) {
        financialChart.data = chartData;
        financialChart.update();
    } else {
        financialChart = new Chart(ctx, {
            type: 'doughnut',
            data: chartData,
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
        });
    }
}

function renderTransactionsTable(transactions) {
    const tableBody = document.getElementById('transactions-table-body');
    if(!tableBody) return;
    
    // Ordena as transações pela data mais recente primeiro
    const sortedTransactions = transactions.sort((a, b) => b.date.seconds - a.date.seconds);

    tableBody.innerHTML = '';
    if (sortedTransactions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-slate-500">Nenhum lançamento encontrado.</td></tr>';
        return;
    }
    sortedTransactions.forEach(tx => {
        const isRevenue = tx.type === 'revenue';
        const date = tx.date ? tx.date.toDate().toLocaleDateString('pt-BR') : 'Data inválida';
        const row = `
            <tr>
                <td class="p-3">${tx.description}</td>
                <td class="p-3 font-medium ${isRevenue ? 'text-green-600' : 'text-red-600'}">${formatCurrency(tx.amount)}</td>
                <td class="p-3 text-slate-600">${tx.category}</td>
                <td class="p-3 text-slate-600">${date}</td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

async function handleAddTransaction(event) {
    event.preventDefault();
    const form = document.getElementById('transaction-form');
    const description = document.getElementById('trans-desc').value;
    const amount = parseFloat(document.getElementById('trans-amount').value);
    
    if (!description || isNaN(amount)) {
        alert("Por favor, preencha a descrição e um valor válido.");
        return;
    }

    const transactionData = {
        description: description,
        amount: form.dataset.type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
        type: form.dataset.type,
        date: firebase.firestore.Timestamp.now(),
        category: form.dataset.type === 'expense' ? document.getElementById('trans-category').value : 'Receita Avulsa'
    };

    try {
        await db.collection('financial_transactions').add(transactionData);
        closeModal('transaction-modal');
    } catch (error) {
        console.error("Erro ao adicionar transação: ", error);
        alert("Não foi possível salvar o lançamento. Tente novamente.");
    }
}

// --- FUNÇÕES GLOBAIS (chamadas pelo HTML) ---
function openTransactionModal(type) {
    const modal = document.getElementById('transaction-modal');
    const form = document.getElementById('transaction-form');
    const title = document.getElementById('transaction-modal-title');
    const category = document.getElementById('category-wrapper');
    const button = document.getElementById('transaction-submit-button');
    
    form.reset();
    form.dataset.type = type;

    if (type === 'expense') {
        title.textContent = 'Nova Despesa';
        category.classList.remove('hidden');
        button.className = "bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors";
        button.textContent = "Adicionar Despesa";
    } else {
        title.textContent = 'Nova Receita Avulsa';
        category.classList.add('hidden');
        button.className = "bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition-colors";
        button.textContent = "Adicionar Receita";
    }
    modal.classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.add('hidden');
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
