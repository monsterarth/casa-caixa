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
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

// --- ESTADO GLOBAL DO APP ---
let currentDate = new Date();
let reservations = [];
let transactions = [];
let financialChart = null;

// --- MAPA DE CORES PARA STATUS ---
const statusColors = {
    'Pré-reserva': 'bg-yellow-400 text-yellow-800',
    'Confirmada': 'bg-sky-500 text-white',
    'Em andamento': 'bg-blue-600 text-white',
    'Finalizada': 'bg-green-500 text-white',
    'Cancelada': 'bg-red-500 text-white',
    'No show': 'bg-purple-500 text-white',
    'Arquivada': 'bg-slate-500 text-white',
    'Excluida': 'bg-gray-700 text-white',
};


// --- PONTO DE ENTRADA PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
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

    const loginButton = document.getElementById('login-button');
    if (loginButton) {
        loginButton.addEventListener('click', () => {
            auth.signInWithPopup(provider).catch(error => console.error("Erro no login:", error));
        });
    }
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
    document.getElementById('reservation-form').addEventListener('submit', handleAddOrUpdateReservation);
    document.getElementById('payment-form').addEventListener('submit', handleRegisterPayment);
    document.getElementById('transaction-form').addEventListener('submit', handleSaveTransaction);
}

function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

function listenForData() {
    db.collection('financial_transactions').where('status', '==', 'active').orderBy('date', 'desc').onSnapshot(snapshot => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateAllUI();
    }, error => console.error("Erro ao buscar transações:", error));

    // Listener para reservas visíveis (não excluídas ou arquivadas)
    db.collection('reservations').where('status', 'not-in', ['Excluida', 'Arquivada']).onSnapshot(snapshot => {
        reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar();
        renderReservationsTable(); // Renderiza a nova tabela
        updateAllUI();
    }, error => console.error("Erro ao buscar reservas:", error));
}

// --- ATUALIZAÇÃO DA INTERFACE (UI) ---
function updateAllUI() {
    const activeReservations = reservations.filter(res => res.status !== 'Excluida');
    const financialSummary = calculateFinancialSummary(transactions);
    const forecast = calculateForecast(activeReservations);
    
    updateDashboardUI(financialSummary, forecast);
    updateFinancialChart(financialSummary);
    renderTransactionsTable(transactions);
}


// --- LÓGICA FINANCEIRA ---
function calculateFinancialSummary(allTransactions) {
    const summary = { confirmedRevenue: 0, condominiumExpenses: 0, totalExpenses: 0 };
    allTransactions.forEach(tx => {
        const amount = Math.abs(tx.amount);
        if (tx.type === 'revenue') summary.confirmedRevenue += amount;
        else if (tx.type === 'expense') {
            summary.totalExpenses += amount;
            if (tx.category === 'Condomínio') summary.condominiumExpenses += amount;
        }
    });
    return { ...summary, cashBalance: summary.confirmedRevenue - summary.totalExpenses, netProfitToDivide: summary.confirmedRevenue - summary.condominiumExpenses };
}

function calculateForecast(allReservations) {
    // Apenas reservas confirmadas ou em andamento geram previsão
    const forecastableReservations = allReservations.filter(res => ['Confirmada', 'Em andamento', 'Pré-reserva'].includes(res.status));
    return forecastableReservations.reduce((total, res) => {
        const amountDue = (res.totalValue || 0) - (res.amountPaid || 0);
        return total + (amountDue > 0 ? amountDue : 0);
    }, 0);
}

function updateDashboardUI(summary, forecast) {
    const el = id => document.getElementById(id);
    el('cashBalance').textContent = formatCurrency(summary.cashBalance);
    el('netProfit').textContent = formatCurrency(summary.netProfitToDivide);
    el('confirmedRevenue').textContent = formatCurrency(summary.confirmedRevenue);
    el('condominiumExpenses').textContent = formatCurrency(summary.condominiumExpenses * -1);
    el('forecast').textContent = formatCurrency(forecast);
}

function updateFinancialChart(summary) {
    const ctx = document.getElementById('financialCompositionChart')?.getContext('2d');
    if (!ctx) return;
    const chartData = {
        labels: ['Receita Confirmada', 'Despesas Condomínio'],
        datasets: [{ data: [summary.confirmedRevenue, summary.condominiumExpenses], backgroundColor: ['#22c55e', '#ef4444'], borderColor: '#f0f4f8', borderWidth: 4 }]
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
    tableBody.innerHTML = allTransactions.map(tx => `
        <tr class="hover:bg-slate-50 group">
            <td class="p-3">${tx.description}</td>
            <td class="p-3 font-medium ${tx.type === 'revenue' ? 'text-green-600' : 'text-red-600'}">${tx.type === 'revenue' ? '+' : '-'} ${formatCurrency(Math.abs(tx.amount))}</td>
            <td class="p-3 text-slate-600">${tx.category || 'N/A'}</td>
            <td class="p-3 text-slate-600">${tx.date.toDate().toLocaleDateString('pt-BR')}</td>
            <td class="p-3 text-right">
                <button onclick="confirmDeleteTransaction('${tx.id}')" class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `).join('');
}


// --- LÓGICA DE RESERVAS E PAGAMENTOS ---
function renderReservationsTable() {
    const tableBody = document.getElementById('reservations-table-body');
    if (!tableBody) return;

    const sortedReservations = [...reservations].sort((a,b) => b.startDate.toDate() - a.startDate.toDate());

    tableBody.innerHTML = sortedReservations.map(res => {
        const status = res.status || 'N/D';
        const colorClass = statusColors[status] || 'bg-gray-400 text-white';

        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-medium">${res.guestName}</td>
                <td class="p-3">${res.startDate.toDate().toLocaleDateString('pt-BR')} - ${res.endDate.toDate().toLocaleDateString('pt-BR')}</td>
                <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${colorClass}">${status}</span></td>
                <td class="p-3 text-right">${formatCurrency(res.totalValue)}</td>
                <td class="p-3 text-right">
                    <button onclick="openReservationModal('${res.id}')" class="text-sky-600 hover:text-sky-800 font-medium">Editar</button>
                </td>
            </tr>
        `
    }).join('');
}

async function handleAddOrUpdateReservation(event) {
    event.preventDefault();
    const form = event.target;
    const reservationId = form['reservation-id'].value;

    const reservationData = {
        guestName: form['res-guest-name'].value.trim(),
        propertyId: form['res-property'].value,
        startDate: new Date(form['res-start-date'].value + 'T00:00:00'),
        endDate: new Date(form['res-end-date'].value + 'T00:00:00'),
        totalValue: parseFloat(form['res-total-value'].value),
        status: form['res-status'].value, // Captura o status do formulário
    };

    if (!reservationData.guestName || !reservationData.startDate || !reservationData.endDate || isNaN(reservationData.totalValue)) {
        alert("Por favor, preencha todos os campos corretamente."); return;
    }
    if (reservationData.endDate < reservationData.startDate) {
        alert("A data de saída não pode ser anterior à data de entrada."); return;
    }

    try {
        const dataToSave = {
            ...reservationData,
            startDate: firebase.firestore.Timestamp.fromDate(reservationData.startDate),
            endDate: firebase.firestore.Timestamp.fromDate(reservationData.endDate),
        };

        if (reservationId) {
            await db.collection('reservations').doc(reservationId).update(dataToSave);
        } else {
            dataToSave.amountPaid = 0; // Novas reservas começam com 0 pago
            if (!dataToSave.status) dataToSave.status = 'Pré-reserva'; // Status padrão para novas reservas
            await db.collection('reservations').add(dataToSave);
        }
        closeModal('reservation-modal');
    } catch (error) {
        console.error("Erro ao salvar reserva: ", error);
        alert("Não foi possível salvar a reserva. Tente novamente.");
    }
}

async function handleRegisterPayment(event) {
    event.preventDefault();
    const form = event.target;
    const reservationId = form['payment-reservation-id'].value;
    const paymentAmount = parseFloat(form['payment-amount'].value);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        alert("Por favor, insira um valor de pagamento válido."); return;
    }

    const reservationRef = db.collection('reservations').doc(reservationId);
    
    try {
        await db.runTransaction(async (transaction) => {
            const resDoc = await transaction.get(reservationRef);
            if (!resDoc.exists) throw "Reserva não encontrada!";
            
            const reservationData = resDoc.data();
            const newAmountPaid = (reservationData.amountPaid || 0) + paymentAmount;

            const financialTransaction = {
                description: `Pagamento Reserva - ${reservationData.guestName}`, amount: paymentAmount, date: firebase.firestore.Timestamp.now(),
                type: 'revenue', category: 'Receita de Aluguel', reservationId: reservationId, status: 'active'
            };
            transaction.set(db.collection('financial_transactions').doc(), financialTransaction);
            
            // Atualiza o valor pago e, se for o primeiro pagamento, muda o status para Confirmada
            const updateData = { amountPaid: newAmountPaid };
            if (reservationData.status === 'Pré-reserva') {
                updateData.status = 'Confirmada';
            }
            transaction.update(reservationRef, updateData);
        });
        closeModal('payment-modal');
    } catch (error) {
        console.error("Erro ao registrar pagamento: ", error);
        alert("Ocorreu um erro ao registrar o pagamento. Tente novamente.");
    }
}


// --- LÓGICA DE TRANSAÇÕES MANUAIS ---
async function handleSaveTransaction(event) {
    event.preventDefault();
    const form = event.target;
    const type = form['transaction-type'].value;
    const amount = parseFloat(form['tx-amount'].value);
    if (isNaN(amount) || amount <= 0) { alert('Por favor, insira um valor válido.'); return; }
    const transactionData = {
        description: form['tx-description'].value.trim(), amount: amount,
        date: firebase.firestore.Timestamp.fromDate(new Date(form['tx-date'].value + 'T00:00:00')),
        type: type, category: type === 'expense' ? form['tx-category'].value : 'Receita Avulsa', status: 'active'
    };
    try {
        await db.collection('financial_transactions').add(transactionData);
        closeModal('transaction-modal');
    } catch (error) {
        console.error("Erro ao salvar transação: ", error);
        alert("Não foi possível salvar a transação. Tente novamente.");
    }
}

function confirmDeleteTransaction(transactionId) {
    if (confirm("Tem certeza que deseja excluir este lançamento?")) {
        softDeleteTransaction(transactionId);
    }
}

async function softDeleteTransaction(transactionId) {
    const user = auth.currentUser;
    if (!user) { alert("Você precisa estar logado para excluir um lançamento."); return; }
    try {
        await db.collection('financial_transactions').doc(transactionId).update({
            status: 'deleted', deletedAt: firebase.firestore.FieldValue.serverTimestamp(), deletedBy: user.email
        });
    } catch (error) {
        console.error("Erro ao excluir lançamento: ", error);
        alert("Não foi possível excluir o lançamento.");
    }
}


// --- FUNÇÕES DE RENDERIZAÇÃO DO CALENDÁRIO ---
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
        dayCell.className = 'calendar-day border rounded-md p-2 flex flex-col bg-white hover:bg-sky-50 transition-colors';
        dayCell.innerHTML = `<span class="font-medium self-start">${day}</span><div class="events-container flex-grow space-y-1 mt-1 overflow-hidden"></div>`;
        dayCell.addEventListener('click', (e) => {
            if (e.target.closest('.event-chip')) return;
            openReservationModal(null, today.toISOString().split('T')[0]);
        });
        const eventsContainer = dayCell.querySelector('.events-container');
        const dayReservations = reservations.filter(res => {
            const start = res.startDate.toDate(); start.setHours(0,0,0,0);
            const end = res.endDate.toDate(); end.setHours(0,0,0,0);
            return today >= start && today <= end;
        });
        dayReservations.forEach(res => {
            const colorClass = statusColors[res.status] || 'bg-gray-400 text-white';
            const eventDiv = document.createElement('div');
            eventDiv.className = `event-chip text-white text-xs p-1 rounded-md truncate cursor-pointer ${colorClass}`;
            eventDiv.textContent = res.guestName;
            eventDiv.addEventListener('click', () => openReservationModal(res.id));
            eventsContainer.appendChild(eventDiv);
        });
        grid.appendChild(dayCell);
    }
}

// --- FUNÇÕES DE MODAL ---
function openReservationModal(reservationId = null, startDate = null) {
    const modal = document.getElementById('reservation-modal');
    const form = document.getElementById('reservation-form');
    form.reset();
    document.getElementById('reservation-id').value = reservationId || '';
    const financialSection = document.getElementById('financial-details-section');

    if (reservationId) {
        const reservation = reservations.find(r => r.id === reservationId);
        if (reservation) {
            form['res-guest-name'].value = reservation.guestName;
            form['res-property'].value = reservation.propertyId;
            form['res-start-date'].value = reservation.startDate.toDate().toISOString().split('T')[0];
            form['res-end-date'].value = reservation.endDate.toDate().toISOString().split('T')[0];
            form['res-total-value'].value = reservation.totalValue;
            form['res-status'].value = reservation.status || 'Pré-reserva'; // Define o status
            document.getElementById('reservation-modal-title').textContent = "Editar Reserva";
            
            const amountPaid = reservation.amountPaid || 0;
            document.getElementById('details-total').textContent = formatCurrency(reservation.totalValue);
            document.getElementById('details-paid').textContent = formatCurrency(amountPaid);
            document.getElementById('details-due').textContent = formatCurrency(reservation.totalValue - amountPaid);
            document.getElementById('register-payment-btn').onclick = () => openPaymentModal(reservationId);
            financialSection.classList.remove('hidden');
        }
    } else {
        document.getElementById('reservation-modal-title').textContent = "Nova Reserva";
        financialSection.classList.add('hidden');
        if (startDate) form['res-start-date'].value = startDate;
    }
    modal.classList.remove('hidden');
}

function openPaymentModal(reservationId) {
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) return;
    const modal = document.getElementById('payment-modal');
    const form = document.getElementById('payment-form');
    form.reset();
    const amountDue = reservation.totalValue - (reservation.amountPaid || 0);
    document.getElementById('payment-reservation-id').value = reservationId;
    document.getElementById('payment-guest-name').textContent = reservation.guestName;
    document.getElementById('payment-amount').value = amountDue > 0 ? amountDue.toFixed(2) : '0.00';
    closeModal('reservation-modal');
    modal.classList.remove('hidden');
}

function openTransactionModal(type) {
    const modal = document.getElementById('transaction-modal');
    const form = document.getElementById('transaction-form');
    form.reset();
    document.getElementById('transaction-type').value = type;
    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    const title = document.getElementById('transaction-modal-title');
    const categoryWrapper = document.getElementById('category-wrapper');
    const submitButton = document.getElementById('transaction-submit-button');
    if (type === 'revenue') {
        title.textContent = 'Nova Receita Avulsa';
        categoryWrapper.classList.add('hidden');
        document.getElementById('tx-category').required = false;
        submitButton.className = "bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition-colors";
    } else {
        title.textContent = 'Nova Despesa';
        categoryWrapper.classList.remove('hidden');
        document.getElementById('tx-category').required = true;
        submitButton.className = "bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors";
    }
    modal.classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.add('hidden');
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => { tab.classList.remove('active'); tab.style.display = 'none'; });
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    
    const newTab = document.getElementById(`${tabId}-tab`);
    if(newTab) {
        newTab.classList.add('active');
        newTab.style.display = 'block';
    }
    
    const newButton = document.querySelector(`button[onclick="showTab('${tabId}')"]`);
    if(newButton) newButton.classList.add('active');
}

function formatCurrency(value) {
    const numberValue = Number(value) || 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numberValue);
}