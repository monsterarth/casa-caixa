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

// --- PONTO DE ENTRADA PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    // ... (Lógica de autenticação e UI - sem alterações) ...
    const loginContainer = document.getElementById('login-container');
    const loginButton = document.getElementById('login-button');
    const appContainer = document.getElementById('app');
    const logoutButton = document.getElementById('logout-button');
    const welcomeMessage = document.getElementById('welcome-message');
    const userEmail = document.getElementById('user-email');
    const transactionForm = document.getElementById('transaction-form');

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
});


// --- LÓGICA PRINCIPAL DO APP ---
function initializeApp() {
    setupCalendarNav();
    listenForData();
    showTab('dashboard');
}

function setupCalendarNav() {
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
}

function listenForData() {
    // Escuta por transações para o dashboard
    db.collection('financial_transactions').onSnapshot(snapshot => {
        const transactions = snapshot.docs.map(doc => doc.data());
        // Aqui iriam os cálculos e renderização do dashboard
    }, error => console.error("Erro ao buscar transações: ", error));

    // Escuta por reservas para o calendário
    db.collection('reservations').onSnapshot(async (snapshot) => {
        if (snapshot.empty) {
            console.log('Nenhuma reserva encontrada. Semeando dados...');
            await seedReservations(); // Semeia apenas se estiver vazio
        } else {
            reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        renderCalendar(); // Re-renderiza o calendário com as novas reservas
    }, error => console.error("Erro ao buscar reservas: ", error));
}


// --- LÓGICA DO CALENDÁRIO ---
function renderCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('current-month-year');
    if (!calendarGrid || !monthYearDisplay) return;

    calendarGrid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    monthYearDisplay.textContent = `${monthNames[month]} ${year}`;

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Cria as células vazias para os dias antes do início do mês
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarGrid.insertAdjacentHTML('beforeend', '<div class="border rounded-md bg-slate-50"></div>');
    }

    // Cria as células para cada dia do mês
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day border rounded-md p-2 flex flex-col';
        dayCell.innerHTML = `<span class="font-medium self-start">${day}</span><div class="flex-grow space-y-1 mt-1 overflow-hidden"></div>`;
        
        const dayEventsContainer = dayCell.querySelector('.flex-grow');
        
        // Verifica se há reservas para este dia
        const today = new Date(year, month, day);
        const dayReservations = reservations.filter(res => {
            const startDate = res.startDate.toDate();
            const endDate = res.endDate.toDate();
            // Normaliza as datas para ignorar a hora
            const todayNorm = new Date(today.setHours(0,0,0,0));
            const startNorm = new Date(startDate.setHours(0,0,0,0));
            const endNorm = new Date(endDate.setHours(0,0,0,0));
            return todayNorm >= startNorm && todayNorm <= endNorm;
        });

        dayReservations.forEach(res => {
            const propColor = res.propertyId === 'estancia_do_vale' ? 'bg-blue-500' : 'bg-indigo-500';
            const eventDiv = `<div class="text-white text-xs p-1 rounded-md truncate ${propColor}">${res.guestName}</div>`;
            dayEventsContainer.insertAdjacentHTML('beforeend', eventDiv);
        });

        calendarGrid.appendChild(dayCell);
    }
}

async function seedReservations() {
    const batch = db.batch();
    const reservationsToSeed = [
        { guestName: 'Família Silva', propertyId: 'estancia_do_vale', startDate: new Date('2025-06-05'), endDate: new Date('2025-06-08')},
        { guestName: 'Casal Martins', propertyId: 'vale_do_sabia', startDate: new Date('2025-06-12'), endDate: new Date('2025-06-16')},
        { guestName: 'Grupo Amigos', propertyId: 'estancia_do_vale', startDate: new Date('2025-06-20'), endDate: new Date('2025-06-23')}
    ];

    reservationsToSeed.forEach(res => {
        const docRef = db.collection('reservations').doc();
        batch.set(docRef, {
            ...res,
            startDate: firebase.firestore.Timestamp.fromDate(res.startDate),
            endDate: firebase.firestore.Timestamp.fromDate(res.endDate)
        });
    });

    await batch.commit();
}


// --- FUNÇÕES GLOBAIS ---
function showTab(tabId) { /* ... (sem alterações) ... */ }
function openReservationModal() { alert('Ainda a ser implementado!'); }
// ... (outras funções auxiliares como formatCurrency, etc.) ...

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    
    const tabToShow = document.querySelector(`#${tabId}-tab`);
    const buttonToActivate = document.querySelector(`button[onclick="showTab('${tabId}')"]`);

    if(tabToShow) tabToShow.classList.add('active');
    if(buttonToActivate) buttonToActivate.classList.add('active');
}
