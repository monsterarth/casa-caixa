export function renderReservationModal(context) {
    const { reservation = {}, date } = context;
    const isEditing = !!reservation.id;
    const startDate = date || (reservation.startDate ? reservation.startDate.toDate().toISOString().split('T')[0] : '');

    return `
        <div id="reservation-modal" class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 m-4">
                <h2 class="text-2xl font-bold mb-6">${isEditing ? 'Editar Reserva' : 'Nova Reserva'}</h2>
                <form id="reservation-form" data-id="${reservation.id || ''}">
                    <!-- Campos do formulário -->
                    <div class="space-y-4">
                         <div>
                            <label for="res-guest-name">Nome do Hóspede</label>
                            <input type="text" id="res-guest-name" value="${reservation.guestName || ''}" required>
                        </div>
                        <div>
                            <label for="res-start-date">Data de Entrada</label>
                            <input type="date" id="res-start-date" value="${startDate}" required>
                        </div>
                        <!-- Outros campos -->
                    </div>
                    <div class="flex justify-end gap-2 mt-8">
                        <button type="button" onclick="window.closeModal()">Cancelar</button>
                        <button type="submit">${isEditing ? 'Atualizar' : 'Salvar'}</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

export function renderReservationDetailsModal(context) {
    const { reservation } = context;
    // ... (HTML para o modal de detalhes)
    return `<div>Detalhes da reserva aqui</div>`;
}
