import { jsPDF } from 'jspdf';
import { BRAND_NAME, LOGO_FALLBACK_SRC, LOGO_SRC } from '../constants/brand';

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

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not load logo'));
    reader.readAsDataURL(blob);
  });
}

async function fetchLogoDataUrl(src) {
  const response = await fetch(src);
  if (!response.ok) return '';
  return readBlobAsDataUrl(await response.blob());
}

async function loadLogoDataUrl() {
  const sources = [LOGO_SRC, LOGO_FALLBACK_SRC].filter(Boolean);
  for (const src of sources) {
    try {
      const dataUrl = await fetchLogoDataUrl(src);
      if (dataUrl) return dataUrl;
    } catch {
      // Try the next logo source.
    }
  }
  return '';
}

function getImageFormat(dataUrl) {
  if (/^data:image\/webp/i.test(dataUrl)) return 'WEBP';
  if (/^data:image\/jpe?g/i.test(dataUrl)) return 'JPEG';
  return 'PNG';
}

function receiptNo(id) {
  return `LGF${String(id || Date.now()).replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase().padStart(6, '0')}`;
}

function drawReceiptShell(doc, logoDataUrl) {
  const width = 148;
  const height = 210;

  doc.setFillColor(255, 255, 252);
  doc.rect(0, 0, width, height, 'F');

  doc.setDrawColor(190, 145, 52);
  doc.setLineWidth(0.7);
  doc.roundedRect(6, 3, width - 12, height - 6, 3, 3, 'S');

  let drewLogo = false;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, getImageFormat(logoDataUrl), 64, 11, 20, 20);
      drewLogo = true;
    } catch {
      // Draw the text mark below if the browser/PDF engine cannot decode the image.
    }
  }

  if (!drewLogo) {
    doc.setFillColor(8, 103, 55);
    doc.circle(74, 21, 8, 'F');
    doc.setTextColor(230, 185, 91);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('LG', 74, 23.5, { align: 'center' });
  }

  doc.setTextColor(8, 103, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`${BRAND_NAME.toUpperCase()} FINANCE`, 74, 41, { align: 'center' });

  doc.setDrawColor(230, 210, 166);
  doc.setLineWidth(0.35);
  doc.line(15, 58, 55, 58);
  doc.line(93, 58, 133, 58);
  doc.setTextColor(198, 145, 43);
  doc.setFont('times', 'italic');
  doc.setFontSize(24);
  doc.text('Receipt', 74, 60, { align: 'center' });

  doc.setFillColor(238, 218, 170);
  doc.circle(55, 58, 0.8, 'F');
  doc.circle(93, 58, 0.8, 'F');

  doc.setFillColor(236, 213, 164);
  doc.ellipse(74, 193, 72, 18, 'F');
  doc.setFillColor(2, 75, 43);
  doc.rect(6, 186, width - 12, 21, 'F');
  doc.setFillColor(255, 255, 252);
  doc.ellipse(74, 184, 72, 17, 'F');
}

function drawReceiptRows(doc, rows, startY = 76) {
  let y = startY;
  rows.forEach(([label, value]) => {
    doc.setTextColor(38, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(label, 18, y);
    doc.text(':', 63, y);
    doc.setFont('helvetica', 'bold');
    doc.text(String(value || '-'), 70, y);
    y += 9;
  });
  return y;
}

function drawReceiptFooter(doc, message = 'Thank you for your payment!') {
  doc.setTextColor(32, 32, 32);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(message, 74, 155, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Authorized Signature', 98, 173, { align: 'center' });
  doc.setDrawColor(35, 35, 35);
  doc.setLineWidth(0.45);
  doc.line(86, 188, 126, 188);
  doc.setFont('times', 'italic');
  doc.setFontSize(19);
  doc.text('N.K.V.REDDY', 103, 185, { align: 'center' });
}

/**
 * @param {{ name: string, place: string, phone?: string, amountTaken?: number, totalAmount?: number, totalPaid?: number }} customer
 * @param {{ weekStart: string|Date, amount: number, paidAt?: string|Date, _id: string }} payment
 */
export async function downloadPaymentReceipt(customer, payment) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const paidOn = payment.paidAt ? formatDate(payment.paidAt) : formatDate(new Date());
  const weekOf = formatDate(payment.weekStart);
  const receiptDueDate = payment.dueDate ? formatDate(payment.dueDate) : weekOf;
  const paidAmount = Number(payment.amount || 0);
  const chitAmount = Number(customer.totalAmount || customer.amountTaken || 0);
  const totalPaid = Number(customer.totalPaid || 0);
  const balance = Math.max(chitAmount - totalPaid, 0);
  const logoDataUrl = await loadLogoDataUrl();

  drawReceiptShell(doc, logoDataUrl);
  drawReceiptRows(doc, [
    ['Receipt No', receiptNo(payment._id)],
    ['Date', paidOn],
    ['Client Name', customer.name],
    ['Mobile', customer.phone || '-'],
    ['Chit Name', `${BRAND_NAME} Chit`],
    ['Chit Amount', formatMoney(chitAmount)],
    ['Paid Amount', formatMoney(paidAmount)],
    ['Balance', formatMoney(balance)],
    ['Due Date', receiptDueDate],
  ]);
  drawReceiptFooter(doc);

  const filename = `receipt-${customer.name.replace(/\s+/g, '-')}-${weekOf.replace(/\s+/g, '-')}.pdf`;
  doc.save(filename);
}

/**
 * @param {{ name: string, phone?: string }} customer
 * @param {{
 *  _id?: string,
 *  topUpAt?: string|Date,
 *  previousRemainingAmount?: number,
 *  newAmountTaken?: number,
 *  newInterestRate?: number,
 *  newInterestAmount?: number,
 *  newTotalPayable?: number,
 *  newWeeklyPayment?: number,
 *  totalWeeks?: number,
 *  firstPaymentDate?: string|Date
 * }} topUp
 */
export async function downloadTopUpReceipt(customer, topUp) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const logoDataUrl = await loadLogoDataUrl();
  const generatedOn = formatDate(topUp.topUpAt || new Date());

  drawReceiptShell(doc, logoDataUrl);
  drawReceiptRows(doc, [
    ['Receipt No', receiptNo(topUp._id)],
    ['Date', generatedOn],
    ['Client Name', customer.name],
    ['Mobile', customer.phone || '-'],
    ['Old Balance', formatMoney(topUp.previousRemainingAmount || 0)],
    ['Top-up Amount', formatMoney(topUp.newAmountTaken || 0)],
    ['Interest', `${Number(topUp.newInterestRate || 0)}% (${formatMoney(topUp.newInterestAmount || 0)})`],
    ['Total Payable', formatMoney(topUp.newTotalPayable || 0)],
    ['Weekly', `${formatMoney(topUp.newWeeklyPayment || 0)} / ${topUp.totalWeeks || 25} weeks`],
    ['First Payment', topUp.firstPaymentDate ? formatDate(topUp.firstPaymentDate) : '-'],
  ], 72);
  drawReceiptFooter(doc, 'Top-up plan generated successfully');

  const filename = `top-up-${customer.name.replace(/\s+/g, '-')}-${generatedOn.replace(/\s+/g, '-')}.pdf`;
  doc.save(filename);
}
