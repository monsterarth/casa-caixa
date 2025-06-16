// PASSO 1: COLE AQUI O SEU OBJETO firebaseConfig DO FIREBASE
const firebaseConfig = {
    // apiKey: "...",
    // authDomain: "...",
    // ...
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


// --- LÓGICA DE AUTENTICAÇÃO ---
loginButton.addEventListener('click', () => {
    auth.signInWithPopup(provider).catch(error => console.error("Erro no login:", error));
});

logoutButton.addEventListener('click', () => auth.signOut());

auth.onAuthStateChanged(user => {
    if (user) {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        const firstName = user.displayName.split(' ')[0];
        welcomeMessage.textContent = `Bem-vindo(a), ${firstName}. Aqui está o resumo do seu negócio.`;
        userEmail.textContent = user.email;
        initializeApp();
    } else {
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});


// --- LÓGICA PRINCIPAL DO APP ---
async function initializeApp() {
    await seedDatabaseIfNeeded(); // <--- NOVO: Semeia o BD antes de tudo
    listenForTransactions();
    renderDashboard();
    renderCalendar();
    renderFinancialChart();
}

// --- NOVO: Função para criar dados iniciais no Firestore ---
async function seedDatabaseIfNeeded() {
    const transactionsRef = db.collection('financial_transactions');
    const snapshot = await transactionsRef.get();

    if (snapshot.empty) {
        console.log("Banco de dados de lançamentos vazio. Semeando com dados iniciais...");
        const batch = db.batch(); // Usamos um 'batch' para salvar tudo de uma vez

        const MOCK_TRANSACTIONS_TO_SEED = [
            { description: 'Pagamento Final - Reserva Família Silva', amount: 3000, category: 'Receita de Reserva', type: 'revenue', date: new Date('2025-06-05') },
            { description: 'Pagamento Sinal - Reserva Casal Martins', amount: 2250, category: 'Receita de Reserva', type: 'revenue', date: new Date('2025-06-01') },
            { description: 'Pagamento conta de luz', amount: -850, category: 'Condomínio', type: 'expense', date: new Date('2025-06-10') },
            { description: 'Manutenção Piscina', amount: -450, category: 'Condomínio', type: 'expense', date: new Date('2025-06-03') },
        ];
        
        MOCK_TRANSACTIONS_TO_SEED.forEach(tx => {
            const docRef = transactionsRef.doc(); // Cria uma referência para um novo documento
            const dataWithTimestamp = {
                ...tx,
                date: firebase.firestore.Timestamp.fromDate(tx.date) // Converte a data para o formato do Firestore
            };
            batch.set(docRef, dataWithTimestamp);
        });

        await batch.commit(); // Envia todos os dados para o Firebase
        console.log("Semeação concluída!");
    } else {
        console.log("Banco de dados de lançamentos já contém dados.");
    }
}


// --- DADOS MOCK (Serão removidos aos poucos) ---
const MOCK_DASHBOARD_DATA = { /* ... mantido por enquanto ... */ };
const MOCK_RESERVATIONS = [ /* ... mantido por enquanto ... */ ];
const MOCK_PROPERTIES = { /* ... mantido por enquanto ... */ };


// --- NAVEGAÇÃO POR ABAS ---
let currentTab = 'dashboard';
function showTab(tabId) {
    document.querySelector('.tab-button.active').classList.remove('active');
    document.querySelector(`#${currentTab}-tab`).classList.remove('active');
    document.querySelector(`button[onclick="showTab('${tabId}')"]`).classList.add('active');
    document.querySelector(`#${tabId}-tab`).classList.add('active');
    currentTab = tabId;
}


// --- FUNÇÕES DE RENDERIZAÇÃO ---
function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
                    <td class="p-3 font-medium ${isRevenue ? 'text-green-600' : 'text-red-600'}">${isRevenue ? '+' : ''} ${formatCurrency(Math.abs(tx.amount))}</td>
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

// Funções com dados mock (inalteradas por enquanto)
function renderDashboard() { /* ...código inalterado... */ }
function renderCalendar() { /* ...código inalterado... */ }
function renderFinancialChart() { /* ...código inalterado... */ }
function openReservationModal(id = null) { alert('Funcionalidade de modal a ser implementada.'); }
function openTransactionModal(type) { alert('Funcionalidade de modal a ser implementada.'); }

// Copiando as funções que estavam faltando no último trecho para garantir que tudo funcione
renderDashboard.toString = () => {
    const data = MOCK_DASHBOARD_DATA;
    document.getElementById('netProfit').textContent = formatCurrency(data.netProfitToDivide);
    document.getElementById('cashBalance').textContent = formatCurrency(data.cashBalance);
    document.getElementById('forecastedRevenue').textContent = formatCurrency(data.forecastedRevenue);
    document.getElementById('confirmedRevenue').textContent = formatCurrency(data.confirmedRevenue_currentPeriod);
    document.getElementById('condominiumExpenses').textContent = formatCurrency(Math.abs(data.condominiumExpenses));
    document.getElementById('arthurFinalPayout').textContent = formatCurrency(data.arthurFinalPayout);
    document.getElementById('lucasFinalPayout').textContent = formatCurrency(data.lucasFinalPayout);
}
renderCalendar.toString = () => {
    const calendarGrid = document.querySelector('.calendar-grid');
    const headers = calendarGrid.querySelector('.text-center.font-bold')?.parentNode.innerHTML || '';
    calendarGrid.innerHTML = headers;

    const year = 2025; const month = 5;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) calendarGrid.insertAdjacentHTML('beforeend', '<div class="calendar-day border-r border-b border-slate-200 p-2"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
        let dayHtml = `<div class="calendar-day border-r border-b border-slate-200 p-2 overflow-hidden relative"><span class="font-medium text-slate-700">${day}</span><div class="space-y-1 mt-1">`;
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
renderFinancialChart.toString = () => {
    const ctx = document.getElementById('financialCompositionChart').getContext('2d');
    if (window.myFinancialChart) window.myFinancialChart.destroy();
    window.myFinancialChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Receita Confirmada', 'Despesas Condomínio'],
            datasets: [{
                data: [MOCK_DASHBOARD_DATA.confirmedRevenue_currentPeriod, Math.abs(MOCK_DASHBOARD_DATA.condominiumExpenses)],
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