import { jsPDF } from 'jspdf';

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMoney(n) {
  return `Rs. ${Number(n).toLocaleString('en-IN')}`;
}

/**
 * @param {{ name: string, place: string, phone?: string }} customer
 * @param {{ weekStart: string|Date, amount: number, paidAt?: string|Date, _id: string }} payment
 */
export function downloadPaymentReceipt(customer, payment) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const paidOn = payment.paidAt ? formatDate(payment.paidAt) : formatDate(new Date());
  const weekOf = formatDate(payment.weekStart);
  const receiptId = String(payment._id).slice(-8).toUpperCase();

  doc.setFillColor(245, 158, 11);
  doc.rect(0, 0, 148, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Lakshmi Ganapati', 14, 14);
  doc.setFontSize(10);
  doc.text('Weekly payment receipt', 14, 22);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(11);
  let y = 38;
  const line = (label, value) => {
    doc.setFont(undefined, 'bold');
    doc.text(`${label}:`, 14, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(value), 52, y);
    y += 8;
  };

  line('Receipt no.', receiptId);
  line('Customer', customer.name);
  line('Place', customer.place);
  if (customer.phone) line('Phone', customer.phone);
  line('Week starting', weekOf);
  line('Amount paid', formatMoney(payment.amount));
  line('Paid on', paidOn);
  line('Status', 'PAID');

  y += 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, 134, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Thank you for your payment. Keep this receipt for your records.', 14, y);
  doc.text(`Generated on ${formatDate(new Date())}`, 14, y + 6);

  const filename = `receipt-${customer.name.replace(/\s+/g, '-')}-${weekOf.replace(/\s+/g, '-')}.pdf`;
  doc.save(filename);
}
