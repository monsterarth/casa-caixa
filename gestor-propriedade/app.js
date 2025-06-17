import { auth, db, provider, Timestamp } from './firebase-config.js';
import { 
    updateAllUI, renderCalendar, openReservationModal, openPaymentModal, 
    openTransactionModal, closeModal, showTab, populateReserveFund, 
    renderReservationsTable, renderTransactionsTable, renderClientsTable, // Adicionado renderClientsTable
    openClientModal, openDeleteReservationModal, openForecastDetailsModal, updateShareControls
} from './ui.js';

// --- ESTADO GLOBAL DO APP ---
let currentDate = new Date();
let reservations = [];
let transactions = [];
let clients = [];
let settings = {};
let isUpdatingShares = false; // NOVO: Trava para evitar loops nos sliders

// --- LÓGICA DE CÁLCULO (sem alterações) ---
function calculateFinancialSummary(allTransactions) {
    const summary = { confirmedRevenue: 0, condominiumExpenses: 0, personalArthur: 0, personalLucas: 0, totalExpenses: 0 };
    allTransactions.forEach(tx => {
        if (tx.type === 'revenue') { summary.confirmedRevenue += tx.amount; } 
        else if (tx.type === 'expense') {
            summary.totalExpenses += tx.amount;
            if (tx.category === 'Condomínio') summary.condominiumExpenses += tx.amount;
            else if (tx.category === 'Pessoal - Arthur') summary.personalArthur += tx.amount;
            else if (tx.category === 'Pessoal - Lucas') summary.personalLucas += tx.amount;
        }
    });
    summary.cashBalance = summary.confirmedRevenue - summary.totalExpenses;
    summary.netProfitToDivide = summary.confirmedRevenue - summary.condominiumExpenses;
    return summary;
}
function calculateForecast(allReservations) {
    return allReservations.filter(r => r.status !== 'Cancelada').reduce((total, res) => {
        const amountDue = (res.totalValue || 0) - (res.amountPaid || 0);
        return total + (amountDue > 0 ? amountDue : 0);
    }, 0);
}
function calculateSettlement(summary, appSettings) {
    const netProfit = summary.netProfitToDivide > 0 ? summary.netProfitToDivide : 0;
    const shareCaixaPercent = appSettings.shareFundoCaixa || 0;
    const shareArthurPercent = appSettings.shareArthur || 0;
    const shareLucasPercent = appSettings.shareLucas || 0;
    const valorParaCaixa = netProfit * (shareCaixaPercent / 100);
    const lucroParaSocios = netProfit - valorParaCaixa;
    const cotaArthur = lucroParaSocios * (shareArthurPercent / 100);
    const cotaLucas = lucroParaSocios * (shareLucasPercent / 100);
    return { cotaArthur, despesasArthur: summary.personalArthur, saldoFinalArthur: cotaArthur - summary.personalArthur, cotaLucas, despesasLucas: summary.personalLucas, saldoFinalLucas: cotaLucas - summary.personalLucas, fundoCaixaTeorico: (summary.cashBalance - (cotaArthur - summary.personalArthur) - (cotaLucas - summary.personalLucas)) };
}
function calculateKPIs(allReservations, targetDate) {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let occupiedDays = 0;
    let totalRevenueFromMonth = 0;
    const confirmedReservations = allReservations.filter(r => r.status === 'Confirmada' || r.status === 'Em andamento' || r.status === 'Finalizada');
    const monthlyOccupancy = new Set();
    confirmedReservations.forEach(res => {
        const start = res.startDate.toDate();
        const end = res.endDate.toDate();
        let currentDay = new Date(start);
        while(currentDay < end) {
             if(currentDay.getFullYear() === year && currentDay.getMonth() === month) { monthlyOccupancy.add(currentDay.getDate()); }
             currentDay.setDate(currentDay.getDate() + 1);
        }
    });
    occupiedDays = monthlyOccupancy.size;
    totalRevenueFromMonth = confirmedReservations.filter(res => res.startDate.toDate().getMonth() === month && res.startDate.toDate().getFullYear() === year).reduce((sum, res) => sum + res.totalValue, 0);
    const occupancyRate = (occupiedDays / daysInMonth) * 100;
    const adr = occupiedDays > 0 ? totalRevenueFromMonth / occupiedDays : 0;
    return { occupancyRate, adr };
}


// --- HANDLERS DE DADOS ---

async function handleSaveClient(event) {
    event.preventDefault();
    const form = event.target;
    const clientId = form['client-id'].value; // NOVO
    const clientData = {
        name: form['client-name'].value.trim(),
        phone: form['client-phone'].value.trim(),
        notes: form['client-notes'].value.trim()
    };
    try {
        if (clientId) { // Modo Edição
            await db.collection('clients').doc(clientId).update(clientData);
        } else { // Modo Criação
            clientData.createdAt = Timestamp.now();
            const docRef = await db.collection('clients').add(clientData);
            // Seleciona o cliente recém-criado no formulário de reserva, se aplicável
            const clientSelect = document.getElementById('res-client-select');
            if (clientSelect && document.getElementById('reservation-modal').style.display !== 'none') {
                const option = new Option(clientData.name, docRef.id, true, true);
                clientSelect.add(option);
                clientSelect.dispatchEvent(new Event('change'));
            }
        }
        closeModal('client-modal');
    } catch (error) {
        console.error("Erro ao salvar cliente: ", error);
        alert("Não foi possível salvar o cliente.");
    }
}

async function handleSaveReservation(event) {
    event.preventDefault();
    const form = event.target;
    const startDate = new Date(form['res-start-date'].value + 'T00:00:00');
    const endDate = new Date(form['res-end-date'].value + 'T00:00:00');
    if (endDate <= startDate) { alert("A data de saída deve ser posterior à data de entrada."); return; }
    const reservationId = form['reservation-id'].value;
    const reservationData = { clientId: form['res-client-select'].value, propertyId: form['res-property'].value, startDate: Timestamp.fromDate(startDate), endDate: Timestamp.fromDate(endDate), totalValue: parseFloat(form['res-total-value'].value), status: form['res-status'].value, sourcePlatform: form['res-source-platform'].value, observation: form['res-observation'].value.trim() };
    try {
        if (reservationId) {
            await db.collection('reservations').doc(reservationId).update(reservationData);
        } else {
            reservationData.amountPaid = 0;
            reservationData.isPayoutConfirmed = false; 
            await db.collection('reservations').add(reservationData);
        }
        closeModal('reservation-modal');
    } catch (error) { console.error("Erro ao salvar reserva: ", error); }
}

async function handleSaveTransaction(event) {
    event.preventDefault();
    const form = event.target;
    const transactionId = form['transaction-id'].value;
    const type = form['transaction-type'].value;
    const transactionData = { description: form['tx-description'].value, amount: parseFloat(form['tx-amount'].value), date: Timestamp.fromDate(new Date(form['tx-date'].value + 'T00:00:00')), type: type };
    if (type === 'expense') { transactionData.category = form['tx-category'].value; } else { transactionData.category = 'Receita Avulsa'; }
    try {
        if (transactionId) {
            await db.collection('financial_transactions').doc(transactionId).update(transactionData);
        } else {
            await db.collection('financial_transactions').add(transactionData);
        }
        closeModal('transaction-modal');
    } catch (error) { console.error("Erro ao salvar transação: ", error); }
}

async function handleDeleteReservation(event) {
    event.preventDefault();
    const form = event.target;
    const reservationId = form['delete-res-id'].value;
    const action = form['delete-action'].value;
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) { alert("Reserva não encontrada!"); return; }
    try {
        if (action === 'refund' && (reservation.amountPaid || 0) > 0) {
            const client = clients.find(c => c.id === reservation.clientId);
            const refundTransaction = { description: `Estorno Reserva - ${client?.name || 'Cliente Desconhecido'}`, amount: reservation.amountPaid, date: Timestamp.now(), type: 'expense', category: 'Estorno' };
            await db.collection('financial_transactions').add(refundTransaction);
        }
        await db.collection('reservations').doc(reservationId).delete();
        closeModal('delete-reservation-modal');
        alert('Reserva excluída com sucesso.');
    } catch (error) { console.error("Erro ao excluir reserva: ", error); alert("Não foi possível excluir a reserva."); }
}

async function handleDeleteTransaction(id) {
    if (confirm('Tem certeza que deseja excluir este lançamento?')) {
        try { await db.collection('financial_transactions').doc(id).delete(); } catch (error) { console.error("Erro ao excluir transação: ", error); }
    }
}

async function handleSaveSettings(event) {
    event.preventDefault();
    const newSettings = {
        shareArthur: parseFloat(document.getElementById('setting-share-arthur-input').value),
        shareLucas: parseFloat(document.getElementById('setting-share-lucas-input').value),
        shareFundoCaixa: parseFloat(document.getElementById('setting-share-caixa-input').value),
        fundoReservaFixo: parseFloat(document.getElementById('setting-reserve-fund').value)
    };
    const totalShare = newSettings.shareArthur + newSettings.shareLucas + newSettings.shareFundoCaixa;
    if (Math.abs(totalShare - 100) > 0.1) { alert(`A soma das porcentagens deve ser 100%, mas é ${totalShare.toFixed(2)}%. Verifique os valores.`); return; }
    try {
        await db.collection('settings').doc('main').set(newSettings, { merge: true });
        alert('Configurações salvas com sucesso!');
    } catch (error) { console.error("Erro ao salvar configurações: ", error); }
}

// ALTERADO: Lógica dos Sliders completamente refeita para estabilidade e para seguir as regras.
function handleShareChange(source, newValue) {
    if (isUpdatingShares) return; // Trava para evitar loop
    isUpdatingShares = true;

    const newShares = {
        arthur: parseFloat(document.getElementById('setting-share-arthur-input').value),
        lucas: parseFloat(document.getElementById('setting-share-lucas-input').value),
        caixa: parseFloat(document.getElementById('setting-share-caixa-input').value)
    };

    const oldVal = newShares[source];
    const newVal = parseFloat(newValue);
    const delta = newVal - oldVal;

    newShares[source] = newVal; // Aplica a mudança inicial

    if (source === 'arthur' || source === 'lucas') {
        if (delta > 0) { // Aumentando sócio
            if (newShares.caixa >= delta) {
                newShares.caixa -= delta;
            } else {
                newShares[source] = oldVal; // Bloqueia a mudança se o caixa não tiver saldo
            }
        } else { // Diminuindo sócio
            newShares.caixa -= delta; // Delta é negativo, então subtrair aumenta o caixa
        }
    } else if (source === 'caixa') {
        if (delta < 0) { // Diminuindo caixa
            newShares.arthur -= delta / 2;
            newShares.lucas -= delta / 2;
        } else { // Aumentando caixa
            if (newShares.arthur >= delta / 2 && newShares.lucas >= delta / 2) {
                newShares.arthur -= delta / 2;
                newShares.lucas -= delta / 2;
            } else {
                newShares[source] = oldVal; // Bloqueia a mudança
            }
        }
    }
    
    // Normaliza para garantir 100%
    const total = newShares.arthur + newShares.lucas + newShares.caixa;
    if (total !== 100) {
        const excess = total - 100;
        newShares.caixa -= excess; // Ajusta o caixa para forçar 100%
    }
    
    updateShareControls({ shareArthur: newShares.arthur, shareLucas: newShares.lucas, shareFundoCaixa: newShares.caixa });
    isUpdatingShares = false;
}

async function handleConfirmPayout(reservationId) { // Sem alterações
    if (!reservationId) return;
    const reservationRef = db.collection('reservations').doc(reservationId);
    const reservationData = reservations.find(r => r.id === reservationId);
    if (!reservationData || reservationData.isPayoutConfirmed) { alert('Este payout já foi confirmado ou a reserva não foi encontrada.'); return; }
    try {
        await db.runTransaction(async (t) => {
            const clientName = clients.find(c=>c.id === reservationData.clientId)?.name || '';
            const txData = { description: `Payout Airbnb - ${clientName}`, amount: reservationData.totalValue, date: Timestamp.now(), type: 'revenue', category: 'Receita de Aluguel', reservationId };
            const txRef = db.collection('financial_transactions').doc();
            t.set(txRef, txData);
            t.update(reservationRef, { amountPaid: reservationData.totalValue, isPayoutConfirmed: true });
        });
        alert('Payout do Airbnb confirmado com sucesso!');
        closeModal('reservation-modal');
    } catch (error) { console.error("Erro ao confirmar o payout: ", error); alert('Ocorreu um erro ao confirmar o payout.'); }
}
async function handleRegisterPayment(event) { // Sem alterações
    event.preventDefault();
    const form = event.target;
    const reservationId = form['payment-reservation-id'].value;
    const paymentAmount = parseFloat(form['payment-amount'].value);
    if (isNaN(paymentAmount) || paymentAmount <= 0) return;
    const reservationRef = db.collection('reservations').doc(reservationId);
    try {
        await db.runTransaction(async (t) => {
            const resDoc = await t.get(reservationRef);
            if (!resDoc.exists) throw "Reserva não encontrada!";
            const resData = resDoc.data();
            const clientName = clients.find(c=>c.id === resData.clientId)?.name || '';
            const newAmountPaid = (resData.amountPaid || 0) + paymentAmount;
            const txData = { description: `Pagamento Reserva - ${clientName}`, amount: paymentAmount, date: Timestamp.now(), type: 'revenue', category: 'Receita de Aluguel', reservationId };
            const txRef = db.collection('financial_transactions').doc();
            t.set(txRef, txData);
            t.update(reservationRef, { amountPaid: newAmountPaid });
        });
        closeModal('payment-modal');
    } catch (error) { console.error("Erro ao registrar pagamento: ", error); }
}

// --- LÓGICA PRINCIPAL E EVENT LISTENERS ---
function initializeApp() {
    setupEventListeners();
    listenForData();
    showTab('dashboard');
}

function setupEventListeners() {
    document.getElementById('logout-button').addEventListener('click', () => auth.signOut());
    document.getElementById('login-button')?.addEventListener('click', () => auth.signInWithRedirect(provider));
    
    document.getElementById('prev-month-btn').addEventListener('click', () => navigateMonth(-1));
    document.getElementById('next-month-btn').addEventListener('click', () => navigateMonth(1));
    document.querySelectorAll('.tab-button').forEach(b => b.addEventListener('click', () => showTab(b.getAttribute('data-tab'))));
    document.querySelectorAll('.close-modal-btn').forEach(b => b.addEventListener('click', () => closeModal(b.getAttribute('data-modal-id'))));

document.getElementById('calendar-add-reservation-btn').addEventListener('click', () => openReservationModal(null, clients));
    document.getElementById('reservations-add-reservation-btn').addEventListener('click', () => openReservationModal(null, clients));
    document.getElementById('add-revenue-btn').addEventListener('click', () => openTransactionModal('revenue'));
    document.getElementById('add-expense-btn').addEventListener('click', () => openTransactionModal('expense'));
    document.getElementById('add-new-client-btn').addEventListener('click', () => openClientModal(null));
    document.getElementById('clients-add-client-btn').addEventListener('click', () => openClientModal(null)); // NOVO
    document.getElementById('forecast-card').addEventListener('click', () => {
        const upcomingPayments = reservations.filter(r => (r.totalValue - (r.amountPaid || 0)) > 0.01 && r.status !== 'Cancelada').sort((a, b) => a.startDate.toDate() - b.startDate.toDate()).slice(0, 5);
        openForecastDetailsModal(upcomingPayments, clients);
    });

    document.getElementById('reservation-form').addEventListener('submit', handleSaveReservation);
    document.getElementById('payment-form').addEventListener('submit', handleRegisterPayment);
    document.getElementById('transaction-form').addEventListener('submit', handleSaveTransaction);
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
    document.getElementById('client-form').addEventListener('submit', handleSaveClient);
    document.getElementById('delete-reservation-form').addEventListener('submit', handleDeleteReservation);
    
    // ALTERADO: Listeners para sliders e inputs
    document.getElementById('setting-share-arthur-slider').addEventListener('input', (e) => handleShareChange('arthur', e.target.value));
    document.getElementById('setting-share-lucas-slider').addEventListener('input', (e) => handleShareChange('lucas', e.target.value));
    document.getElementById('setting-share-caixa-slider').addEventListener('input', (e) => handleShareChange('caixa', e.target.value));
    document.getElementById('setting-share-arthur-input').addEventListener('change', (e) => handleShareChange('arthur', e.target.value));
    document.getElementById('setting-share-lucas-input').addEventListener('change', (e) => handleShareChange('lucas', e.target.value));
    document.getElementById('setting-share-caixa-input').addEventListener('change', (e) => handleShareChange('caixa', e.target.value));

    document.getElementById('transactions-table-body').addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-transaction-btn');
        const editBtn = e.target.closest('.edit-transaction-btn');
        if (deleteBtn) handleDeleteTransaction(deleteBtn.dataset.id);
        if (editBtn) window.editTransaction(editBtn.dataset.id);
    });
    document.getElementById('reservations-table-body').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-reservation-btn');
        const deleteBtn = e.target.closest('.delete-reservation-btn');
        if (editBtn) window.editReservation(editBtn.dataset.id);
        if (deleteBtn) window.deleteReservation(deleteBtn.dataset.id);
    });
    
    document.getElementById('res-filter-search').addEventListener('input', applyFiltersAndRender);
    document.getElementById('res-filter-status').addEventListener('change', applyFiltersAndRender);
    document.getElementById('tx-filter-search').addEventListener('input', applyFiltersAndRender);
    document.getElementById('tx-filter-date-start').addEventListener('change', applyFiltersAndRender);
    document.getElementById('tx-filter-date-end').addEventListener('change', applyFiltersAndRender);
    // ADICIONEI AQUI
    document.getElementById('clients-table-body').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-client-btn');
        if (editBtn) {
            window.editClient(editBtn.dataset.id);
        }
    });
    // ATE AQUI
}

function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar(currentDate, reservations, clients);
    runCalculationsAndUpdateUI();
}

function listenForData() {
    db.collection('clients').orderBy('name').onSnapshot(snapshot => {
        clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFiltersAndRender();
    });
    db.collection('settings').doc('main').onSnapshot(doc => {
        if (doc.exists) {
            settings = doc.data();
            populateReserveFund(settings);
            updateShareControls(settings);
            runCalculationsAndUpdateUI();
        }
    });
    db.collection('financial_transactions').orderBy('date', 'desc').onSnapshot(snapshot => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFiltersAndRender();
    });
    db.collection('reservations').orderBy('startDate', 'desc').onSnapshot(snapshot => {
        reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar(currentDate, reservations, clients);
        applyFiltersAndRender();
    });
}

function applyFiltersAndRender() {
    // Filtro de Reservas (sem alteração)
    const resSearchTerm = document.getElementById('res-filter-search').value.toLowerCase();
    const resStatusFilter = document.getElementById('res-filter-status').value;
    const filteredReservations = reservations.filter(res => {
        const client = clients.find(c => c.id === res.clientId);
        const matchesSearch = client ? client.name.toLowerCase().includes(resSearchTerm) : false;
        const matchesStatus = resStatusFilter ? res.status === resStatusFilter : true;
        return matchesSearch && matchesStatus;
    });

    // Filtro de Transações (sem alteração)
    const txSearchTerm = document.getElementById('tx-filter-search').value.toLowerCase();
    const txDateStart = document.getElementById('tx-filter-date-start').value;
    const txDateEnd = document.getElementById('tx-filter-date-end').value;
    const filteredTransactions = transactions.filter(tx => {
        const matchesSearch = tx.description.toLowerCase().includes(txSearchTerm);
        const txDate = tx.date.toDate();
        const matchesDateStart = txDateStart ? txDate >= new Date(txDateStart + 'T00:00:00') : true;
        const matchesDateEnd = txDateEnd ? txDate <= new Date(txDateEnd + 'T23:59:59') : true;
        return matchesSearch && matchesDateStart && matchesDateEnd;
    });
    
    // Renderiza todas as tabelas
    renderReservationsTable(filteredReservations, clients);
    renderTransactionsTable(filteredTransactions);
    renderClientsTable(clients); // NOVO
    runCalculationsAndUpdateUI();
}

function runCalculationsAndUpdateUI() {
    if (!settings || !transactions || !reservations || !clients) return;
    const summary = calculateFinancialSummary(transactions);
    const forecast = calculateForecast(reservations);
    const settlement = calculateSettlement(summary, settings);
    const fundoCaixa = settlement.fundoCaixaTeorico;
    const kpis = calculateKPIs(reservations, currentDate);
    const upcomingGuests = reservations.filter(r => r.status === 'Confirmada' && r.startDate.toDate() > new Date()).sort((a,b) => a.startDate.toDate() - b.startDate.toDate()).slice(0,3);
    updateAllUI({ summary, forecast, settlement, fundoCaixa, kpis, transactions, reservations, upcomingGuests, clients });
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

window.editReservation = (resId) => {
    const reservation = reservations.find(r => r.id === resId);
    if(reservation) openReservationModal(reservation, clients);
};
window.deleteReservation = (resId) => {
    const reservation = reservations.find(r => r.id === resId);
    const client = clients.find(c => c.id === reservation?.clientId);
    if(reservation) openDeleteReservationModal(reservation, client);
};
window.editTransaction = (txId) => {
    const transaction = transactions.find(tx => tx.id === txId);
    if(transaction) openTransactionModal(transaction.type, transaction);
};
window.openPaymentModal = (resId) => {
    const reservation = reservations.find(r => r.id === resId);
    const client = clients.find(c => c.id === reservation?.clientId);
    openPaymentModal(reservation, client);
};
window.editClient = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if(client) openClientModal(client);
};