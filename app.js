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
let settings = {}; // Novo estado para configurações
let financialChart = null;
const statusColors = {'Pré-reserva': 'bg-yellow-400 text-yellow-800','Confirmada': 'bg-sky-500 text-white','Em andamento': 'bg-blue-600 text-white','Finalizada': 'bg-green-500 text-white','Cancelada': 'bg-red-500 text-white','No show': 'bg-purple-500 text-white','Arquivada': 'bg-slate-500 text-white','Excluida': 'bg-gray-700 text-white'};

// --- PONTO DE ENTRADA E EVENTOS ---
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
    if (loginButton) loginButton.addEventListener('click', () => auth.signInWithPopup(provider).catch(console.error));
});

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
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
}

function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

function listenForData() {
    db.collection('settings').doc('main').onSnapshot(doc => {
        if (doc.exists) {
            settings = doc.data();
            populateSettingsForm();
            updateAllUI();
        }
    }, console.error);

    db.collection('financial_transactions').where('status', '==', 'active').orderBy('date', 'desc').onSnapshot(snapshot => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateAllUI();
    }, console.error);

    db.collection('reservations').where('status', 'not-in', ['Excluida', 'Arquivada']).onSnapshot(snapshot => {
        reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar();
        renderReservationsTable();
        updateAllUI();
    }, console.error);
}

// --- FUNÇÕES DE ATUALIZAÇÃO DE UI ---
function updateAllUI() {
    const financials = calculateAllFinancials();
    if (Object.keys(financials).length === 0) return;

    const forecast = calculateForecast(reservations);
    
    updateDashboardUI(financials, forecast);
    updateFinancialChart(financials);
    renderTransactionsTable(transactions);
    renderSettlementTab(financials);
}

function updateDashboardUI(financials, forecast) {
    const el = id => document.getElementById(id);

    // Cards Principais
    el('fundoCaixa').textContent = formatCurrency(financials.fundoCaixa);
    el('cashBalance').textContent = formatCurrency(financials.cashBalance);
    el('forecast').textContent = formatCurrency(forecast);

    // Detalhamento
    el('confirmedRevenue').textContent = formatCurrency(financials.confirmedRevenue);
    el('condominiumExpenses').textContent = formatCurrency(financials.condominiumExpenses * -1);
}

function updateFinancialChart(financials) {
    const ctx = document.getElementById('financialCompositionChart')?.getContext('2d'); if (!ctx) return;
    const chartData = {
        labels: ['Cota Arthur', 'Cota Lucas', 'Fundo de Caixa', 'Despesas Cond.'],
        datasets: [{
            data: [financials.cotaArthur, financials.cotaLucas, financials.fundoCaixa, financials.condominiumExpenses],
            backgroundColor: ['#38bdf8', '#34d399', '#a78bfa', '#f87171'],
            borderColor: '#f0f4f8', borderWidth: 4
        }]
    };
    if (financialChart) { financialChart.data = chartData; financialChart.update(); }
    else { financialChart = new Chart(ctx, { type: 'doughnut', data: chartData, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' } }); }
}

function renderSettlementTab(financials) {
    document.getElementById('arthur-share').textContent = formatCurrency(financials.cotaArthur);
    document.getElementById('arthur-expenses').textContent = formatCurrency(financials.arthurExpenses);
    document.getElementById('arthur-balance').textContent = formatCurrency(financials.saldoAReceberArthur);

    document.getElementById('lucas-share').textContent = formatCurrency(financials.cotaLucas);
    document.getElementById('lucas-expenses').textContent = formatCurrency(financials.lucasExpenses);
    document.getElementById('lucas-balance').textContent = formatCurrency(financials.saldoAReceberLucas);
}

// --- LÓGICA FINANCEIRA ---
function calculateAllFinancials() {
    if (!settings.shareArthur) return {};

    const confirmedRevenue = transactions.filter(t => t.type === 'revenue').reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const allExpenses = transactions.filter(t => t.type === 'expense');
    const totalExpenses = allExpenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const condominiumExpenses = allExpenses.filter(t => t.category === 'Condomínio').reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const arthurExpenses = allExpenses.filter(t => t.category === 'Pessoal - Arthur').reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const lucasExpenses = allExpenses.filter(t => t.category === 'Pessoal - Lucas').reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const cotaArthur = confirmedRevenue * (settings.shareArthur / 100);
    const cotaLucas = confirmedRevenue * (settings.shareLucas / 100);
    const fundoCaixa = confirmedRevenue * (settings.shareFundoCaixa / 100);
    const saldoAReceberArthur = cotaArthur - arthurExpenses;
    const saldoAReceberLucas = cotaLucas - lucasExpenses;
    const cashBalance = confirmedRevenue - totalExpenses;
    const netProfitToDivide = cotaArthur + cotaLucas - condominiumExpenses;

    return { confirmedRevenue, condominiumExpenses, cashBalance, netProfitToDivide, cotaArthur, cotaLucas, fundoCaixa, arthurExpenses, lucasExpenses, saldoAReceberArthur, saldoAReceberLucas };
}

function calculateForecast(allReservations) {
    const directForecast = allReservations.filter(res => res.sourcePlatform === 'Direto' && ['Confirmada', 'Em andamento', 'Pré-reserva'].includes(res.status)).reduce((total, res) => total + Math.max(0, (res.totalValue || 0) - (res.amountPaid || 0)), 0);
    const platformForecast = allReservations.filter(res => res.sourcePlatform === 'Airbnb' && !res.isPayoutConfirmed).reduce((total, res) => total + (res.totalValue || 0), 0);
    return directForecast + platformForecast;
}

// --- FUNÇÕES DE RENDERIZAÇÃO DE TABELAS ---
function renderTransactionsTable(allTransactions) {
    const tableBody = document.getElementById('transactions-table-body'); if (!tableBody) return;
    tableBody.innerHTML = allTransactions.map(tx => `
        <tr class="hover:bg-slate-50 group">
            <td class="p-3">${tx.description}</td><td class="p-3 font-medium ${tx.type === 'revenue' ? 'text-green-600' : 'text-red-600'}">${tx.type === 'revenue' ? '+' : '-'} ${formatCurrency(Math.abs(tx.amount))}</td>
            <td class="p-3 text-slate-600">${tx.category || 'N/A'}</td><td class="p-3 text-slate-600">${tx.date.toDate().toLocaleDateString('pt-BR')}</td>
            <td class="p-3 text-right"><button onclick="confirmDeleteTransaction('${tx.id}')" class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><i class="fas fa-trash-alt"></i></button></td>
        </tr>`).join('');
}

function renderReservationsTable() {
    const tableBody = document.getElementById('reservations-table-body'); if (!tableBody) return;
    const sortedReservations = [...reservations].sort((a,b) => b.startDate.toDate() - a.startDate.toDate());
    tableBody.innerHTML = sortedReservations.map(res => {
        const colorClass = statusColors[res.status || 'N/D'] || 'bg-gray-400';
        let actionButton = `<button onclick="openReservationModal('${res.id}')" class="text-sky-600 hover:text-sky-800 font-medium">Editar</button>`;
        if (res.sourcePlatform === 'Airbnb' && !res.isPayoutConfirmed) {
            actionButton = `<button onclick="confirmPlatformPayout('${res.id}')" class="bg-green-500 text-white text-xs font-bold py-1 px-2 rounded-md hover:bg-green-600">Confirmar Recebimento</button>`;
        }
        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-medium">${res.guestName}</td><td class="p-3">${res.startDate.toDate().toLocaleDateString('pt-BR')} - ${res.endDate.toDate().toLocaleDateString('pt-BR')}</td>
                <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${colorClass}">${res.status || 'N/D'}</span></td>
                <td class="p-3 text-right">${formatCurrency(res.totalValue)}</td><td class="p-3 text-right">${actionButton}</td>
            </tr>`;
    }).join('');
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid'); const display = document.getElementById('current-month-year'); if (!grid || !display) return;
    grid.innerHTML = ''; const year = currentDate.getFullYear(); const month = currentDate.getMonth();
    display.textContent = `${currentDate.toLocaleString('pt-BR', { month: 'long' })} ${year}`; const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) grid.insertAdjacentHTML('beforeend', '<div class="border rounded-md bg-slate-50"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
        const today = new Date(year, month, day); const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day border rounded-md p-2 flex flex-col bg-white hover:bg-sky-50';
        dayCell.innerHTML = `<span class="font-medium self-start">${day}</span><div class="events-container flex-grow space-y-1 mt-1 overflow-hidden"></div>`;
        dayCell.addEventListener('click', (e) => { if (e.target.closest('.event-chip')) return; openReservationModal(null, today.toISOString().split('T')[0]); });
        const eventsContainer = dayCell.querySelector('.events-container');
        const dayReservations = reservations.filter(res => { const start = res.startDate.toDate(); start.setHours(0,0,0,0); const end = res.endDate.toDate(); end.setHours(0,0,0,0); return today >= start && today <= end; });
        dayReservations.forEach(res => {
            const colorClass = statusColors[res.status] || 'bg-gray-400';
            const eventDiv = document.createElement('div'); eventDiv.className = `event-chip text-white text-xs p-1 rounded-md truncate cursor-pointer ${colorClass}`;
            eventDiv.textContent = res.guestName; eventDiv.addEventListener('click', () => openReservationModal(res.id)); eventsContainer.appendChild(eventDiv);
        });
        grid.appendChild(dayCell);
    }
}


// --- FUNÇÕES DE MANIPULAÇÃO DE DADOS (HANDLERS) ---
async function handleSaveSettings(event) {
    event.preventDefault();
    const newSettings = {
        shareArthur: parseFloat(document.getElementById('setting-share-arthur').value),
        shareLucas: parseFloat(document.getElementById('setting-share-lucas').value),
        shareFundoCaixa: parseFloat(document.getElementById('setting-share-caixa').value),
        fundoReservaFixo: parseFloat(document.getElementById('setting-reserve-fund').value)
    };
    const totalShare = newSettings.shareArthur + newSettings.shareLucas + newSettings.shareFundoCaixa;
    if (Math.abs(totalShare - 100) > 0.01) { alert("A soma das porcentagens de divisão deve ser exatamente 100%."); return; }

    try {
        await db.collection('settings').doc('main').set(newSettings, { merge: true });
        alert("Configurações salvas com sucesso!");
    } catch (error) { console.error("Erro ao salvar configurações:", error); alert("Não foi possível salvar as configurações."); }
}

async function handleAddOrUpdateReservation(event) {
    event.preventDefault(); const form = event.target; const reservationId = form['reservation-id'].value;
    const totalValue = parseFloat(form['res-total-value'].value); const sourcePlatform = form['res-source-platform'].value;
    let reservationData = {
        guestName: form['res-guest-name'].value.trim(), propertyId: form['res-property'].value,
        startDate: new Date(form['res-start-date'].value + 'T00:00:00'), endDate: new Date(form['res-end-date'].value + 'T00:00:00'),
        totalValue: totalValue, status: form['res-status'].value, sourcePlatform: sourcePlatform,
    };
    if (sourcePlatform === 'Airbnb') { reservationData.amountPaid = totalValue; reservationData.isPayoutConfirmed = false; }
    try {
        const dataToSave = {...reservationData, startDate: firebase.firestore.Timestamp.fromDate(reservationData.startDate), endDate: firebase.firestore.Timestamp.fromDate(reservationData.endDate)};
        if (reservationId) { await db.collection('reservations').doc(reservationId).update(dataToSave); }
        else {
            if (!dataToSave.amountPaid) dataToSave.amountPaid = 0; if (!dataToSave.status) dataToSave.status = 'Pré-reserva';
            await db.collection('reservations').add(dataToSave);
        }
        closeModal('reservation-modal');
    } catch (error) { console.error("Erro ao salvar reserva: ", error); alert("Não foi possível salvar a reserva."); }
}

async function handleRegisterPayment(event) {
    event.preventDefault(); const form = event.target; const reservationId = form['payment-reservation-id'].value;
    const paymentAmount = parseFloat(form['payment-amount'].value); if (isNaN(paymentAmount) || paymentAmount <= 0) { alert("Valor inválido."); return; }
    const reservationRef = db.collection('reservations').doc(reservationId);
    try {
        await db.runTransaction(async (transaction) => {
            const resDoc = await transaction.get(reservationRef); if (!resDoc.exists) throw "Reserva não encontrada!";
            const resData = resDoc.data();
            const updateData = { amountPaid: (resData.amountPaid || 0) + paymentAmount };
            if (resData.status === 'Pré-reserva') updateData.status = 'Confirmada';
            transaction.set(db.collection('financial_transactions').doc(), {
                description: `Pagamento Reserva - ${resData.guestName}`, amount: paymentAmount, date: firebase.firestore.Timestamp.now(),
                type: 'revenue', category: 'Receita de Aluguel', reservationId: reservationId, status: 'active'
            });
            transaction.update(reservationRef, updateData);
        });
        closeModal('payment-modal');
    } catch (error) { console.error("Erro ao registrar pagamento: ", error); alert("Ocorreu um erro."); }
}

async function confirmPlatformPayout(reservationId) {
    if (!confirm("Isso irá mover o valor da reserva para 'Receita Confirmada'. Deseja continuar?")) return;
    const reservationRef = db.collection('reservations').doc(reservationId);
    try {
        const resDoc = await reservationRef.get(); if (!resDoc.exists) throw "Reserva não encontrada!";
        const resData = resDoc.data();
        await db.collection('financial_transactions').add({
            description: `Recebimento Plataforma - ${resData.guestName} (${resData.sourcePlatform})`,
            amount: resData.totalValue, date: firebase.firestore.Timestamp.now(), type: 'revenue',
            category: 'Receita de Plataforma', reservationId: reservationId, status: 'active'
        });
        await reservationRef.update({ isPayoutConfirmed: true });
    } catch (error) { console.error("Erro ao confirmar recebimento: ", error); alert("Ocorreu um erro."); }
}

async function handleSaveTransaction(event) {
    event.preventDefault(); const form = event.target; const type = form['transaction-type'].value;
    const amount = parseFloat(form['tx-amount'].value); if (isNaN(amount) || amount <= 0) { alert('Valor inválido.'); return; }
    const transactionData = { description: form['tx-description'].value.trim(), amount: amount, date: firebase.firestore.Timestamp.fromDate(new Date(form['tx-date'].value + 'T00:00:00')), type: type, category: type === 'expense' ? form['tx-category'].value : 'Receita Avulsa', status: 'active' };
    try { await db.collection('financial_transactions').add(transactionData); closeModal('transaction-modal'); }
    catch (error) { console.error("Erro ao salvar transação: ", error); alert("Não foi possível salvar."); }
}

function confirmDeleteTransaction(transactionId) { if (confirm("Tem certeza?")) softDeleteTransaction(transactionId); }
async function softDeleteTransaction(transactionId) {
    const user = auth.currentUser; if (!user) { alert("Você precisa estar logado."); return; }
    try { await db.collection('financial_transactions').doc(transactionId).update({ status: 'deleted', deletedAt: firebase.firestore.FieldValue.serverTimestamp(), deletedBy: user.email }); }
    catch (error) { console.error("Erro ao excluir: ", error); alert("Não foi possível excluir."); }
}


// --- FUNÇÕES DE MODAL E UTILITÁRIAS ---
function openReservationModal(reservationId = null, startDate = null) {
    const modal = document.getElementById('reservation-modal'); const form = document.getElementById('reservation-form'); form.reset();
    document.getElementById('reservation-id').value = reservationId || '';
    const financialSection = document.getElementById('financial-details-section'); const paymentButtonWrapper = document.getElementById('payment-button-wrapper');
    if (reservationId) {
        const reservation = reservations.find(r => r.id === reservationId);
        if (reservation) {
            form['res-guest-name'].value = reservation.guestName; form['res-property'].value = reservation.propertyId;
            form['res-start-date'].value = reservation.startDate.toDate().toISOString().split('T')[0];
            form['res-end-date'].value = reservation.endDate.toDate().toISOString().split('T')[0];
            form['res-total-value'].value = reservation.totalValue; form['res-status'].value = reservation.status || 'Pré-reserva';
            form['res-source-platform'].value = reservation.sourcePlatform || 'Direto';
            document.getElementById('reservation-modal-title').textContent = "Editar Reserva";
            const amountPaid = reservation.amountPaid || 0;
            document.getElementById('details-total').textContent = formatCurrency(reservation.totalValue);
            document.getElementById('details-paid').textContent = formatCurrency(amountPaid);
            document.getElementById('details-due').textContent = formatCurrency(reservation.totalValue - amountPaid);
            document.getElementById('register-payment-btn').onclick = () => openPaymentModal(reservationId);
            financialSection.classList.remove('hidden');
            if(reservation.sourcePlatform !== 'Direto') paymentButtonWrapper.classList.add('hidden');
            else paymentButtonWrapper.classList.remove('hidden');
        }
    } else {
        document.getElementById('reservation-modal-title').textContent = "Nova Reserva"; financialSection.classList.add('hidden');
        if (startDate) form['res-start-date'].value = startDate;
    }
    modal.classList.remove('hidden');
}

function openPaymentModal(reservationId) {
    const reservation = reservations.find(r => r.id === reservationId); if (!reservation) return;
    const modal = document.getElementById('payment-modal'); const form = document.getElementById('payment-form'); form.reset();
    const amountDue = reservation.totalValue - (reservation.amountPaid || 0);
    document.getElementById('payment-reservation-id').value = reservationId;
    document.getElementById('payment-guest-name').textContent = reservation.guestName;
    document.getElementById('payment-amount').value = amountDue > 0 ? amountDue.toFixed(2) : '0.00';
    closeModal('reservation-modal'); modal.classList.remove('hidden');
}

function openTransactionModal(type) {
    const modal = document.getElementById('transaction-modal'); const form = document.getElementById('transaction-form'); form.reset();
    document.getElementById('transaction-type').value = type; document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    const title = document.getElementById('transaction-modal-title'); const categoryWrapper = document.getElementById('category-wrapper');
    const submitButton = document.getElementById('transaction-submit-button');
    if (type === 'revenue') {
        title.textContent = 'Nova Receita Avulsa'; categoryWrapper.classList.add('hidden');
        document.getElementById('tx-category').required = false; submitButton.className = "bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600";
    } else {
        title.textContent = 'Nova Despesa'; categoryWrapper.classList.remove('hidden');
        document.getElementById('tx-category').required = true; submitButton.className = "bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600";
    }
    modal.classList.remove('hidden');
}

function populateSettingsForm() {
    if (!settings) return;
    document.getElementById('setting-share-arthur').value = settings.shareArthur || 0;
    document.getElementById('setting-share-lucas').value = settings.shareLucas || 0;
    document.getElementById('setting-share-caixa').value = settings.shareFundoCaixa || 0;
    document.getElementById('setting-reserve-fund').value = settings.fundoReservaFixo || 0;
}

function closeModal(modalId) { document.getElementById(modalId)?.classList.add('hidden'); }

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => { tab.classList.remove('active'); tab.style.display = 'none'; });
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    const newTab = document.getElementById(`${tabId}-tab`); if(newTab) { newTab.classList.add('active'); newTab.style.display = 'block'; }
    const newButton = document.querySelector(`button[onclick="showTab('${tabId}')"]`); if(newButton) newButton.classList.add('active');
}

function formatCurrency(value) {
    const numberValue = Number(value) || 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numberValue);
}