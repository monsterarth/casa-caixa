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

// --- ESTADO GLOBAL DO APP ---
let currentDate = new Date();
let reservations = [];
let transactions = [];
let financialChart = null;

// --- PONTO DE ENTRADA PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
        loginButton.addEventListener('click', () => {
            auth.signInWithPopup(provider).catch(error => console.error("Erro no login:", error));
        });
    }

    auth.onAuthStateChanged(user => {
        const loginContainer = document.getElementById('login-container');
        const appContainer = document.getElementById('app');
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
    });
});

// --- LÓGICA PRINCIPAL DO APP ---
function initializeApp() {
    setupEventListeners();
    listenForData();
    showTab('dashboard');
}

function setupEventListeners() {
    document.getElementById('logout-button').addEventListener('click', () => auth.signOut());
    document.getElementById('prev-month-btn').addEventListener('click', () => navigateMonth(-1));
    document.getElementById('next-month-btn').addEventListener('click', () => navigateMonth(1));
}

function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

function listenForData() {
    db.collection('financial_transactions').onSnapshot(snapshot => {
        transactions = snapshot.docs.map(doc => doc.data());
        updateAllFinancialUI();
    }, error => console.error("Erro ao buscar transações:", error));

    db.collection('reservations').onSnapshot(async (snapshot) => {
        if (snapshot.empty && !sessionStorage.getItem('seededReservations')) {
            await seedReservations();
            sessionStorage.setItem('seededReservations', 'true');
        } else {
            reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        renderCalendar();
    }, error => console.error("Erro ao buscar reservas:", error));
}

function updateAllFinancialUI() {
    renderTransactionsTable(transactions);
    const summary = calculateFinancialSummary(transactions);
    updateDashboardUI(summary);
    updateFinancialChart(summary);
}

// --- CÁLCULOS FINANCEIROS ---
function calculateFinancialSummary(allTransactions) {
    const summary = { confirmedRevenue: 0, condominiumExpenses: 0, totalExpenses: 0 };
    allTransactions.forEach(tx => {
        if (tx.type === 'revenue') {
            summary.confirmedRevenue += tx.amount;
        } else if (tx.type === 'expense') {
            summary.totalExpenses += tx.amount;
            if (tx.category === 'Condomínio') {
                summary.condominiumExpenses += tx.amount;
            }
        }
    });
    const netProfitToDivide = summary.confirmedRevenue + summary.condominiumExpenses;
    return { ...summary, netProfitToDivide, cashBalance: summary.confirmedRevenue + summary.totalExpenses };
}

// --- FUNÇÕES DE RENDERIZAÇÃO ---
function updateDashboardUI(summary) {
    const el = id => document.getElementById(id);
    if (el('netProfit')) el('netProfit').textContent = formatCurrency(summary.netProfitToDivide);
    if (el('cashBalance')) el('cashBalance').textContent = formatCurrency(summary.cashBalance);
    if (el('confirmedRevenue')) el('confirmedRevenue').textContent = formatCurrency(summary.confirmedRevenue);
    if (el('condominiumExpenses')) el('condominiumExpenses').textContent = formatCurrency(summary.condominiumExpenses);
}

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
        financialChart = new Chart(ctx, { type: 'doughnut', data: chartData, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' } });
    }
}

function renderTransactionsTable(allTransactions) {
    const tableBody = document.getElementById('transactions-table-body');
    if (!tableBody) return;
    const sorted = allTransactions.sort((a, b) => b.date.seconds - a.date.seconds);
    tableBody.innerHTML = sorted.map(tx => {
        const isRevenue = tx.type === 'revenue';
        return `<tr>
            <td class="p-3">${tx.description}</td>
            <td class="p-3 font-medium ${isRevenue ? 'text-green-600' : 'text-red-600'}">${formatCurrency(tx.amount)}</td>
            <td class="p-3 text-slate-600">${tx.category}</td>
            <td class="p-3 text-slate-600">${tx.date.toDate().toLocaleDateString('pt-BR')}</td>
        </tr>`;
    }).join('');
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const display = document.getElementById('current-month-year');
    if (!grid || !display) return;

    grid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    display.textContent = `${currentDate.toLocaleString('pt-BR', { month: 'long' })} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) grid.insertAdjacentHTML('beforeend', '<div class="border rounded-md bg-slate-50"></div>');

    for (let day = 1; day <= daysInMonth; day++) {
        const today = new Date(year, month, day);
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day border rounded-md p-2 flex flex-col bg-white';
        dayCell.innerHTML = `<span class="font-medium self-start">${day}</span><div class="flex-grow space-y-1 mt-1 overflow-hidden"></div>`;
        const eventsContainer = dayCell.querySelector('.flex-grow');
        
        const dayReservations = reservations.filter(res => {
            const start = res.startDate.toDate(); start.setHours(0, 0, 0, 0);
            const end = res.endDate.toDate(); end.setHours(0, 0, 0, 0);
            return today >= start && today <= end;
        });

        dayReservations.forEach(res => {
            const propColor = res.propertyId === 'estancia_do_vale' ? 'bg-blue-500' : 'bg-indigo-500';
            eventsContainer.innerHTML += `<div class="text-white text-xs p-1 rounded-md truncate ${propColor}">${res.guestName}</div>`;
        });
        grid.appendChild(dayCell);
    }
}

// --- FUNÇÕES DE SEED ---
async function seedReservations() {
    const batch = db.batch();
    const reservationsToSeed = [
        { guestName: 'Família Silva', propertyId: 'estancia_do_vale', startDate: new Date('2025-06-05'), endDate: new Date('2025-06-08') },
        { guestName: 'Casal Martins', propertyId: 'vale_do_sabia', startDate: new Date('2025-06-12'), endDate: new Date('2025-06-16') },
    ];
    reservationsToSeed.forEach(res => {
        const docRef = db.collection('reservations').doc();
        batch.set(docRef, { ...res, startDate: firebase.firestore.Timestamp.fromDate(res.startDate), endDate: firebase.firestore.Timestamp.fromDate(res.endDate) });
    });
    await batch.commit();
}

// --- FUNÇÕES GLOBAIS ---
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    document.getElementById(`${tabId}-tab`)?.classList.add('active');
    document.querySelector(`button[onclick="showTab('${tabId}')"]`)?.classList.add('active');
}

function openReservationModal() { alert('Ainda a ser implementado!'); }
function openTransactionModal() { alert('Ainda a ser implementado!'); }
function formatCurrency(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
