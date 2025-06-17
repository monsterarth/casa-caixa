import { auth, db, provider, Timestamp } from './firebase-config.js';
import { updateAllUI, renderCalendar, openReservationModal, openPaymentModal, openTransactionModal, closeModal, showTab, populateSettingsForm } from './ui.js';

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


// --- HANDLERS DE DADOS (SALVAR, EDITAR, DELETAR) ---

async function handleSaveReservation(event) {
    event.preventDefault();
    const form = event.target;
    const reservationId = form['reservation-id'].value;

    const reservationData = {
        guestName: form['res-guest-name'].value.trim(),
        propertyId: form['res-property'].value,
        startDate: Timestamp.fromDate(new Date(form['res-start-date'].value + 'T00:00:00')),
        endDate: Timestamp.fromDate(new Date(form['res-end-date'].value + 'T00:00:00')),
        totalValue: parseFloat(form['res-total-value'].value),
        status: form['res-status'].value,
        sourcePlatform: form['res-source-platform'].value,
    };

    try {
        if (reservationId) {
            await db.collection('reservations').doc(reservationId).update(reservationData);
        } else {
            reservationData.amountPaid = 0;
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
    if (Math.abs(totalShare - 100) > 0.01) { // Lida com imprecisão de float
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
    // Auth
    document.getElementById('logout-button').addEventListener('click', () => auth.signOut());
    document.getElementById('login-button')?.addEventListener('click', () => auth.signInWithPopup(provider));
    
    // Navegação
    document.getElementById('prev-month-btn').addEventListener('click', () => navigateMonth(-1));
    document.getElementById('next-month-btn').addEventListener('click', () => navigateMonth(1));
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => showTab(button.getAttribute('data-tab')));
    });

    // Ações de Adicionar
    document.getElementById('calendar-add-reservation-btn').addEventListener('click', () => openReservationModal(null, reservations));
    document.getElementById('reservations-add-reservation-btn').addEventListener('click', () => openReservationModal(null, reservations));
    document.getElementById('add-revenue-btn').addEventListener('click', () => openTransactionModal('revenue'));
    document.getElementById('add-expense-btn').addEventListener('click', () => openTransactionModal('expense'));

    // Submissão de Forms
    document.getElementById('reservation-form').addEventListener('submit', handleSaveReservation);
    document.getElementById('payment-form').addEventListener('submit', handleRegisterPayment);
    document.getElementById('transaction-form').addEventListener('submit', handleSaveTransaction);
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);

    // Fechar Modais
    document.querySelectorAll('.close-modal-btn').forEach(button => {
        button.addEventListener('click', () => closeModal(button.getAttribute('data-modal-id')));
    });

    // Event Delegation para botões em tabelas
    document.getElementById('transactions-table-body').addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-transaction-btn');
        if (deleteBtn) {
            handleDeleteTransaction(deleteBtn.getAttribute('data-id'));
        }
    });
    
    document.getElementById('reservations-table-body').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-reservation-btn');
        if (editBtn) {
            const reservation = reservations.find(r => r.id === editBtn.getAttribute('data-id'));
            if(reservation) openReservationModal(reservation, reservations);
        }
    });
}

function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar(currentDate, reservations);
}

function listenForData() {
    db.collection('settings').doc('main').onSnapshot(doc => {
        if (doc.exists) {
            settings = doc.data();
            populateSettingsForm(settings);
            runCalculationsAndUpdateUI();
        }
    });

    db.collection('financial_transactions').onSnapshot(snapshot => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        runCalculationsAndUpdateUI();
    });

    db.collection('reservations').onSnapshot(snapshot => {
        reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar(currentDate, reservations);
        runCalculationsAndUpdateUI();
    });
}

function runCalculationsAndUpdateUI() {
    if (!settings || transactions.length === 0) return;
    const summary = calculateFinancialSummary(transactions);
    const forecast = calculateForecast(reservations);
    const settlement = calculateSettlement(summary, settings);
    const fundoCaixa = settlement.fundoCaixaTeorico; // Usando o cálculo do settlement
    
    updateAllUI({ transactions, reservations, summary, forecast, settlement, fundoCaixa });
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

// --- EXPOSIÇÃO DE FUNÇÕES PARA A JANELA (usado por código dinâmico) ---
window.openReservationModal = (reservationId, startDate) => {
    const reservation = reservationId ? reservations.find(r => r.id === reservationId) : null;
    openReservationModal(reservation, reservations, startDate);
};
window.editReservation = (reservationId) => {
    const reservation = reservations.find(r => r.id === reservationId);
    if(reservation) openReservationModal(reservation, reservations);
};
window.openPaymentModal = (reservationId) => openPaymentModal(reservationId, reservations);