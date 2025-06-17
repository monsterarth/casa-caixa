import { auth, db, provider, Timestamp } from './firebase-config.js';
import { updateAllUI, renderCalendar, openReservationModal, openPaymentModal, closeModal, showTab, populateSettingsForm } from './ui.js';

// --- ESTADO GLOBAL DO APP ---
let currentDate = new Date();
let reservations = [];
let transactions = [];
let settings = {}; // Guarda as configurações vindas do Firebase

// --- LÓGICA DE CÁLCULO ---
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
    summary.cashBalance = summary.confirmedRevenue - summary.totalExpenses;
    summary.netProfitToDivide = summary.confirmedRevenue - summary.condominiumExpenses;
    return summary;
}

function calculateForecast(allReservations) {
    return allReservations.reduce((total, res) => {
        const amountDue = (res.totalValue || 0) - (res.amountPaid || 0);
        return total + (amountDue > 0 ? amountDue : 0);
    }, 0);
}

// NOVA FUNÇÃO: Calcula o acerto de contas com base nas configurações
function calculateSettlement(summary, appSettings) {
    const netProfit = summary.netProfitToDivide > 0 ? summary.netProfitToDivide : 0;
    
    const shareCaixaPercent = appSettings.shareFundoCaixa || 0;
    const shareArthurPercent = appSettings.shareArthur || 0;
    const shareLucasPercent = appSettings.shareLucas || 0;

    const valorParaCaixa = netProfit * (shareCaixaPercent / 100);
    const lucroParaSocios = netProfit - valorParaCaixa;

    return {
        parteArthur: lucroParaSocios * (shareArthurPercent / 100),
        parteLucas: lucroParaSocios * (shareLucasPercent / 100),
    };
}


// --- LÓGICA DE EVENTOS E DADOS ---
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
    };
    if (!reservationData.guestName || !reservationData.startDate || !reservationData.endDate || isNaN(reservationData.totalValue)) {
        alert("Por favor, preencha todos os campos corretamente.");
        return;
    }
    if (reservationData.endDate < reservationData.startDate) {
        alert("A data de saída não pode ser anterior à data de entrada.");
        return;
    }
    try {
        const dataToSave = {
            ...reservationData,
            startDate: Timestamp.fromDate(reservationData.startDate),
            endDate: Timestamp.fromDate(reservationData.endDate),
        };
        if (reservationId) {
            await db.collection('reservations').doc(reservationId).update(dataToSave);
        } else {
            dataToSave.amountPaid = 0;
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
        alert("Por favor, insira um valor de pagamento válido.");
        return;
    }

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
        alert("Ocorreu um erro ao registrar o pagamento. Tente novamente.");
    }
}

// NOVA FUNÇÃO: Salva as configurações no Firebase
async function handleSaveSettings(event) {
    event.preventDefault();
    const form = event.target;
    const newSettings = {
        shareArthur: parseFloat(form['setting-share-arthur'].value),
        shareLucas: parseFloat(form['setting-share-lucas'].value),
        shareFundoCaixa: parseFloat(form['setting-share-caixa'].value),
        fundoReservaFixo: parseFloat(form['setting-reserva-fixo'].value)
    };

    const totalShare = newSettings.shareArthur + newSettings.shareLucas + newSettings.shareFundoCaixa;
    if (totalShare !== 100) {
        alert(`A soma das porcentagens (Shares Arthur, Lucas e Fundo de Caixa) deve ser 100, mas é ${totalShare}.`);
        return;
    }

    try {
        await db.collection('settings').doc('main').update(newSettings);
        alert('Configurações salvas com sucesso!');
    } catch (error) {
        console.error("Erro ao salvar configurações: ", error);
        alert("Não foi possível salvar as configurações.");
    }
}

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
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);

    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            showTab(tabId);
        });
    });

    const addReservationBtn = document.getElementById('add-reservation-btn');
    addReservationBtn.addEventListener('click', () => {
        openReservationModal(null, reservations, null);
    });
    
    const closeModalButtons = document.querySelectorAll('.close-modal-btn');
    closeModalButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modalId = button.getAttribute('data-modal-id');
            closeModal(modalId);
        });
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
        } else {
            console.log("Documento de configurações não encontrado! Crie-o no Firebase.");
        }
    });

    db.collection('financial_transactions').orderBy('date', 'desc').onSnapshot(snapshot => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        runCalculationsAndUpdateUI();
    });

    db.collection('reservations').onSnapshot(snapshot => {
        reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar(currentDate, reservations);
        runCalculationsAndUpdateUI();
    });
}

// NOVA FUNÇÃO CENTRALIZADA: Roda todos os cálculos e atualiza a UI
function runCalculationsAndUpdateUI() {
    if (!settings) return; // Não roda os cálculos se as configurações não foram carregadas
    const summary = calculateFinancialSummary(transactions);
    const forecast = calculateForecast(reservations);
    const settlement = calculateSettlement(summary, settings);
    
    updateAllUI(transactions, reservations, summary, forecast, settlement);
}

// --- PONTO DE ENTRADA PRINCIPAL E AUTENTICAÇÃO ---
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

document.getElementById('login-button')?.addEventListener('click', () => {
    auth.signInWithPopup(provider).catch(error => console.error("Erro no login:", error));
});

// Expõe funções na window para serem chamadas por eventos que ainda não foram migrados
// ou que são chamados de dentro de HTML gerado dinamicamente.
window.openReservationModal = (id, startDate) => openReservationModal(id, reservations, startDate);
window.openPaymentModal = (id) => openPaymentModal(id, reservations);