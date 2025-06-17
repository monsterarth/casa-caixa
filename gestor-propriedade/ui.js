let financialChart = null;

// --- FUNÇÕES DE RENDERIZAÇÃO PRINCIPAIS ---

export function updateAllUI(data) {
    updateDashboardUI(data.summary, data.forecast, data.fundoCaixa);
    updateFinancialChart(data.summary);
    renderTransactionsTable(data.transactions);
    renderReservationsTable(data.reservations);
    renderSettlementTab(data.settlement);
}

export function updateDashboardUI(summary, forecast, fundoCaixa) {
    const el = id => document.getElementById(id);
    el('fundoCaixa').textContent = formatCurrency(fundoCaixa);
    el('cashBalance').textContent = formatCurrency(summary.cashBalance);
    el('forecast').textContent = formatCurrency(forecast);
    el('confirmedRevenue').textContent = formatCurrency(summary.confirmedRevenue);
    el('condominiumExpenses').textContent = formatCurrency(summary.condominiumExpenses);
}

export function renderSettlementTab(settlement) {
    const el = id => document.getElementById(id);
    el('arthur-share').textContent = formatCurrency(settlement.cotaArthur);
    el('arthur-expenses').textContent = formatCurrency(settlement.despesasArthur);
    el('arthur-balance').textContent = formatCurrency(settlement.saldoFinalArthur);
    el('lucas-share').textContent = formatCurrency(settlement.cotaLucas);
    el('lucas-expenses').textContent = formatCurrency(settlement.despesasLucas);
    el('lucas-balance').textContent = formatCurrency(settlement.saldoFinalLucas);
}

export function populateSettingsForm(settings) {
    if (!settings) return;
    const el = id => document.getElementById(id);
    el('setting-share-arthur').value = settings.shareArthur || 0;
    el('setting-share-lucas').value = settings.shareLucas || 0;
    el('setting-share-caixa').value = settings.shareFundoCaixa || 0;
    el('setting-reserve-fund').value = settings.fundoReservaFixo || 0;
}

// --- RENDERIZAÇÃO DE TABELAS ---

export function renderTransactionsTable(allTransactions) {
    const tableBody = document.getElementById('transactions-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = allTransactions.sort((a, b) => b.date.toDate() - a.date.toDate()).map(tx => {
        const isRevenue = tx.type === 'revenue';
        const date = tx.date.toDate().toLocaleDateString('pt-BR');
        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3">${tx.description}</td>
                <td class="p-3 font-medium ${isRevenue ? 'text-green-600' : 'text-red-600'}">
                    ${isRevenue ? '+' : '-'} ${formatCurrency(tx.amount)}
                </td>
                <td class="p-3 text-slate-600">${tx.category || 'N/A'}</td>
                <td class="p-3 text-slate-600">${date}</td>
                <td class="p-3 text-center">
                    <button class="text-red-500 hover:text-red-700 delete-transaction-btn" data-id="${tx.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

export function renderReservationsTable(allReservations) {
    const tableBody = document.getElementById('reservations-table-body');
    if(!tableBody) return;
    tableBody.innerHTML = allReservations.sort((a,b) => b.startDate.toDate() - a.startDate.toDate()).map(res => {
        const start = res.startDate.toDate().toLocaleDateString('pt-BR');
        const end = res.endDate.toDate().toLocaleDateString('pt-BR');
        const statusColors = {
            'Confirmada': 'bg-green-100 text-green-800',
            'Pré-reserva': 'bg-yellow-100 text-yellow-800',
            'Cancelada': 'bg-red-100 text-red-800',
            'Finalizada': 'bg-blue-100 text-blue-800',
            'Em andamento': 'bg-indigo-100 text-indigo-800'
        };
        const statusColor = statusColors[res.status] || 'bg-slate-100 text-slate-800';

        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-medium">${res.guestName}</td>
                <td class="p-3">${start} - ${end}</td>
                <td class="p-3">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">
                        ${res.status}
                    </span>
                </td>
                <td class="p-3 text-right">${formatCurrency(res.totalValue)}</td>
                <td class="p-3 text-center">
                    <button class="text-sky-500 hover:text-sky-700 edit-reservation-btn" data-id="${res.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// --- GRÁFICOS E MODAIS ---

export function updateFinancialChart(summary) {
    const ctx = document.getElementById('financialCompositionChart')?.getContext('2d');
    if (!ctx) return;
    const chartData = {
        labels: ['Receita Confirmada', 'Despesas Condomínio'],
        datasets: [{
            data: [summary.confirmedRevenue, summary.condominiumExpenses],
            backgroundColor: ['#22c55e', '#ef4444'],
            borderColor: '#f0f4f8',
            borderWidth: 4
        }]
    };
    if (financialChart) {
        financialChart.data = chartData;
        financialChart.update();
    } else {
        financialChart = new Chart(ctx, {
            type: 'doughnut',
            data: chartData,
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
        });
    }
}

export function openReservationModal(reservation) {
    const modal = document.getElementById('reservation-modal');
    const form = document.getElementById('reservation-form');
    form.reset();

    const registerPaymentBtn = document.getElementById('register-payment-btn');
    const confirmPayoutBtn = document.getElementById('confirm-payout-btn');

    if (reservation) { // Modo Edição
        form['reservation-id'].value = reservation.id;
        document.getElementById('reservation-modal-title').textContent = "Editar Reserva";
        
        form['res-status'].value = reservation.status;
        form['res-source-platform'].value = reservation.sourcePlatform;
        form['res-guest-name'].value = reservation.guestName;
        form['res-property'].value = reservation.propertyId;
        form['res-start-date'].value = reservation.startDate.toDate().toISOString().split('T')[0];
        form['res-end-date'].value = reservation.endDate.toDate().toISOString().split('T')[0];
        form['res-total-value'].value = reservation.totalValue;

        const amountPaid = reservation.amountPaid || 0;
        const amountDue = reservation.totalValue - amountPaid;
        document.getElementById('details-total').textContent = formatCurrency(reservation.totalValue);
        document.getElementById('details-paid').textContent = formatCurrency(amountPaid);
        document.getElementById('details-due').textContent = formatCurrency(amountDue);
        
        // LÓGICA DE VISIBILIDADE DOS BOTÕES
        if (reservation.sourcePlatform === 'Airbnb') {
            registerPaymentBtn.classList.add('hidden'); // Esconde o botão de pagamento padrão
            if (reservation.isPayoutConfirmed) {
                confirmPayoutBtn.classList.add('hidden'); // Se já foi confirmado, esconde o botão de payout
            } else {
                confirmPayoutBtn.classList.remove('hidden'); // Mostra o botão de payout
                confirmPayoutBtn.dataset.id = reservation.id; // Adiciona o ID ao botão para o handler
            }
        } else {
            confirmPayoutBtn.classList.add('hidden'); // Esconde o botão de payout
            registerPaymentBtn.classList.remove('hidden'); // Mostra o de pagamento padrão
            registerPaymentBtn.onclick = () => window.openPaymentModal(reservation.id);
        }

        document.getElementById('financial-details-section').classList.remove('hidden');

    } else { // Modo Criação
        form['reservation-id'].value = '';
        document.getElementById('reservation-modal-title').textContent = "Nova Reserva";
        document.getElementById('financial-details-section').classList.add('hidden');
    }
    
    modal.classList.remove('hidden');
}

export function openPaymentModal(reservationId, allReservations) {
    const reservation = allReservations.find(r => r.id === reservationId);
    if (!reservation) return;

    const modal = document.getElementById('payment-modal');
    const form = document.getElementById('payment-form');
    form.reset();
    
    document.getElementById('payment-reservation-id').value = reservationId;
    document.getElementById('payment-guest-name').textContent = reservation.guestName;
    const amountDue = reservation.totalValue - (reservation.amountPaid || 0);
    document.getElementById('payment-amount').value = amountDue > 0 ? amountDue.toFixed(2) : '0.00';
    
    closeModal('reservation-modal');
    modal.classList.remove('hidden');
}

export function openTransactionModal(type) {
    const modal = document.getElementById('transaction-modal');
    const form = document.getElementById('transaction-form');
    form.reset();
    document.getElementById('transaction-id').value = '';

    const title = document.getElementById('transaction-modal-title');
    const categoryWrapper = document.getElementById('category-wrapper');
    document.getElementById('transaction-type').value = type;

    if (type === 'revenue') {
        title.textContent = "Nova Receita";
        categoryWrapper.classList.add('hidden');
    } else {
        title.textContent = "Nova Despesa";
        categoryWrapper.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
}

export function renderCalendar(currentDate, reservations) {
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
            window.openReservationModal(null);
        });

        const eventsContainer = dayCell.querySelector('.events-container');
        const dayReservations = reservations.filter(res => {
            if (!res.startDate || !res.endDate || res.status === 'Cancelada') return false;
            const start = res.startDate.toDate(); start.setHours(0, 0, 0, 0);
            const end = res.endDate.toDate(); end.setHours(0, 0, 0, 0);
            return today >= start && today <= end;
        });

        dayReservations.forEach(res => {
            const propColor = res.propertyId === 'estancia_do_vale' ? 'bg-blue-500' : 'bg-indigo-500';
            const eventDiv = document.createElement('div');
            eventDiv.className = `event-chip text-white text-xs p-1 rounded-md truncate cursor-pointer ${propColor}`;
            eventDiv.textContent = res.guestName;
            eventDiv.addEventListener('click', () => window.editReservation(res.id));
            eventsContainer.appendChild(eventDiv);
        });
        grid.appendChild(dayCell);
    }
}


// --- FUNÇÕES UTILITÁRIAS ---

export function closeModal(modalId) {
    document.getElementById(modalId)?.classList.add('hidden');
}

export function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => {
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    document.getElementById(`${tabId}-tab`)?.classList.add('active');
}

export function formatCurrency(value) { 
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0); 
}