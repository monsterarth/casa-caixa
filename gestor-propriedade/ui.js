// A variável do gráfico pertence à UI, então ela fica aqui.
let financialChart = null;

// ATUALIZADO: Recebe o "settlement" e passa para a função de UI do dashboard
export function updateAllUI(transactions, reservations, summary, forecast, settlement) {
    updateDashboardUI(summary, forecast, settlement); // Passa o settlement adiante
    updateFinancialChart(summary);
    renderTransactionsTable(transactions);
}

// ATUALIZADO: Recebe e usa os dados do "settlement" para preencher os novos campos
export function updateDashboardUI(summary, forecast, settlement) {
    const el = id => document.getElementById(id);
    
    // Cards principais
    el('cashBalance').textContent = formatCurrency(summary.cashBalance);
    el('netProfit').textContent = formatCurrency(summary.netProfitToDivide);
    el('forecast').textContent = formatCurrency(forecast);

    // Detalhamento para Divisão
    el('confirmedRevenue').textContent = formatCurrency(summary.confirmedRevenue);
    el('condominiumExpenses').textContent = formatCurrency(summary.condominiumExpenses);
    
    // Novos valores do Acerto de Contas
    el('settlement-arthur-share').textContent = formatCurrency(settlement.parteArthur);
    el('settlement-arthur-total').textContent = formatCurrency(settlement.parteArthur); // Ajustar futuramente se houver descontos pessoais
    el('settlement-lucas-share').textContent = formatCurrency(settlement.parteLucas);
    el('settlement-lucas-total').textContent = formatCurrency(settlement.parteLucas); // Ajustar futuramente se houver descontos pessoais
}

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

export function renderTransactionsTable(allTransactions) {
    const tableBody = document.getElementById('transactions-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = allTransactions.map(tx => {
        const isRevenue = tx.type === 'revenue';
        const date = tx.date && tx.date.toDate ? tx.date.toDate().toLocaleDateString('pt-BR') : 'Data inválida';
        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3">${tx.description}</td>
                <td class="p-3 font-medium ${isRevenue ? 'text-green-600' : 'text-red-600'}">
                    ${isRevenue ? '+' : '-'} ${formatCurrency(tx.amount)}
                </td>
                <td class="p-3 text-slate-600">${tx.category || 'N/A'}</td>
                <td class="p-3 text-slate-600">${date}</td>
            </tr>
        `;
    }).join('');
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
            // A chamada para openReservationModal agora é feita pelo app.js através da window
            window.openReservationModal(null, today.toISOString().split('T')[0]);
        });

        const eventsContainer = dayCell.querySelector('.events-container');
        const dayReservations = reservations.filter(res => {
            if (!res.startDate || !res.endDate) return false;
            const start = res.startDate.toDate(); start.setHours(0, 0, 0, 0);
            const end = res.endDate.toDate(); end.setHours(0, 0, 0, 0);
            return today >= start && today <= end;
        });

        dayReservations.forEach(res => {
            const propColor = res.propertyId === 'estancia_do_vale' ? 'bg-blue-500' : 'bg-indigo-500';
            const eventDiv = document.createElement('div');
            eventDiv.className = `event-chip text-white text-xs p-1 rounded-md truncate cursor-pointer ${propColor}`;
            eventDiv.textContent = res.guestName;
            eventDiv.addEventListener('click', () => {
                // A chamada para openReservationModal agora é feita pelo app.js através da window
                window.openReservationModal(res.id);
            });
            eventsContainer.appendChild(eventDiv);
        });
        grid.appendChild(dayCell);
    }
}

export function openReservationModal(reservationId = null, allReservations, startDate = null) {
    const modal = document.getElementById('reservation-modal');
    const form = document.getElementById('reservation-form');
    form.reset();
    document.getElementById('reservation-id').value = reservationId || '';

    const financialSection = document.getElementById('financial-details-section');

    if (reservationId) {
        const reservation = allReservations.find(r => r.id === reservationId);
        if (reservation) {
            form['res-guest-name'].value = reservation.guestName;
            form['res-property'].value = reservation.propertyId;
            form['res-start-date'].value = reservation.startDate.toDate().toISOString().split('T')[0];
            form['res-end-date'].value = reservation.endDate.toDate().toISOString().split('T')[0];
            form['res-total-value'].value = reservation.totalValue;

            document.getElementById('reservation-modal-title').textContent = "Editar Reserva";
            
            const amountPaid = reservation.amountPaid || 0;
            const amountDue = reservation.totalValue - amountPaid;
            document.getElementById('details-total').textContent = formatCurrency(reservation.totalValue);
            document.getElementById('details-paid').textContent = formatCurrency(amountPaid);
            document.getElementById('details-due').textContent = formatCurrency(amountDue);
            
            const registerPaymentBtn = document.getElementById('register-payment-btn');
            // A chamada para openPaymentModal também será exposta na window
            registerPaymentBtn.onclick = () => window.openPaymentModal(reservationId);
            financialSection.classList.remove('hidden');

        }
    } else {
        document.getElementById('reservation-modal-title').textContent = "Nova Reserva";
        financialSection.classList.add('hidden');
        if (startDate) {
            document.getElementById('res-start-date').value = startDate;
        }
    }
    
    modal.classList.remove('hidden');
}

export function openPaymentModal(reservationId, allReservations) {
    const reservation = allReservations.find(r => r.id === reservationId);
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

// NOVA FUNÇÃO: Preenche o formulário de configurações com os dados do Firebase
export function populateSettingsForm(settings) {
    if (!settings) return;
    const el = id => document.getElementById(id);
    el('setting-share-arthur').value = settings.shareArthur || 0;
    el('setting-share-lucas').value = settings.shareLucas || 0;
    el('setting-share-caixa').value = settings.shareFundoCaixa || 0;
    el('setting-reserva-fixo').value = settings.fundoReservaFixo || 0;
}