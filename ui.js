import { renderReservationModal, renderReservationDetailsModal } from './modals.js';

export function setupUI(appState) {
    document.getElementById('add-reservation-btn').addEventListener('click', () => {
        openModal('reservation-modal');
    });

    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            showTab(button.dataset.tab, appState);
        });
    });
}

export function showTab(tabId, appState) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));

    const tabToShow = document.getElementById(`${tabId}-tab`);
    const buttonToActivate = document.querySelector(`button[data-tab='${tabId}']`);

    if (tabToShow) tabToShow.classList.add('active');
    if (buttonToActivate) buttonToActivate.classList.add('active');
    
    // Renderiza o conteúdo da aba quando ela é mostrada
    if (tabId === 'dashboard') {
        updateDashboard(appState);
    } else if (tabId === 'calendar') {
        renderCalendar(appState);
    } else if (tabId === 'transactions') {
        renderTransactionsTable(appState);
    }
}

export function openModal(modalId, context = {}) {
    const modalsContainer = document.getElementById('modals-container');
    if (modalId === 'reservation-modal') {
        modalsContainer.innerHTML = renderReservationModal(context);
        document.getElementById('reservation-form').addEventListener('submit', context.handleSubmit);
    } else if (modalId === 'reservation-details-modal') {
        modalsContainer.innerHTML = renderReservationDetailsModal(context);
        document.getElementById('payment-form').addEventListener('submit', context.handlePayment);
    }
    document.getElementById(modalId).classList.remove('hidden');
}

export function closeModal() {
    document.getElementById('modals-container').innerHTML = '';
}

export function formatCurrency(value = 0) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function updateDashboard({ transactions, reservations }) {
    // Implementação do cálculo e atualização do Dashboard
    const totalRevenue = transactions.filter(t => t.type === 'revenue').reduce((sum, t) => sum + t.amount, 0);
    const totalCondoExpenses = transactions.filter(t => t.category === 'Condomínio').reduce((sum, t) => sum + t.amount, 0);
    const forecastedRevenue = reservations.reduce((sum, r) => sum + (r.totalValue - r.amountPaid), 0);
    
    document.getElementById('forecastedRevenue').textContent = formatCurrency(forecastedRevenue);
    document.getElementById('cashBalance').textContent = formatCurrency(totalRevenue + totalCondoExpenses);
    document.getElementById('netProfit').textContent = formatCurrency(totalRevenue + totalCondoExpenses);
}

export function renderCalendar({ reservations, currentDate }) {
    // Implementação da renderização do calendário
    const grid = document.getElementById('calendar-grid');
    const display = document.getElementById('current-month-year');
    if (!grid || !display) return;
    
    // ... (Lógica de renderização do calendário)
}

export function renderTransactionsTable({ transactions }) {
    // Implementação da renderização da tabela de transações
    const tableBody = document.getElementById('transactions-table-body');
    if (!tableBody) return;
    const sorted = [...transactions].sort((a, b) => b.date.seconds - a.date.seconds);
    tableBody.innerHTML = sorted.map(tx => `
        <tr>
            <td class="p-3">${tx.description}</td>
            <td class="p-3 font-medium ${tx.type === 'revenue' ? 'text-green-600' : 'text-red-600'}">${formatCurrency(tx.amount)}</td>
            <td class="p-3 text-slate-600">${tx.category}</td>
            <td class="p-3 text-slate-600">${tx.date.toDate().toLocaleDateString('pt-BR')}</td>
        </tr>
    `).join('');
}
