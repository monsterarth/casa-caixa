// Configuração do Firebase
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
const provider = new firebase.auth.GoogleAuthProvider();

// --- ELEMENTOS DA UI ---
const loginContainer = document.getElementById('login-container');
const loginButton = document.getElementById('login-button');
const appContainer = document.getElementById('app');
const logoutButton = document.getElementById('logout-button');
const welcomeMessage = document.getElementById('welcome-message');
const userEmail = document.getElementById('user-email');


// --- LÓGICA DE AUTENTICAÇÃO ---
loginButton.addEventListener('click', () => {
    auth.signInWithPopup(provider)
        .catch((error) => {
            console.error("Erro ao fazer login:", error);
            alert("Não foi possível fazer login. Verifique o console para mais detalhes.");
        });
});

logoutButton.addEventListener('click', () => {
    auth.signOut();
});

auth.onAuthStateChanged(user => {
    if (user) {
        // Usuário está logado
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');

        // Personaliza a UI com dados do usuário
        const firstName = user.displayName.split(' ')[0];
        welcomeMessage.textContent = `Bem-vindo(a), ${firstName}. Aqui está o resumo do seu negócio.`;
        userEmail.textContent = user.email;

        // Inicializa o app
        initializeApp();
    } else {
        // Usuário não está logado
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});


// --- LÓGICA PRINCIPAL DO APP ---

// Esta função será chamada após o login bem-sucedido
function initializeApp() {
    renderDashboard();
    renderCalendar();
    renderTransactions();
    renderFinancialChart();
}


// --- DADOS MOCK (Temporário) ---
const MOCK_DASHBOARD_DATA = {
    cashBalance: 4150.00,
    forecastedRevenue: 5000.00,
    confirmedRevenue_currentPeriod: 5000.00,
    condominiumExpenses: -850.00,
    netProfitToDivide: 4150.00,
    arthurFinalPayout: 2075.00,
    lucasFinalPayout: 2075.00,
};
const MOCK_RESERVATIONS = [
    { id: 1, guestName: 'Família Silva', propertyId: 'estancia_do_vale', startDate: new Date('2025-06-05'), endDate: new Date('2025-06-08')},
    { id: 2, guestName: 'Casal Martins', propertyId: 'vale_do_sabia', startDate: new Date('2025-06-12'), endDate: new Date('2025-06-16')},
    { id: 3, guestName: 'Grupo Amigos', propertyId: 'estancia_do_vale', startDate: new Date('2025-06-20'), endDate: new Date('2025-06-23')}
];
const MOCK_TRANSACTIONS = [
    { description: 'Pagamento Final - Reserva Família Silva', amount: 3000, category: 'Receita de Reserva', date: '2025-06-05', type: 'revenue' },
    { description: 'Pagamento conta de luz', amount: -850, category: 'Condomínio', date: '2025-06-10', type: 'expense' },
];
const MOCK_PROPERTIES = {
    'estancia_do_vale': { name: 'Estância do Vale', color: 'bg-blue-500', textColor: 'text-white' },
    'vale_do_sabia': { name: 'Vale do Sabiá', color: 'bg-indigo-500', textColor: 'text-white' }
};


// --- NAVEGAÇÃO POR ABAS ---
let currentTab = 'dashboard';
function showTab(tabId) {
    document.querySelector('.tab-button.active').classList.remove('active');
    document.querySelector(`#${currentTab}-tab`).classList.remove('active');
    document.querySelector(`button[onclick="showTab('${tabId}')"]`).classList.add('active');
    document.querySelector(`#${tabId}-tab`).classList.add('active');
    currentTab = tabId;
}


// --- FUNÇÕES DE RENDERIZAÇÃO (Seu código anterior, adaptado) ---

function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderDashboard() {
    const data = MOCK_DASHBOARD_DATA;
    document.getElementById('netProfit').textContent = formatCurrency(data.netProfitToDivide);
    document.getElementById('cashBalance').textContent = formatCurrency(data.cashBalance);
    document.getElementById('forecastedRevenue').textContent = formatCurrency(data.forecastedRevenue);
    document.getElementById('confirmedRevenue').textContent = formatCurrency(data.confirmedRevenue_currentPeriod);
    document.getElementById('condominiumExpenses').textContent = formatCurrency(Math.abs(data.condominiumExpenses));
    document.getElementById('arthurFinalPayout').textContent = formatCurrency(data.arthurFinalPayout);
    document.getElementById('lucasFinalPayout').textContent = formatCurrency(data.lucasFinalPayout);
}

function renderCalendar() {
    const calendarGrid = document.querySelector('.calendar-grid');
    const headers = calendarGrid.innerHTML;
    calendarGrid.innerHTML = headers + '';

    const year = 2025;
    const month = 5; // Junho
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        calendarGrid.insertAdjacentHTML('beforeend', '<div class="calendar-day border-r border-b border-slate-200 p-2"></div>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
        let dayHtml = `<div class="calendar-day border-r border-b border-slate-200 p-2 overflow-hidden relative">
                           <span class="font-medium text-slate-700">${day}</span>
                           <div class="space-y-1 mt-1">`;
        const currentDate = new Date(year, month, day);
        MOCK_RESERVATIONS.forEach(res => {
            if (currentDate >= res.startDate && currentDate <= res.endDate) {
                const prop = MOCK_PROPERTIES[res.propertyId];
                dayHtml += `<div onclick="openReservationModal(${res.id})" class="calendar-event ${prop.color} ${prop.textColor} p-1 rounded-md text-xs truncate">${res.guestName}</div>`;
            }
        });
        dayHtml += `</div></div>`;
        calendarGrid.insertAdjacentHTML('beforeend', dayHtml);
    }
}

function renderTransactions() {
    const tableBody = document.getElementById('transactions-table-body');
    tableBody.innerHTML = '';
    MOCK_TRANSACTIONS.forEach(tx => {
        const isRevenue = tx.type === 'revenue';
        const row = `
            <tr>
                <td class="p-3">${tx.description}</td>
                <td class="p-3 font-medium ${isRevenue ? 'text-green-600' : 'text-red-600'}">${isRevenue ? '+' : ''} ${formatCurrency(Math.abs(tx.amount))}</td>
                <td class="p-3 text-slate-600">${tx.category}</td>
                <td class="p-3 text-slate-600">${new Date(tx.date).toLocaleDateString('pt-BR')}</td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

function renderFinancialChart() {
    const ctx = document.getElementById('financialCompositionChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Receita Confirmada', 'Despesas Condomínio'],
            datasets: [{
                label: 'Composição Financeira',
                data: [
                    MOCK_DASHBOARD_DATA.confirmedRevenue_currentPeriod,
                    Math.abs(MOCK_DASHBOARD_DATA.condominiumExpenses)
                ],
                backgroundColor: ['#22c55e', '#ef4444'],
                borderColor: '#f0f4f8',
                borderWidth: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            cutout: '70%'
        }
    });
}

// Funções de Modal (sem alterações de lógica por enquanto)
function openReservationModal(id = null) { alert('Funcionalidade de modal a ser implementada.'); }
function openTransactionModal(type) { alert('Funcionalidade de modal a ser implementada.'); }