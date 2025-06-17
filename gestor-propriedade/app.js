import { auth, db, provider, Timestamp } from './firebase-config.js';
import { updateAllUI, renderCalendar, openReservationModal, openPaymentModal, openTransactionModal, closeModal, showTab, populateSettingsForm, renderReservationsTable, renderTransactionsTable } from './ui.js';

// --- ESTADO GLOBAL DO APP ---
let currentDate = new Date();
let reservations = [];
let transactions = [];
let settings = {};

// --- LÓGICA DE CÁLCULO ---

function calculateFinancialSummary(allTransactions) {
    const summary = { 
        confirmedRevenue: 0, 
        condominiumExpenses: 0, 
        personalArthur: 0,
        personalLucas: 0,
        totalExpenses: 0
    };

    allTransactions.forEach(tx => {
        if (tx.type === 'revenue') {
            summary.confirmedRevenue += tx.amount;
        } else if (tx.type === 'expense') {
            summary.totalExpenses += tx.amount;
            if (tx.category === 'Condomínio') {
                summary.condominiumExpenses += tx.amount;
            } else if (tx.category === 'Pessoal - Arthur') {
                summary.personalArthur += tx.amount;
            } else if (tx.category === 'Pessoal - Lucas') {
                summary.personalLucas += tx.amount;
            }
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

    return {
        cotaArthur: cotaArthur,
        despesasArthur: summary.personalArthur,
        saldoFinalArthur: cotaArthur - summary.personalArthur,
        cotaLucas: cotaLucas,
        despesasLucas: summary.personalLucas,
        saldoFinalLucas: cotaLucas - summary.personalLucas,
        fundoCaixaTeorico: (summary.cashBalance - (cotaArthur - summary.personalArthur) - (cotaLucas - summary.personalLucas))
    };
}

// NOVO: Funções de cálculo para os KPIs
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
             if(currentDay.getFullYear() === year && currentDay.getMonth() === month) {
                monthlyOccupancy.add(currentDay.getDate());
             }
             currentDay.setDate(currentDay.getDate() + 1);
        }
    });

    occupiedDays = monthlyOccupancy.size;
    totalRevenueFromMonth = confirmedReservations
        .filter(res => res.startDate.toDate().getMonth() === month && res.startDate.toDate().getFullYear() === year)
        .reduce((sum, res) => sum + res.totalValue, 0);

    const occupancyRate = (occupiedDays / daysInMonth) * 100;
    const adr = occupiedDays > 0 ? totalRevenueFromMonth / occupiedDays : 0;

    return { occupancyRate, adr };
}

// NOVO: Função para dados do gráfico de evolução
function calculateFinancialEvolution(allTransactions) {
    const monthlyData = {};
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    for(let i=0; i<6; i++) {
        const date = new Date(sixMonthsAgo);
        date.setMonth(date.getMonth() + i);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = { revenue: 0, expense: 0, label: date.toLocaleString('pt-BR', { month: 'short' }) };
    }

    allTransactions.forEach(tx => {
        const txDate = tx.date.toDate();
        if (txDate >= sixMonthsAgo) {
            const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
            if(monthlyData[key]) {
                if(tx.type === 'revenue') monthlyData[key].revenue += tx.amount;
                else monthlyData[key].expense += tx.amount;
            }
        }
    });

    const labels = Object.values(monthlyData).map(d => d.label);
    const revenues = Object.values(monthlyData).map(d => d.revenue);
    const expenses = Object.values(monthlyData).map(d => d.expense);

    return { labels, revenues, expenses };
}

// NOVO: Função para dados do gráfico de origem
function calculateSourceBreakdown(allReservations) {
    const breakdown = {};
     allReservations.filter(r => r.status !== 'Cancelada').forEach(res => {
        const source = res.sourcePlatform || 'Outro';
        if(!breakdown[source]) breakdown[source] = 0;
        breakdown[source] += res.totalValue;
     });
     return {
        labels: Object.keys(breakdown),
        data: Object.values(breakdown)
     };
}

// --- HANDLERS DE DADOS (SALVAR, EDITAR, DELETAR) ---

async function handleSaveReservation(event) {
    event.preventDefault();
    const form = event.target;
    
    // NOVO: Validação de data
    const startDate = new Date(form['res-start-date'].value + 'T00:00:00');
    const endDate = new Date(form['res-end-date'].value + 'T00:00:00');
    if (endDate <= startDate) {
        alert("A data de saída deve ser posterior à data de entrada.");
        return;
    }

    const reservationId = form['reservation-id'].value;
    const reservationData = {
        guestName: form['res-guest-name'].value.trim(),
        propertyId: form['res-property'].value,
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        totalValue: parseFloat(form['res-total-value'].value),
        status: form['res-status'].value,
        sourcePlatform: form['res-source-platform'].value,
    };

    try {
        if (reservationId) {
            await db.collection('reservations').doc(reservationId).update(reservationData);
        } else {
            reservationData.amountPaid = 0;
            reservationData.isPayoutConfirmed = false; 
            await db.collection('reservations').add(reservationData);
        }
        closeModal('reservation-modal');
    } catch (error) {
        console.error("Erro ao salvar reserva: ", error);
        alert("Não foi possível salvar a reserva.");
    }
}

async function handleRegisterPayment(event) {
    event.preventDefault();
    const form = event.target;
    const reservationId = form['payment-reservation-id'].value;
    const paymentAmount = parseFloat(form['payment-amount'].value);

    if (isNaN(paymentAmount) || paymentAmount <= 0) return;

    const reservationRef = db.collection('reservations').doc(reservationId);
    
    try {
        await db.runTransaction(async (transaction) => {
            const resDoc = await transaction.get(reservationRef);
            if (!resDoc.exists) throw "Reserva não encontrada!";
            
            const reservationData = resDoc.data();
            const newAmountPaid = (reservationData.amountPaid || 0) + paymentAmount;

            const financialTransaction = {
                description: `Pagamento Reserva - ${reservationData.guestName}`,
                amount: paymentAmount,
                date: Timestamp.now(),
                type: 'revenue',
                category: 'Receita de Aluguel',
                reservationId: reservationId
            };
            const transactionRef = db.collection('financial_transactions').doc();
            transaction.set(transactionRef, financialTransaction);
            transaction.update(reservationRef, { amountPaid: newAmountPaid });
        });
        
        closeModal('payment-modal');
    } catch (error) {
        console.error("Erro ao registrar pagamento: ", error);
    }
}

async function handleConfirmPayout(reservationId) {
    if (!reservationId) return;
    
    const reservationRef = db.collection('reservations').doc(reservationId);
    const reservationData = reservations.find(r => r.id === reservationId);

    if (!reservationData || reservationData.isPayoutConfirmed) {
        alert('Este payout já foi confirmado ou a reserva não foi encontrada.');
        return;
    }

    try {
        await db.runTransaction(async (transaction) => {
            const financialTransaction = {
                description: `Payout Airbnb - ${reservationData.guestName}`,
                amount: reservationData.totalValue,
                date: Timestamp.now(),
                type: 'revenue',
                category: 'Receita de Aluguel',
                reservationId: reservationId
            };
            const transactionRef = db.collection('financial_transactions').doc();
            transaction.set(transactionRef, financialTransaction);
            transaction.update(reservationRef, { 
                amountPaid: reservationData.totalValue,
                isPayoutConfirmed: true
            });
        });
        
        alert('Payout do Airbnb confirmado com sucesso!');
        closeModal('reservation-modal');
    } catch (error) {
        console.error("Erro ao confirmar o payout: ", error);
        alert('Ocorreu um erro ao confirmar o payout.');
    }
}

async function handleSaveTransaction(event) {
    event.preventDefault();
    const form = event.target;
    const type = form['transaction-type'].value;
    const transactionData = {
        description: form['tx-description'].value,
        amount: parseFloat(form['tx-amount'].value),
        date: Timestamp.fromDate(new Date(form['tx-date'].value + 'T00:00:00')),
        type: type
    };
    if (type === 'expense') {
        transactionData.category = form['tx-category'].value;
    } else {
        transactionData.category = 'Receita Avulsa';
    }

    try {
        await db.collection('financial_transactions').add(transactionData);
        closeModal('transaction-modal');
    } catch (error) {
        console.error("Erro ao salvar transação: ", error);
    }
}

async function handleDeleteTransaction(id) {
    if (confirm('Tem certeza que deseja excluir este lançamento?')) {
        try {
            await db.collection('financial_transactions').doc(id).delete();
        } catch (error) {
            console.error("Erro ao excluir transação: ", error);
        }
    }
}

async function handleSaveSettings(event) {
    event.preventDefault();
    const form = event.target;
    const newSettings = {
        shareArthur: parseFloat(form['setting-share-arthur'].value),
        shareLucas: parseFloat(form['setting-share-lucas'].value),
        shareFundoCaixa: parseFloat(form['setting-share-caixa'].value),
        fundoReservaFixo: parseFloat(form['setting-reserve-fund'].value)
    };

    const totalShare = newSettings.shareArthur + newSettings.shareLucas + newSettings.shareFundoCaixa;
    if (Math.abs(totalShare - 100) > 0.01) {
        alert(`A soma das porcentagens (Shares Arthur, Lucas e Fundo de Caixa) deve ser 100, mas é ${totalShare}.`);
        return;
    }

    try {
        await db.collection('settings').doc('main').update(newSettings);
        alert('Configurações salvas com sucesso!');
    } catch (error) {
        console.error("Erro ao salvar configurações: ", error);
    }
}


// --- LÓGICA PRINCIPAL E EVENT LISTENERS ---
function initializeApp() {
    setupEventListeners();
    listenForData();
    showTab('dashboard');
}

function setupEventListeners() {
    document.getElementById('logout-button').addEventListener('click', () => auth.signOut());
    document.getElementById('login-button')?.addEventListener('click', () => auth.signInWithPopup(provider));
    
    document.getElementById('prev-month-btn').addEventListener('click', () => navigateMonth(-1));
    document.getElementById('next-month-btn').addEventListener('click', () => navigateMonth(1));
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => showTab(button.getAttribute('data-tab')));
    });

    document.getElementById('calendar-add-reservation-btn').addEventListener('click', () => openReservationModal(null));
    document.getElementById('reservations-add-reservation-btn').addEventListener('click', () => openReservationModal(null));
    document.getElementById('add-revenue-btn').addEventListener('click', () => openTransactionModal('revenue'));
    document.getElementById('add-expense-btn').addEventListener('click', () => openTransactionModal('expense'));
    
    document.getElementById('confirm-payout-btn').addEventListener('click', (e) => {
        handleConfirmPayout(e.currentTarget.dataset.id);
    });

    document.getElementById('reservation-form').addEventListener('submit', handleSaveReservation);
    document.getElementById('payment-form').addEventListener('submit', handleRegisterPayment);
    document.getElementById('transaction-form').addEventListener('submit', handleSaveTransaction);
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);

    document.querySelectorAll('.close-modal-btn').forEach(button => {
        button.addEventListener('click', () => closeModal(button.getAttribute('data-modal-id')));
    });

    document.getElementById('transactions-table-body').addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-transaction-btn');
        if (deleteBtn) {
            handleDeleteTransaction(deleteBtn.getAttribute('data-id'));
        }
    });
    
    document.getElementById('reservations-table-body').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-reservation-btn');
        if (editBtn) {
            window.editReservation(editBtn.getAttribute('data-id'));
        }
    });
    
    // NOVO: Event listeners para os filtros
    document.getElementById('res-filter-search').addEventListener('input', applyFiltersAndRender);
    document.getElementById('res-filter-status').addEventListener('change', applyFiltersAndRender);
    document.getElementById('tx-filter-search').addEventListener('input', applyFiltersAndRender);
    document.getElementById('tx-filter-date-start').addEventListener('change', applyFiltersAndRender);
    document.getElementById('tx-filter-date-end').addEventListener('change', applyFiltersAndRender);
}

function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar(currentDate, reservations);
    // NOVO: Atualiza os KPIs ao navegar pelo calendário
    runCalculationsAndUpdateUI();
}

function listenForData() {
    db.collection('settings').doc('main').onSnapshot(doc => {
        if (doc.exists) {
            settings = doc.data();
            populateSettingsForm(settings);
            runCalculationsAndUpdateUI();
        }
    });

    db.collection('financial_transactions').orderBy('date', 'desc').onSnapshot(snapshot => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFiltersAndRender();
    });

    db.collection('reservations').orderBy('startDate', 'desc').onSnapshot(snapshot => {
        reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar(currentDate, reservations);
        applyFiltersAndRender();
    });
}

// NOVO: Função centralizada para aplicar filtros e atualizar a UI
function applyFiltersAndRender() {
    // Filtro de Reservas
    const resSearchTerm = document.getElementById('res-filter-search').value.toLowerCase();
    const resStatusFilter = document.getElementById('res-filter-status').value;
    const filteredReservations = reservations.filter(res => {
        const matchesSearch = res.guestName.toLowerCase().includes(resSearchTerm);
        const matchesStatus = resStatusFilter ? res.status === resStatusFilter : true;
        return matchesSearch && matchesStatus;
    });

    // Filtro de Transações
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
    
    renderReservationsTable(filteredReservations);
    renderTransactionsTable(filteredTransactions);
    runCalculationsAndUpdateUI(); // Roda os cálculos globais com os dados completos, não filtrados
}


function runCalculationsAndUpdateUI() {
    if (!settings || !transactions || !reservations) return;
    const summary = calculateFinancialSummary(transactions);
    const forecast = calculateForecast(reservations);
    const settlement = calculateSettlement(summary, settings);
    const fundoCaixa = settlement.fundoCaixaTeorico;

    // NOVO: Cálculos para KPIs e gráficos
    const kpis = calculateKPIs(reservations, currentDate);
    const evolutionData = calculateFinancialEvolution(transactions);
    const sourceData = calculateSourceBreakdown(reservations);
    
    updateAllUI({ 
        transactions, // Envia transações completas para alguns cálculos
        reservations, // Envia reservas completas para alguns cálculos
        summary, 
        forecast, 
        settlement, 
        fundoCaixa,
        kpis, // NOVO
        evolutionData, // NOVO
        sourceData // NOVO
    });
}

// --- PONTO DE ENTRADA PRINCIPAL ---
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

// --- EXPOSIÇÃO DE FUNÇÕES PARA A JANELA ---
window.openReservationModal = (reservation) => openReservationModal(reservation);
window.editReservation = (reservationId) => {
    const reservation = reservations.find(r => r.id === reservationId);
    if(reservation) openReservationModal(reservation);
};
window.openPaymentModal = (reservationId) => openPaymentModal(reservationId, reservations);