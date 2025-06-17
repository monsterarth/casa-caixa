// --- ESTADO DOS GRÁFICOS (sem alterações) ---
let financialEvolutionChart = null;
let sourceBreakdownChart = null;

// --- FUNÇÕES DE RENDERIZAÇÃO PRINCIPAIS ---

// ALTERADO: Função principal de renderização da UI
export function updateAllUI(data) {
    updateDashboardUI(data.summary, data.forecast, data.fundoCaixa, data.kpis, data.upcomingGuests, data.clients);
    updateFinancialEvolutionChart(data.transactions); // Gráfico usa transações completas
    updateSourceBreakdownChart(data.reservations); // Gráfico usa reservas completas
    renderSettlementTab(data.settlement, data.transactions); // Passa transações para o extrato
}

// ALTERADO: Renderiza todo o dashboard
export function updateDashboardUI(summary, forecast, fundoCaixa, kpis, upcomingGuests, allClients) {
    const el = id => document.getElementById(id);
    el('fundoCaixa').textContent = formatCurrency(fundoCaixa);
    el('cashBalance').textContent = formatCurrency(summary.cashBalance);
    el('forecast').textContent = formatCurrency(forecast);
    el('occupancyRate').textContent = `${(kpis.occupancyRate || 0).toFixed(1)}%`;
    el('averageDailyRate').textContent = formatCurrency(kpis.adr);
    renderUpcomingGuests(upcomingGuests, allClients); // NOVO
}

// ALTERADO: Renderiza a aba de Acerto, incluindo o extrato
export function renderSettlementTab(settlement, allTransactions) {
    const el = id => document.getElementById(id);
    el('arthur-share').textContent = formatCurrency(settlement.cotaArthur);
    el('arthur-expenses').textContent = formatCurrency(settlement.despesasArthur);
    el('arthur-balance').textContent = formatCurrency(settlement.saldoFinalArthur);
    el('lucas-share').textContent = formatCurrency(settlement.cotaLucas);
    el('lucas-expenses').textContent = formatCurrency(settlement.despesasLucas);
    el('lucas-balance').textContent = formatCurrency(settlement.saldoFinalLucas);
    renderSettlementStatements(allTransactions); // NOVO
}

// ALTERADO: Popula apenas o fundo de reserva. Sliders são controlados separadamente.
export function populateSettingsForm(settings) {
    if (!settings) return;
    document.getElementById('setting-reserve-fund').value = settings.fundoReservaFixo || 0;
}

// --- RENDERIZAÇÃO DE COMPONENTES ESPECÍFICOS ---

// NOVO: Renderiza o painel de próximos hóspedes
function renderUpcomingGuests(guests, allClients) {
    const listEl = document.getElementById('upcoming-guests-list');
    if (!listEl) return;
    if (guests.length === 0) {
        listEl.innerHTML = '<p class="text-slate-500">Nenhuma reserva confirmada para os próximos dias.</p>';
        return;
    }
    listEl.innerHTML = guests.map(res => {
        const client = allClients.find(c => c.id === res.clientId);
        if (!client) return '';
        const checkinDate = res.startDate.toDate().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
        return `
            <div class="border-b pb-2">
                <p class="font-bold text-slate-800">${client.name}</p>
                <p class="text-sm text-slate-600">Check-in: ${checkinDate}</p>
                ${client.phone ? `<p class="text-sm text-sky-600"><i class="fas fa-phone mr-2"></i>${client.phone}</p>` : ''}
            </div>
        `;
    }).join('');
}

// NOVO: Renderiza os extratos na aba Acerto de Contas
function renderSettlementStatements(allTransactions) {
    const renderStatement = (owner, elementId) => {
        const statementEl = document.getElementById(elementId);
        if (!statementEl) return;
        const personalExpenses = allTransactions.filter(tx => tx.category === `Pessoal - ${owner}`);
        if (personalExpenses.length === 0) {
            statementEl.innerHTML = '<p class="text-slate-400">Nenhuma despesa pessoal lançada.</p>';
            return;
        }
        statementEl.innerHTML = personalExpenses.map(tx => `
            <div class="flex justify-between items-center hover:bg-slate-50 p-1 rounded">
                <div>
                    <p class="font-medium text-slate-700">${tx.description}</p>
                    <p class="text-xs text-slate-500">${tx.date.toDate().toLocaleDateString('pt-BR')}</p>
                </div>
                <p class="font-bold text-red-500">${formatCurrency(tx.amount)}</p>
            </div>
        `).join('');
    };
    renderStatement('Arthur', 'arthur-statement');
    renderStatement('Lucas', 'lucas-statement');
}


// --- RENDERIZAÇÃO DE TABELAS ---

// ALTERADO: Adiciona botões de editar/deletar
export function renderTransactionsTable(transactionsToRender) {
    const tableBody = document.getElementById('transactions-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = transactionsToRender.map(tx => {
        const isRevenue = tx.type === 'revenue';
        const date = tx.date.toDate().toLocaleDateString('pt-BR');
        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3">${tx.description}</td>
                <td class="p-3 font-medium ${isRevenue ? 'text-green-600' : 'text-red-600'}">${isRevenue ? '+' : '-'} ${formatCurrency(tx.amount)}</td>
                <td class="p-3 text-slate-600">${tx.category || 'N/A'}</td>
                <td class="p-3 text-slate-600">${date}</td>
                <td class="p-3 text-center flex justify-center gap-4">
                    <button class="text-sky-500 hover:text-sky-700 edit-transaction-btn" data-id="${tx.id}"><i class="fas fa-edit"></i></button>
                    <button class="text-red-500 hover:text-red-700 delete-transaction-btn" data-id="${tx.id}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

// ALTERADO: Usa nome do cliente e adiciona botão de deletar
export function renderReservationsTable(reservationsToRender, allClients) {
    const tableBody = document.getElementById('reservations-table-body');
    if(!tableBody) return;
    tableBody.innerHTML = reservationsToRender.map(res => {
        const start = res.startDate.toDate().toLocaleDateString('pt-BR');
        const end = res.endDate.toDate().toLocaleDateString('pt-BR');
        const client = allClients.find(c => c.id === res.clientId);
        const statusColors = { 'Confirmada': 'bg-green-100 text-green-800', 'Pré-reserva': 'bg-yellow-100 text-yellow-800', 'Cancelada': 'bg-red-100 text-red-800', 'Finalizada': 'bg-blue-100 text-blue-800', 'Em andamento': 'bg-indigo-100 text-indigo-800' };
        const statusColor = statusColors[res.status] || 'bg-slate-100 text-slate-800';
        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-medium">${client?.name || 'Cliente não encontrado'}</td>
                <td class="p-3">${start} - ${end}</td>
                <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">${res.status}</span></td>
                <td class="p-3 text-right">${formatCurrency(res.totalValue)}</td>
                <td class="p-3 text-center flex justify-center gap-4">
                    <button class="text-sky-500 hover:text-sky-700 edit-reservation-btn" data-id="${res.id}"><i class="fas fa-edit"></i></button>
                    <button class="text-red-500 hover:text-red-700 delete-reservation-btn" data-id="${res.id}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

// --- GRÁFICOS ---
export function updateFinancialEvolutionChart(allTransactions) {
    const ctx = document.getElementById('financialEvolutionChart')?.getContext('2d');
    if (!ctx) return;
    const monthlyData = {};
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    for(let i=0; i<6; i++) {
        const date = new Date(sixMonthsAgo); date.setMonth(date.getMonth() + i);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = { revenue: 0, expense: 0, label: date.toLocaleString('pt-BR', { month: 'short' }) };
    }
    allTransactions.forEach(tx => {
        const txDate = tx.date.toDate();
        if (txDate >= sixMonthsAgo) {
            const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
            if(monthlyData[key]) {
                if(tx.type === 'revenue') monthlyData[key].revenue += tx.amount; else monthlyData[key].expense += tx.amount;
            }
        }
    });
    const chartData = {
        labels: Object.values(monthlyData).map(d => d.label),
        datasets: [{ label: 'Receitas', data: Object.values(monthlyData).map(d => d.revenue), backgroundColor: 'rgba(34, 197, 94, 0.2)', borderColor: 'rgba(34, 197, 94, 1)', borderWidth: 2, tension: 0.3 }, { label: 'Despesas', data: Object.values(monthlyData).map(d => d.expense), backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 1)', borderWidth: 2, tension: 0.3 }]
    };
    if (financialEvolutionChart) { financialEvolutionChart.data = chartData; financialEvolutionChart.update(); } 
    else { financialEvolutionChart = new Chart(ctx, { type: 'line', data: chartData, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } } }); }
}
export function updateSourceBreakdownChart(allReservations) {
    const ctx = document.getElementById('sourceBreakdownChart')?.getContext('2d');
    if (!ctx) return;
    const breakdown = {};
    allReservations.filter(r => r.status !== 'Cancelada').forEach(res => {
       const source = res.sourcePlatform || 'Outro';
       if(!breakdown[source]) breakdown[source] = 0;
       breakdown[source] += res.totalValue;
    });
    const chartData = {
        labels: Object.keys(breakdown),
        datasets: [{ data: Object.values(breakdown), backgroundColor: ['#38bdf8', '#818cf8', '#f472b6', '#fbbf24', '#4ade80'], borderColor: '#f0f4f8', borderWidth: 4 }]
    };
    if (sourceBreakdownChart) { sourceBreakdownChart.data = chartData; sourceBreakdownChart.update(); } 
    else { sourceBreakdownChart = new Chart(ctx, { type: 'doughnut', data: chartData, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' } }); }
}

// --- MODAIS ---

// ALTERADO: Lida com o dropdown de clientes
export function openReservationModal(reservation, allClients) {
    const modal = document.getElementById('reservation-modal');
    const form = document.getElementById('reservation-form');
    form.reset();
    populateClientsDropdown(allClients, reservation?.clientId); // NOVO
    if (reservation) {
        form['reservation-id'].value = reservation.id;
        document.getElementById('reservation-modal-title').textContent = "Editar Reserva";
        form['res-client-select'].value = reservation.clientId;
        form['res-status'].value = reservation.status;
        form['res-source-platform'].value = reservation.sourcePlatform;
        form['res-property'].value = reservation.propertyId;
        form['res-start-date'].value = reservation.startDate.toDate().toISOString().split('T')[0];
        form['res-end-date'].value = reservation.endDate.toDate().toISOString().split('T')[0];
        form['res-total-value'].value = reservation.totalValue;
        form['res-observation'].value = reservation.observation || '';
        document.getElementById('financial-details-section').classList.remove('hidden');
    } else {
        form['reservation-id'].value = '';
        document.getElementById('reservation-modal-title').textContent = "Nova Reserva";
        document.getElementById('financial-details-section').classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

// ALTERADO: Aceita transaction para edição
export function openTransactionModal(type, transaction = null) {
    const modal = document.getElementById('transaction-modal');
    const form = document.getElementById('transaction-form');
    form.reset();
    document.getElementById('transaction-type').value = type;

    if (transaction) { // Modo Edição
        document.getElementById('transaction-modal-title').textContent = `Editar ${type === 'revenue' ? 'Receita' : 'Despesa'}`;
        form['transaction-id'].value = transaction.id;
        form['tx-description'].value = transaction.description;
        form['tx-amount'].value = transaction.amount;
        form['tx-date'].value = transaction.date.toDate().toISOString().split('T')[0];
        if (type === 'expense') {
            form['tx-category'].value = transaction.category;
        }
    } else { // Modo Criação
        document.getElementById('transaction-modal-title').textContent = `Nova ${type === 'revenue' ? 'Receita' : 'Despesa'}`;
        form['transaction-id'].value = '';
    }

    document.getElementById('category-wrapper').classList.toggle('hidden', type === 'revenue');
    modal.classList.remove('hidden');
}

// NOVO: Abre modal para cadastrar cliente
export function openClientModal() {
    const form = document.getElementById('client-form');
    form.reset();
    document.getElementById('client-modal').classList.remove('hidden');
}

// NOVO: Abre modal para deletar reserva
export function openDeleteReservationModal(reservation, client) {
    const modal = document.getElementById('delete-reservation-modal');
    const form = document.getElementById('delete-reservation-form');
    form.reset();
    form['delete-res-id'].value = reservation.id;
    document.getElementById('delete-res-client-name').textContent = client?.name || 'Cliente Desconhecido';
    document.getElementById('delete-res-paid-amount').textContent = formatCurrency(reservation.amountPaid || 0);
    modal.classList.remove('hidden');
}

// NOVO: Abre modal com detalhes da previsão
export function openForecastDetailsModal(upcomingPayments, allClients) {
    const modal = document.getElementById('forecast-details-modal');
    const body = document.getElementById('forecast-details-body');
    if (upcomingPayments.length === 0) {
        body.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-slate-500">Nenhum pagamento pendente nas próximas reservas.</td></tr>';
    } else {
        body.innerHTML = upcomingPayments.map(res => {
            const client = allClients.find(c => c.id === res.clientId);
            const amountDue = (res.totalValue || 0) - (res.amountPaid || 0);
            return `<tr>
                <td class="p-3 font-medium">${client?.name || 'N/A'}</td>
                <td class="p-3">${res.startDate.toDate().toLocaleDateString('pt-BR')}</td>
                <td class="p-3 text-right font-bold text-amber-600">${formatCurrency(amountDue)}</td>
            </tr>`;
        }).join('');
    }
    modal.classList.remove('hidden');
}

export function openPaymentModal(reservation, client) { // ALTERADO para receber cliente
    const modal = document.getElementById('payment-modal');
    const form = document.getElementById('payment-form');
    form.reset();
    document.getElementById('payment-reservation-id').value = reservation.id;
    document.getElementById('payment-guest-name').textContent = client?.name || '';
    const amountDue = reservation.totalValue - (reservation.amountPaid || 0);
    document.getElementById('payment-amount').value = amountDue > 0 ? amountDue.toFixed(2) : '0.00';
    closeModal('reservation-modal');
    modal.classList.remove('hidden');
}

export function renderCalendar(currentDate, reservations, allClients) { // ALTERADO para receber clientes
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
        dayCell.addEventListener('click', (e) => { if (!e.target.closest('.event-chip')) window.openReservationModal(null, allClients); });
        const eventsContainer = dayCell.querySelector('.events-container');
        const dayReservations = reservations.filter(res => {
            if (!res.startDate || !res.endDate || res.status === 'Cancelada') return false;
            const start = res.startDate.toDate(); start.setHours(0, 0, 0, 0);
            const end = res.endDate.toDate(); end.setHours(0, 0, 0, 0);
            return today >= start && today < end;
        });
        const statusColors = { 'Confirmada': 'bg-green-500', 'Pré-reserva': 'bg-yellow-500', 'Em andamento': 'bg-indigo-500', 'Finalizada': 'bg-blue-500' };
        dayReservations.forEach(res => {
            const client = allClients.find(c => c.id === res.clientId);
            const statusColor = statusColors[res.status] || 'bg-slate-500';
            const eventDiv = document.createElement('div');
            eventDiv.className = `event-chip text-white text-xs p-1 rounded-md truncate cursor-pointer ${statusColor}`;
            eventDiv.textContent = client?.name || '...';
            eventDiv.title = `${client?.name || ''}\nStatus: ${res.status}\nValor: ${formatCurrency(res.totalValue)}`;
            eventDiv.addEventListener('click', () => window.editReservation(res.id));
            eventsContainer.appendChild(eventDiv);
        });
        grid.appendChild(dayCell);
    }
}

// --- FUNÇÕES UTILITÁRIAS ---

function populateClientsDropdown(allClients, selectedClientId) {
    const select = document.getElementById('res-client-select');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um cliente...</option>';
    allClients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        if (client.id === selectedClientId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// NOVO: Atualiza os sliders e os inputs numéricos
export function updateShareSliders(shares) {
    const arthurSlider = document.getElementById('setting-share-arthur-slider');
    const lucasSlider = document.getElementById('setting-share-lucas-slider');
    const caixaSlider = document.getElementById('setting-share-caixa-slider');
    const arthurInput = document.getElementById('setting-share-arthur-input');
    const lucasInput = document.getElementById('setting-share-lucas-input');
    const caixaInput = document.getElementById('setting-share-caixa-input');

    arthurSlider.value = shares.shareArthur;
    arthurInput.value = (shares.shareArthur || 0).toFixed(2);
    lucasSlider.value = shares.shareLucas;
    lucasInput.value = (shares.shareLucas || 0).toFixed(2);
    caixaSlider.value = shares.shareFundoCaixa;
    caixaInput.value = (shares.shareFundoCaixa || 0).toFixed(2);
}

export function closeModal(modalId) { document.getElementById(modalId)?.classList.add('hidden'); }
export function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.toggle('active', button.getAttribute('data-tab') === tabId));
    document.getElementById(`${tabId}-tab`)?.classList.add('active');
}
export function formatCurrency(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0); }