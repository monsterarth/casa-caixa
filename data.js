import { db } from './firebase.js';
import { collection, onSnapshot, addDoc, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { updateDashboard, renderCalendar, renderTransactionsTable } from './ui.js';

export function listenForData(appState) {
    onSnapshot(collection(db, 'transactions'), snapshot => {
        appState.transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTransactionsTable(appState);
        updateDashboard(appState);
    }, console.error);

    onSnapshot(collection(db, 'reservations'), snapshot => {
        appState.reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar(appState);
        updateDashboard(appState);
    }, console.error);
}

export async function saveReservation(data) {
    const reservationData = {
        guestName: data.guestName,
        propertyId: data.propertyId,
        startDate: Timestamp.fromDate(new Date(data.startDate)),
        endDate: Timestamp.fromDate(new Date(data.endDate)),
        totalValue: parseFloat(data.totalValue),
        amountPaid: data.id ? data.amountPaid : 0, // Mantém o valor pago se estiver a editar
    };

    if (data.id) {
        await updateDoc(doc(db, 'reservations', data.id), reservationData);
    } else {
        await addDoc(collection(db, 'reservations'), reservationData);
    }
}
