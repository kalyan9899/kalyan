import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { calcInterestAmount, calcTotalAmount } from '../utils/finance';
import { openWhatsApp } from '../utils/whatsapp';
import { BRAND_NAME, LOGO_SRC } from '../constants/brand';
import LoadingSpinner from '../components/LoadingSpinner';
import ManagerSidebar from '../components/ManagerSidebar';
import './ManagerDashboard.css';

const DashboardBg = lazy(() => import('../components/DashboardBg'));
const ManagerDashboardHome = lazy(() => import('./ManagerDashboardHome'));

const MANAGER_TAB_IDS = new Set([
  'dashboard',
  'client-list',
  'weekly',
  'payment-approvals',
  'clients',
  'collection',
  'defaulters',
  'monthly-profit',
  'reminders',
  'add',
  'daily-report',
]);

function getManagerTabFromHash() {
  if (typeof window === 'undefined') return 'dashboard';
  const tabId = window.location.hash.replace('#', '').trim();
  return MANAGER_TAB_IDS.has(tabId) ? tabId : 'dashboard';
}

function syncManagerHash(nextTab) {
  if (typeof window === 'undefined' || !MANAGER_TAB_IDS.has(nextTab)) return;
  const nextHash = `#${nextTab}`;
  if (window.location.hash === nextHash) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
}

const emptyClient = {
  uniqueNo: '',
  name: '',
  place: '',
  phone: '',
  amountTaken: '',
  dateTaken: '',
  totalWeeks: '25',
  interestRate: '',
  weeklyPayment: '',
  username: '',
  password: '',
};

const emptyCollection = {
  name: '',
  collection: '',
  charges: '',
  payments: '',
  previousAmount: '',
  entryDate: new Date().toISOString().slice(0, 10),
};

const COLLECTION_AMOUNT_FIELDS = [
  { name: 'previousAmount', label: 'Previous Amount', sign: '+' },
  { name: 'collection', label: 'Collection', sign: '+' },
  { name: 'charges', label: 'Charges', sign: '-' },
  { name: 'payments', label: 'Payments', sign: '-' },
];

const emptyCollectionAdjustments = COLLECTION_AMOUNT_FIELDS.reduce(
  (fields, field) => ({ ...fields, [field.name]: '' }),
  {}
);

const emptyRenewal = {
  previousAmount: '',
  amountTaken: '',
  dateTaken: new Date().toISOString().slice(0, 10),
  interestRate: '',
  totalWeeks: '25',
  weeklyPayment: '',
  note: '',
};

const RENEWAL_TOTAL_WEEKS = 25;
const CLIENT_WEEK_OPTIONS = [12, 25];

function getClientInterestRateForWeeks(totalWeeks) {
  return Number(totalWeeks) === 12 ? 20 : 25;
}

const ACTION_ICONS = {
  view: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" />
    </svg>
  ),
  renew: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M18 2v4h4" />
      <path d="M6 22v-4H2" />
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z" />
      <path d="M9 8.5c.4 2.5 2 4.1 4.5 4.5l1.2-1.2 2.1 1.1c-.4 1.6-1.5 2.4-3.2 2.2-3.4-.4-6.3-3.3-6.7-6.7-.2-1.7.6-2.8 2.2-3.2l1.1 2.1L9 8.5z" />
    </svg>
  ),
};

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function createEmptyWeeklyStatus() {
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return { weekStart: weekStart.toISOString(), clients: [] };
}

function calcBalance(row) {
  return (
    Number(row.previousAmount || 0) +
    Number(row.collection || 0) -
    Number(row.charges || 0) -
    Number(row.payments || 0)
  );
}

function formatAmountInput(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function calcRenewalPrincipal(previousAmount, newAmount) {
  const previous = Number(previousAmount || 0);
  const next = Number(newAmount || 0);
  return previous + next;
}
function calcTopUpInterest(previousAmount, newAmount, interestRate) {
  const totalPrincipal =
    Number(previousAmount || 0) +
    Number(newAmount || 0);

  return (totalPrincipal * Number(interestRate || 0)) / 100;
}

function calcTopUpTotal(previousAmount, newAmount, interestRate) {
  const totalPrincipal =
    Number(previousAmount || 0) +
    Number(newAmount || 0);

  const interest =
    (totalPrincipal * Number(interestRate || 0)) / 100;

  return totalPrincipal + interest;
}

function calcRenewalWeeklyAmount(
  previousAmount,
  newAmount,
  interestRate
) {
  if (newAmount === '') return '';

  const totalPayable = calcTopUpTotal(
    previousAmount,
    newAmount,
    interestRate
  );

  let totalWeeks = 25;

  if (Number(interestRate) === 20) {
    totalWeeks = 12;
  }

  if (Number(interestRate) === 25) {
    totalWeeks = 25;
  }

  const weekly = totalPayable / totalWeeks;

  return Number.isInteger(weekly)
    ? String(weekly)
    : weekly.toFixed(2);
}
function getFirstPaymentDateFromTopUp(date) {
  const d = new Date(date || new Date());
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysUntilNextSunday = day === 0 ? 7 : 7 - day;
  d.setDate(d.getDate() + daysUntilNextSunday);
  return d;
}

const DASHBOARD_CACHE_KEY = 'lakshmi-dashboard-cache';
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000;

function getDashboardCache() {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > DASHBOARD_CACHE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function setDashboardCache(data) {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore storage failures
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WeeklyPaymentsModule — full featured paid/pending module
// ─────────────────────────────────────────────────────────────────────────────
function WkAvatar({ name, photo, tone = 'gold' }) {
  if (photo) {
    return (
      <span className="wk2-avatar">
        <img src={photo} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span className={`wk2-avatar wk2-avatar--${tone}`}>
      {(name?.[0] || '?').toUpperCase()}
    </span>
  );
}

function exportToCSV(rows, weekLabel) {
  const headers = ['#', 'Name', 'Place', 'Phone', 'Amount', 'Week', 'Paid At', 'Status'];
  const lines = [
    headers.join(','),
    ...rows.map((c, i) =>
      [
        i + 1,
        `"${c.name}"`,
        `"${c.place}"`,
        `"${c.phone}"`,
        c.weeklyPayment,
        `"Week ${c.schedule?.currentWeekNumber || ''} – ${weekLabel}"`,
        c.paidAt ? new Date(c.paidAt).toLocaleString('en-IN') : '',
        c.paid ? 'Paid' : 'Pending',
      ].join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weekly-payments-${weekLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToPDF(paidList, pendingList, weekLabel, totalCollection) {
  const win = window.open('', '_blank');
  if (!win) return;
  const safe = (v) => String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const rows = (list, type) =>
    list.map((c, i) => `
      <tr class="${type}">
        <td>${i + 1}</td>
        <td>${safe(c.name)}</td>
        <td>${safe(c.place)}</td>
        <td>${safe(c.phone)}</td>
        <td>${money(c.weeklyPayment)}</td>
        <td>Week ${c.schedule?.currentWeekNumber || ''}</td>
        <td>${c.paidAt ? new Date(c.paidAt).toLocaleString('en-IN') : '—'}</td>
        <td><span class="badge-${type}">${type === 'paid' ? '✓ Paid' : '⏳ Pending'}</span></td>
      </tr>`).join('');

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"/><title>Weekly Payments – ${safe(weekLabel)}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:24px;background:#f8fafc;color:#0f172a}
      h1{color:#14532d;margin:0 0 4px}p.sub{color:#64748b;font-size:13px;margin:0 0 20px}
      .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
      .kpi-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px}
      .kpi-card strong{display:block;font-size:22px;color:#0f3d24}
      .kpi-card span{font-size:11px;color:#64748b}
      h2{color:#14532d;font-size:15px;margin:20px 0 8px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#14532d;color:#fef08a;padding:8px 10px;text-align:left}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
      tr.paid td{background:#f0fdf4}tr.pending td{background:#fffbeb}
      .badge-paid{background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
      .badge-pending{background:#fef9c3;color:#b45309;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
      .footer{margin-top:32px;text-align:center;font-size:11px;color:#94a3b8}
      @media print{body{padding:10px}}
    </style></head><body>
    <h1>Weekly Payments Report</h1>
    <p class="sub">Week of ${safe(weekLabel)} &nbsp;•&nbsp; Generated ${new Date().toLocaleString('en-IN')}</p>
    <div class="kpi">
      <div class="kpi-card"><strong>${paidList.length}</strong><span>Paid Customers</span></div>
      <div class="kpi-card"><strong>${pendingList.length}</strong><span>Pending Customers</span></div>
      <div class="kpi-card"><strong>${money(totalCollection)}</strong><span>Total Collected</span></div>
      <div class="kpi-card"><strong>${money(pendingList.reduce((s,c)=>s+c.weeklyPayment,0))}</strong><span>Pending Amount</span></div>
    </div>
    <h2>✓ Paid This Week (${paidList.length})</h2>
    <table><thead><tr><th>#</th><th>Name</th><th>Place</th><th>Phone</th><th>Amount</th><th>Week</th><th>Paid At</th><th>Status</th></tr></thead>
    <tbody>${rows(paidList, 'paid')}</tbody></table>
    <h2>⏳ Pending This Week (${pendingList.length})</h2>
    <table><thead><tr><th>#</th><th>Name</th><th>Place</th><th>Phone</th><th>Amount</th><th>Week</th><th>Due</th><th>Status</th></tr></thead>
    <tbody>${rows(pendingList, 'pending')}</tbody></table>
    <div class="footer">Lakshmi Ganapati Finance — Trust · Transparency · Growth</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

function pdfText(value, fallback = '-') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function pdfMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
}

function drawPdfCell(doc, text, x, y, width, options = {}) {
  const lines = doc.splitTextToSize(pdfText(text), width).slice(0, options.lines || 1);
  doc.text(lines, x, y);
}

const MONTHLY_DETAIL_LABELS = {
  collectionIncome: 'Collection income details',
  weeklyIncome: 'Weekly income details',
  charges: 'Charges details',
  paymentsOut: 'Payments out details',
  monthlyProfit: 'Monthly profit breakdown',
};

const MONTHLY_COLLECTION_DETAIL_CONFIG = {
  collectionIncome: {
    field: 'collection',
    fallbackName: 'Collection entry',
  },
  charges: {
    field: 'charges',
    fallbackName: 'Charge entry',
  },
  paymentsOut: {
    field: 'payments',
    fallbackName: 'Payment entry',
  },
};

function getDefaulterDaysLate(week) {
  const days = Number(week?.daysUntilDue);
  return Number.isFinite(days) && days < 0 ? Math.abs(days) : 0;
}

function groupDefaultersByClient(defaulters) {
  const grouped = [];
  const seen = new Map();
  defaulters.forEach((d) => {
    const key = String(d.clientId);
    if (!seen.has(key)) {
      seen.set(key, grouped.length);
      grouped.push({ ...d, pendingWeeks: [d] });
    } else {
      grouped[seen.get(key)].pendingWeeks.push(d);
    }
  });
  grouped.forEach((entry) => {
    entry.pendingWeeks.sort(
      (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
    );
  });
  return grouped;
}

function isInReportMonth(value, monthValue) {
  if (!value || !monthValue) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const [year, month] = monthValue.split('-').map(Number);
  return date.getFullYear() === year && date.getMonth() + 1 === month;
}

function buildMonthlyProfitRows(summary = {}) {
  const collectionIncome = Number(summary.collectionIncome || 0);
  const weeklyIncome = Number(summary.weeklyIncome || 0);
  const chargesIncome = Number(summary.chargesIncome || 0);
  const paymentsOut = Number(summary.paymentsOut || 0);
  const profit = Number(summary.profit ?? collectionIncome + weeklyIncome + chargesIncome - paymentsOut);

  return [
    { label: 'Collection income', amount: collectionIncome, type: 'income' },
    { label: 'Weekly income', amount: weeklyIncome, type: 'income' },
    { label: 'Charges', amount: chargesIncome, type: 'income' },
    { label: 'Payments out', amount: paymentsOut, type: 'expense' },
    { label: 'Monthly profit', amount: profit, type: profit >= 0 ? 'profit' : 'loss' },
  ];
}

function buildCollectionDetailRows(entries = [], monthValue, detailKey) {
  const config = MONTHLY_COLLECTION_DETAIL_CONFIG[detailKey];
  if (!config) return [];

  return entries
    .filter((entry) => isInReportMonth(entry.entryDate, monthValue))
    .filter((entry) => Number(entry[config.field] || 0) > 0)
    .map((entry) => ({
      _id: entry._id,
      name: entry.name || config.fallbackName,
      date: entry.entryDate,
      amount: Number(entry[config.field] || 0),
      previousAmount: Number(entry.previousAmount || 0),
      note: entry.note || '',
    }));
}

function getMonthKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isCurrentWeekPaymentRow(row, weeklyStatus) {
  if (!row || !weeklyStatus?.weekStart) return false;
  return (
    getDateKey(row.weekStart) === getDateKey(weeklyStatus.weekStart) &&
    row.paymentStatus !== 'not-started' &&
    row.paymentStatus !== 'completed' &&
    row.schedule?.isActiveWeek !== false
  );
}

function getCurrentWeekPaidRows(weeklyStatus) {
  return (weeklyStatus?.clients || []).filter(
    (row) => row.paid && isCurrentWeekPaymentRow(row, weeklyStatus)
  );
}

function mergeReportWithCurrentWeeklyIncome(report, weeklyStatus) {
  if (!report || !weeklyStatus || report.month !== getMonthKey(weeklyStatus.weekStart)) {
    return report;
  }

  const paidRows = getCurrentWeekPaidRows(weeklyStatus);
  const weeklyIncome = paidRows.reduce((sum, row) => sum + Number(row.weeklyPayment || 0), 0);
  const summary = report.summary || {};
  const collectionIncome = Number(summary.collectionIncome || 0);
  const chargesIncome = Number(summary.chargesIncome || 0);
  const paymentsOut = Number(summary.paymentsOut || 0);
  const totalIncome = collectionIncome + chargesIncome + weeklyIncome;
  const profit = totalIncome - paymentsOut;
  const details = report.details || {};

  return {
    ...report,
    summary: {
      ...summary,
      weeklyIncome,
      weeklyPaymentsCount: paidRows.length,
      totalIncome,
      profit,
    },
    details: {
      ...details,
      weeklyIncome: paidRows.map((row) => ({
        _id: row.paymentId || row.clientId,
        name: row.name,
        place: row.place || '',
        phone: row.phone || '',
        amount: Number(row.weeklyPayment || 0),
        weekStart: row.weekStart,
        paidAt: row.paidAt,
      })),
      monthlyProfit: buildMonthlyProfitRows({
        ...summary,
        weeklyIncome,
        profit,
      }),
    },
  };
}

async function downloadClientListPdf(rows, filters = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const generatedAt = new Date().toLocaleString('en-IN');
  const fileDate = new Date().toISOString().slice(0, 10);
  const reportRows = Array.isArray(rows) ? rows : [];
  const totals = {
    clients: reportRows.length,
    loan: reportRows.reduce((sum, row) => sum + Number(row.amountTaken || 0), 0),
    paid: reportRows.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0),
    pending: reportRows.reduce((sum, row) => sum + Number(row.remainingAmount || 0), 0),
  };

  const columns = [
    { label: '#', key: 'index', width: 8 },
    { label: 'Client', key: 'client', width: 46 },
    { label: 'Contact', key: 'contact', width: 36 },
    { label: 'Loan', key: 'loan', width: 38 },
    { label: 'Paid', key: 'paid', width: 25 },
    { label: 'Balance', key: 'balance', width: 29 },
    { label: 'Weekly', key: 'weekly', width: 24 },
    { label: 'Week', key: 'week', width: 39 },
    { label: 'Status', key: 'status', width: 32 },
  ].reduce((cols, column, index) => {
    const previous = cols[index - 1];
    const x = previous ? previous.x + previous.width : margin;
    cols.push({ ...column, x });
    return cols;
  }, []);

  const drawHeader = () => {
    doc.setFillColor(2, 54, 31);
    doc.rect(0, 0, pageWidth, 31, 'F');
    doc.setFillColor(255, 212, 92);
    doc.circle(18, 15.5, 7, 'F');
    doc.setTextColor(2, 54, 31);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('LG', 18, 18.4, { align: 'center' });

    doc.setTextColor(255, 212, 92);
    doc.setFontSize(17);
    doc.text(`${BRAND_NAME} Finance`, 29, 13);
    doc.setTextColor(220, 236, 224);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Client List Report', 29, 20);
    doc.text(`Generated: ${generatedAt}`, pageWidth - margin, 13, { align: 'right' });
    doc.text(
      `Search: ${pdfText(filters.search, 'All')}  |  Place: ${pdfText(filters.place, 'All')}  |  Status: ${pdfText(filters.status, 'All')}`,
      pageWidth - margin,
      20,
      { align: 'right' }
    );
  };

  const drawSummary = () => {
    const cards = [
      ['Clients', totals.clients],
      ['Loan Amount', pdfMoney(totals.loan)],
      ['Paid Amount', pdfMoney(totals.paid)],
      ['Pending Balance', pdfMoney(totals.pending)],
    ];
    const cardWidth = (pageWidth - margin * 2 - 9) / 4;
    cards.forEach(([label, value], index) => {
      const x = margin + index * (cardWidth + 3);
      doc.setFillColor(245, 250, 246);
      doc.setDrawColor(214, 180, 88);
      doc.roundedRect(x, 37, cardWidth, 18, 2, 2, 'FD');
      doc.setTextColor(20, 83, 45);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(String(value), x + 4, 46);
      doc.setTextColor(91, 111, 97);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(label, x + 4, 51.5);
    });
  };

  const drawTableHeader = (y) => {
    doc.setFillColor(20, 83, 45);
    doc.rect(margin, y, pageWidth - margin * 2, 9, 'F');
    doc.setTextColor(255, 239, 178);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.7);
    columns.forEach((column) => doc.text(column.label, column.x + 1.5, y + 6));
    return y + 10;
  };

  const drawFooter = () => {
    const pageCount = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setTextColor(113, 128, 116);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`${BRAND_NAME} Finance - Trust, Transparency, Growth`, margin, pageHeight - 6);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }
  };

  drawHeader();
  drawSummary();
  let y = drawTableHeader(62);
  const rowHeight = 14;

  if (!reportRows.length) {
    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('No clients match the selected filters.', margin, y + 12);
  }

  reportRows.forEach((row, index) => {
    if (y + rowHeight > pageHeight - 13) {
      doc.addPage();
      drawHeader();
      y = drawTableHeader(39);
    }

    if (index % 2 === 0) {
      doc.setFillColor(248, 252, 249);
      doc.rect(margin, y - 1, pageWidth - margin * 2, rowHeight, 'F');
    }

    doc.setDrawColor(222, 232, 225);
    doc.line(margin, y + rowHeight - 1, pageWidth - margin, y + rowHeight - 1);
    doc.setFontSize(7.2);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');

    drawPdfCell(doc, String(row.reportIndex || index + 1), columns[0].x + 1.5, y + 5, columns[0].width - 2);
    drawPdfCell(doc, row.name, columns[1].x + 1.5, y + 4.6, columns[1].width - 3);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    drawPdfCell(doc, row.uniqueNo ? `No: ${row.uniqueNo}` : row.place, columns[1].x + 1.5, y + 9.6, columns[1].width - 3);
    drawPdfCell(doc, `${row.phone || '-'} / ${row.place || '-'}`, columns[2].x + 1.5, y + 5.4, columns[2].width - 3, { lines: 2 });

    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    drawPdfCell(doc, `Taken ${pdfMoney(row.amountTaken)}`, columns[3].x + 1.5, y + 4.6, columns[3].width - 3);
    doc.setFont('helvetica', 'normal');
    drawPdfCell(doc, `Total ${pdfMoney(row.totalPayable)}`, columns[3].x + 1.5, y + 9.6, columns[3].width - 3);
    doc.setFont('helvetica', 'bold');
    drawPdfCell(doc, pdfMoney(row.paidAmount), columns[4].x + 1.5, y + 6.5, columns[4].width - 3);
    drawPdfCell(doc, pdfMoney(row.remainingAmount), columns[5].x + 1.5, y + 6.5, columns[5].width - 3);
    drawPdfCell(doc, pdfMoney(row.weeklyPayment), columns[6].x + 1.5, y + 6.5, columns[6].width - 3);
    drawPdfCell(doc, row.weekText, columns[7].x + 1.5, y + 5.1, columns[7].width - 3, { lines: 2 });

    const statusColor = row.statusGroup === 'paid'
      ? [22, 101, 52]
      : row.statusGroup === 'not-started'
        ? [37, 99, 235]
        : [180, 83, 9];
    doc.setTextColor(...statusColor);
    drawPdfCell(doc, row.statusText, columns[8].x + 1.5, y + 6.5, columns[8].width - 3, { lines: 2 });
    y += rowHeight;
  });

  drawFooter();
  doc.save(`client-list-${fileDate}.pdf`);
}

function formatMonthLabel(monthStr) {
  if (!monthStr) return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const [year, month] = String(monthStr).split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

async function downloadMonthlyProfitReportPdf(report) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 16;
  const summary = report?.summary || {};
  const monthLabel = formatMonthLabel(report?.month);
  const generatedAt = new Date().toLocaleString('en-IN');
  const rows = [
    ['Collection income', pdfMoney(summary.collectionIncome), `${summary.entriesCount || 0} collection entries`],
    ['Weekly income', pdfMoney(summary.weeklyIncome), `${summary.weeklyPaymentsCount || 0} weekly payment entries only`],
    ['Charges', pdfMoney(summary.chargesIncome), 'Collection entry charges'],
    ['Payments out', pdfMoney(summary.paymentsOut), 'Collection entry payments'],
    ['Total income', pdfMoney(summary.totalIncome), 'Collection + charges + weekly income'],
    ['Monthly profit', pdfMoney(summary.profit), 'Total income - payments out'],
  ];

  doc.setFillColor(2, 54, 31);
  doc.rect(0, 0, width, 38, 'F');
  doc.setFillColor(255, 212, 92);
  doc.circle(25, 19, 8, 'F');
  doc.setTextColor(2, 54, 31);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('LG', 25, 22.2, { align: 'center' });

  doc.setTextColor(255, 212, 92);
  doc.setFontSize(18);
  doc.text(`${BRAND_NAME} Finance`, 38, 17);
  doc.setTextColor(220, 236, 224);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Monthly Profit Report - ${monthLabel}`, 38, 25);
  doc.text(`Generated: ${generatedAt}`, width - margin, 17, { align: 'right' });

  const cardY = 50;
  const cardW = (width - margin * 2 - 8) / 3;
  [
    ['Weekly income', pdfMoney(summary.weeklyIncome), `${summary.weeklyPaymentsCount || 0} weekly payments`],
    ['Total income', pdfMoney(summary.totalIncome), 'Income before payments out'],
    ['Monthly profit', pdfMoney(summary.profit), 'Final profit'],
  ].forEach(([label, value, note], index) => {
    const x = margin + index * (cardW + 4);
    doc.setFillColor(index === 2 ? 255 : 246, index === 2 ? 247 : 251, index === 2 ? 223 : 247);
    doc.setDrawColor(214, 180, 88);
    doc.roundedRect(x, cardY, cardW, 25, 2, 2, 'FD');
    doc.setTextColor(20, 83, 45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(value, x + 5, cardY + 11);
    doc.setTextColor(88, 111, 96);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(label, x + 5, cardY + 17);
    doc.text(note, x + 5, cardY + 21.5);
  });

  let y = 92;
  doc.setTextColor(20, 83, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Report Details', margin, y);
  y += 7;

  doc.setFillColor(20, 83, 45);
  doc.rect(margin, y, width - margin * 2, 9, 'F');
  doc.setTextColor(255, 239, 178);
  doc.setFontSize(9);
  doc.text('Item', margin + 4, y + 6);
  doc.text('Amount', margin + 72, y + 6);
  doc.text('Count / Source', margin + 122, y + 6);
  y += 10;

  rows.forEach(([label, amount, note], index) => {
    if (index % 2 === 0) {
      doc.setFillColor(248, 252, 249);
      doc.rect(margin, y - 1, width - margin * 2, 11, 'F');
    }
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, margin + 4, y + 6);
    doc.text(amount, margin + 72, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(note, margin + 122, y + 6);
    y += 11;
  });

  doc.setDrawColor(214, 180, 88);
  doc.line(margin, y + 8, width - margin, y + 8);
  doc.setTextColor(20, 83, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Note: Weekly income is calculated only from paid weekly payment records.', margin, y + 18);

  doc.setTextColor(113, 128, 116);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${BRAND_NAME} Finance - Trust, Transparency, Growth`, margin, height - 10);
  doc.text('Authorized Signature: N.K.V.REDDY', width - margin, height - 10, { align: 'right' });

  doc.save(`monthly-profit-${report?.month || new Date().toISOString().slice(0, 7)}.pdf`);
}

function WeeklyPaymentsModule({ weekly, loading, bulkReminding, formatDate, formatMoney, togglePaid, sendReminder, sendBulkReminders, handleWhatsApp }) {
  const [activeTab, setActiveTab]   = useState('paid');
  const [search, setSearch]         = useState('');
  const [filterPlace, setFilterPlace] = useState('');
  const [filterDate, setFilterDate]   = useState('');
  const [loaderExpired, setLoaderExpired] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoaderExpired(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setLoaderExpired(true), 12000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const weeklyData = weekly || createEmptyWeeklyStatus();
  const isLoading = loading && !loaderExpired;
  const allClients  = weeklyData?.clients || [];
  const paidList    = useMemo(
    () => allClients
      .filter((c) => c.paid && isCurrentWeekPaymentRow(c, weeklyData))
      .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)),
    [allClients, weeklyData]
  );
  const pendingList = useMemo(
    () => allClients.filter((c) => !c.paid && isCurrentWeekPaymentRow(c, weeklyData)),
    [allClients, weeklyData]
  );
  const notStartedList = useMemo(() => allClients.filter((c) => c.paymentStatus === 'not-started'), [allClients]);
  const totalActive = allClients.filter((c) => isCurrentWeekPaymentRow(c, weeklyData)).length;
  const totalCollection = paidList.reduce((s, c) => s + c.weeklyPayment, 0);
  const pendingAmount   = pendingList.reduce((s, c) => s + c.weeklyPayment, 0);
  const progressPct     = totalActive > 0 ? Math.round((paidList.length / totalActive) * 100) : 0;

  const places = useMemo(() => [...new Set(allClients.map((c) => c.place).filter(Boolean))].sort(), [allClients]);

  const applyFilter = (list) => {
    let out = list;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((c) => c.name.toLowerCase().includes(q) || c.place.toLowerCase().includes(q) || c.phone.includes(q));
    }
    if (filterPlace) out = out.filter((c) => c.place === filterPlace);
    if (filterDate)  out = out.filter((c) => c.paidAt && new Date(c.paidAt).toISOString().slice(0, 10) === filterDate);
    return out;
  };

  const filteredPaid    = applyFilter(paidList);
  const filteredPending = applyFilter(pendingList);
  const weekLabel = weeklyData?.weekStart ? formatDate(weeklyData.weekStart) : '';

  if (isLoading) {
    return (
      <section className="section anim-tab-in">
        <div className="wk2-skeleton-header" />
        <div className="wk2-skeleton-pills" />
        <div className="wk2-skeleton-table" />
      </section>
    );
  }

  return (
    <section key="weekly-tab" className="section anim-tab-in wk2-wrap">
      {loaderExpired && loading && (
        <div className="alert error">
          Weekly payments are taking too long to load. Showing the weekly page now; try again to refresh live data.
        </div>
      )}

      {/* ── Page header ── */}
      <div className="wk2-page-header">
        <div>
          <h2 className="wk2-title">
            <svg className="wk2-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            Weekly Payments
            {weekLabel && <span className="wk2-week-badge">Week of {weekLabel}</span>}
          </h2>
          <p className="wk2-subtitle">Current week payment tracking — all clients at a glance</p>
        </div>
        <div className="wk2-header-actions">
          <button type="button" className="wk2-btn wk2-btn--export" onClick={() => exportToCSV(activeTab === 'paid' ? filteredPaid : filteredPending, weekLabel)} title="Export Excel/CSV">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
          <button type="button" className="wk2-btn wk2-btn--pdf" onClick={() => exportToPDF(paidList, pendingList, weekLabel, totalCollection)} title="Download PDF">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
          <button type="button" className="wk2-btn wk2-btn--remind" disabled={bulkReminding} onClick={sendBulkReminders}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
            {bulkReminding ? 'Sending…' : 'Remind All'}
          </button>
        </div>
      </div>

      {/* ── KPI summary cards ── */}
      <div className="wk2-kpi-row">
        <div className="wk2-kpi wk2-kpi--green">
          <div className="wk2-kpi__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <strong>{paidList.length}</strong>
            <span>Paid This Week</span>
            <em>out of {totalActive} active</em>
          </div>
        </div>
        <div className="wk2-kpi wk2-kpi--gold">
          <div className="wk2-kpi__icon">₹</div>
          <div>
            <strong>{formatMoney(totalCollection)}</strong>
            <span>Total Collected</span>
            <em>this week</em>
          </div>
        </div>
        <div className="wk2-kpi wk2-kpi--orange">
          <div className="wk2-kpi__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <strong>{pendingList.length}</strong>
            <span>Pending Customers</span>
            <em>yet to pay</em>
          </div>
        </div>
        <div className="wk2-kpi wk2-kpi--red">
          <div className="wk2-kpi__icon">!</div>
          <div>
            <strong>{formatMoney(pendingAmount)}</strong>
            <span>Pending Amount</span>
            <em>outstanding</em>
          </div>
        </div>
        {notStartedList.length > 0 && (
          <div className="wk2-kpi wk2-kpi--blue">
            <div className="wk2-kpi__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
            </div>
            <div>
              <strong>{notStartedList.length}</strong>
              <span>Starting Next Week</span>
              <em>new customers</em>
            </div>
          </div>
        )}
      </div>

      {/* ── Collection progress bar ── */}
      <div className="wk2-progress-wrap">
        <div className="wk2-progress-header">
          <span>Collection Progress</span>
          <strong>{progressPct}% &nbsp;({paidList.length}/{totalActive} customers)</strong>
        </div>
        <div className="wk2-progress-track">
          <div className="wk2-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="wk2-progress-labels">
          <span style={{ color: '#4ade80' }}>Collected: {formatMoney(totalCollection)}</span>
          <span style={{ color: '#fbbf24' }}>Pending: {formatMoney(pendingAmount)}</span>
        </div>
      </div>

      {/* ── Filters row ── */}
      <div className="wk2-filters">
        <div className="wk2-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="search" placeholder="Search customer name, place, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="wk2-select" value={filterPlace} onChange={(e) => setFilterPlace(e.target.value)}>
          <option value="">All Places</option>
          {places.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input type="date" className="wk2-select" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} title="Filter by paid date" />
        {(search || filterPlace || filterDate) && (
          <button type="button" className="wk2-btn wk2-btn--clear" onClick={() => { setSearch(''); setFilterPlace(''); setFilterDate(''); }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="wk2-tabs">
        <button type="button" className={`wk2-tab ${activeTab === 'paid' ? 'wk2-tab--active-green' : ''}`} onClick={() => setActiveTab('paid')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
          Paid This Week
          <span className="wk2-tab-badge wk2-tab-badge--green">{paidList.length}</span>
        </button>
        <button type="button" className={`wk2-tab ${activeTab === 'pending' ? 'wk2-tab--active-orange' : ''}`} onClick={() => setActiveTab('pending')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Pending This Week
          <span className="wk2-tab-badge wk2-tab-badge--orange">{pendingList.length}</span>
        </button>
      </div>

      {/* ── PAID TAB ── */}
      {activeTab === 'paid' && (
        <div className="wk2-panel anim-scale-in">
          {filteredPaid.length === 0 ? (
            <div className="wk2-empty">
              {search || filterPlace || filterDate ? 'No matching records found.' : '⏳ No payments received yet this week.'}
            </div>
          ) : (
            <>
              {/* Card grid for paid customers */}
              <div className="wk2-paid-grid">
                {filteredPaid.map((c, i) => (
                  <div key={c.clientId} className="wk2-paid-card anim-fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
                    <div className="wk2-paid-card__top">
                      <WkAvatar name={c.name} photo={c.profilePhoto} tone="paid" />
                      <div className="wk2-paid-card__check">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    </div>
                    <div className="wk2-paid-card__body">
                      <strong className="wk2-paid-card__name">{c.name}</strong>
                      <span className="wk2-paid-card__place">{c.place}</span>
                      <div className="wk2-paid-card__amount">{formatMoney(c.weeklyPayment)}</div>
                      <div className="wk2-paid-card__meta">
                        <span>Week {c.schedule?.currentWeekNumber || ''}</span>
                        {c.paidAt && (
                          <span>{new Date(c.paidAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </div>
                      <div className="wk2-paid-card__method">
                        {c.paymentStatus === 'approved' ? (
                          <span className="wk2-method-badge wk2-method-badge--upi">UPI / Screenshot</span>
                        ) : (
                          <span className="wk2-method-badge wk2-method-badge--cash">Cash / Direct</span>
                        )}
                      </div>
                      <span className="wk2-status-badge wk2-status-badge--paid">✓ Paid</span>
                    </div>
                    <button type="button" className="wk2-paid-card__undo" onClick={() => togglePaid(c.paymentId, c.paid)} title="Mark as unpaid">
                      Undo
                    </button>
                  </div>
                ))}
              </div>

              {/* Also show table below cards for full detail */}
              <div className="table-wrap" style={{ marginTop: '1.5rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Customer</th>
                      <th>Place</th>
                      <th>Phone</th>
                      <th>Amount</th>
                      <th>Week</th>
                      <th>Paid At</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPaid.map((c, i) => (
                      <tr key={c.clientId} className="wk2-tr-paid anim-row-in" style={{ animationDelay: `${i * 0.03}s` }}>
                        <td className="wk2-row-num">{i + 1}</td>
                        <td>
                          <div className="wk2-name-cell">
                            <WkAvatar name={c.name} photo={c.profilePhoto} tone="paid" />
                            <div>
                              <strong>{c.name}</strong>
                            </div>
                          </div>
                        </td>
                        <td>{c.place}</td>
                        <td>{c.phone}</td>
                        <td><strong>{formatMoney(c.weeklyPayment)}</strong></td>
                        <td>
                          Week {c.schedule?.currentWeekNumber || ''}
                          <span className="reminder-list__due">Starting {formatDate(c.weekStart)}</span>
                        </td>
                        <td>
                          {c.paidAt
                            ? new Date(c.paidAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : <span className="muted-text">—</span>}
                        </td>
                        <td>
                          {c.paymentStatus === 'approved'
                            ? <span className="wk2-method-badge wk2-method-badge--upi">UPI</span>
                            : <span className="wk2-method-badge wk2-method-badge--cash">Cash</span>}
                        </td>
                        <td><span className="wk2-status-badge wk2-status-badge--paid">✓ Paid</span></td>
                        <td>
                          <button type="button" className="btn small" onClick={() => togglePaid(c.paymentId, c.paid)}>
                            Mark unpaid
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PENDING TAB ── */}
      {activeTab === 'pending' && (
        <div className="wk2-panel anim-scale-in">
          {filteredPending.length === 0 ? (
            <div className="wk2-empty wk2-empty--success">
              🎉 All active customers have paid this week!
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th>Place</th>
                    <th>Phone</th>
                    <th>Amount Due</th>
                    <th>Week</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map((c, i) => (
                    <tr key={c.clientId} className={`anim-row-in ${c.isOverdue ? 'wk2-tr-overdue' : 'wk2-tr-pending'}`} style={{ animationDelay: `${i * 0.03}s` }}>
                      <td className="wk2-row-num">{i + 1}</td>
                      <td>
                        <div className="wk2-name-cell">
                          <WkAvatar name={c.name} photo={c.profilePhoto} tone={c.isOverdue ? 'overdue' : 'pending'} />
                          <div>
                            <strong>{c.name}</strong>
                            {c.isOverdue && <span className="defaulter-overdue-tag">Overdue</span>}
                          </div>
                        </div>
                      </td>
                      <td>{c.place}</td>
                      <td>{c.phone}</td>
                      <td><strong>{formatMoney(c.weeklyPayment)}</strong></td>
                      <td>
                        Week {c.schedule?.currentWeekNumber || ''}
                        <span className="reminder-list__due">Starting {formatDate(c.weekStart)}</span>
                      </td>
                      <td>
                        {c.paymentStatus === 'submitted' && <span className="reminder-tag">Approval pending</span>}
                        {c.paymentStatus === 'rejected' && <span className="reminder-tag">Rejected</span>}
                        {c.reminderSent && <span className="reminder-tag">Reminded</span>}
                        {c.paymentStatus === 'pending' && !c.reminderSent && (
                          <span className="badge warning">Pending</span>
                        )}
                      </td>
                      <td className="actions">
                        {c.paymentId && (
                          <>
                            <button type="button" className="btn small" onClick={() => togglePaid(c.paymentId, c.paid)}>Mark paid</button>
                            <button type="button" className="btn small warning" onClick={() => sendReminder(c.paymentId, true)}>Remind</button>
                            <button type="button" className="btn small whatsapp" onClick={() => handleWhatsApp(c.phone, c.reminderMessage || c.reminderPreview)}>WhatsApp</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── STARTING NEXT WEEK panel (always visible when relevant) ── */}
      {notStartedList.length > 0 && (
        <div className="wk2-nextweek-panel anim-fade-up">
          <div className="wk2-nextweek-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
              <path d="M12 14v4M10 16h4"/>
            </svg>
            <div>
              <strong>Starting Next Week — {notStartedList.length} new customer{notStartedList.length > 1 ? 's' : ''}</strong>
              <p>
                These customers received their amount this week.
                Their first payment starts from <strong>next Sunday</strong> onwards.
                No payment is expected from them this week.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Place</th>
                  <th>Phone</th>
                  <th>Weekly Amount</th>
                  <th>Amount Taken On</th>
                  <th>Week 1 Starts</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {notStartedList.map((c, i) => (
                  <tr key={c.clientId} className="wk2-tr-nextweek anim-row-in" style={{ animationDelay: `${i * 0.04}s` }}>
                    <td className="wk2-row-num">{i + 1}</td>
                    <td>
                      <div className="wk2-name-cell">
                        <WkAvatar name={c.name} photo={c.profilePhoto} tone="blue" />
                        <strong>{c.name}</strong>
                      </div>
                    </td>
                    <td>{c.place}</td>
                    <td>{c.phone}</td>
                    <td><strong>{formatMoney(c.weeklyPayment)}</strong></td>
                    <td>
                      {/* dateTaken = the week that starts the schedule */}
                      <span className="reminder-list__due">This week</span>
                    </td>
                    <td>
                      {/* firstPaymentWeekStart = next Sunday */}
                      <strong style={{ color: '#60a5fa' }}>
                        {formatDate(c.weekStart)}
                      </strong>
                      <span className="reminder-list__due">Week 1 of {c.schedule?.totalWeeks || c.totalWeeks || 25}</span>
                    </td>
                    <td>
                      <span className="wk2-status-badge wk2-status-badge--nextweek">
                        📅 Starts Next Week
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function ClientListModule({
  clients,
  weekly,
  loading,
  searchClient,
  onSearchChange,
  placeFilter,
  onPlaceFilterChange,
  statusFilter,
  onStatusFilterChange,
  onResetFilters,
  onAddClient,
  formatDate,
  formatMoney,
  togglePaid,
  sendReminder,
  handleWhatsApp,
  startRenewal,
  onViewPlan,
}) {
  const weeklyByClient = useMemo(() => {
    const map = new Map();
    (weekly?.clients || []).forEach((row) => {
      if (row.clientId) map.set(String(row.clientId), row);
    });
    return map;
  }, [weekly]);

  const places = useMemo(
    () => [...new Set(clients.map((client) => client.place).filter(Boolean))].sort(),
    [clients]
  );

  const allRows = useMemo(
    () =>
      clients.map((client) => {
        const week = weeklyByClient.get(String(client._id)) || null;
        const amountTaken = Number(client.amountTaken || 0);
        const interestAmount = Number(
          client.interestAmount ?? calcInterestAmount(client.amountTaken, client.interestRate)
        );
        const totalPayable = Number(
          client.totalPayable ?? client.totalAmount ?? calcTotalAmount(client.amountTaken, client.interestRate)
        );
        const paidAmount = Number(client.amountAlreadyPaid || 0);
        const remainingAmount = Math.max(Number(client.previousRemainingAmount ?? totalPayable - paidAmount), 0);
        const weeklyPayment = Number(client.weeklyPayment || week?.weeklyPayment || 0);
        const rawStatus = week?.paymentStatus || 'pending';
        const paidThisWeek = Boolean(week?.paid);
        const statusGroup = paidThisWeek
          ? 'paid'
          : rawStatus === 'not-started'
            ? 'not-started'
            : rawStatus === 'completed'
              ? 'completed'
              : 'pending';
        const progress = totalPayable > 0 ? Math.min(100, Math.round((paidAmount / totalPayable) * 100)) : 0;

        return {
          ...client,
          week,
          amountTaken,
          interestAmount,
          totalPayable,
          paidAmount,
          remainingAmount,
          weeklyPayment,
          rawStatus,
          paidThisWeek,
          statusGroup,
          progress,
        };
      }),
    [clients, weeklyByClient]
  );

  const rows = useMemo(() => {
    const query = searchClient.trim().toLowerCase();
    return allRows.filter((row) => {
      const matchesSearch =
        !query ||
        row.name?.toLowerCase().includes(query) ||
        row.place?.toLowerCase().includes(query) ||
        String(row.phone || '').includes(query);
      const matchesPlace = !placeFilter || row.place === placeFilter;
      const matchesStatus = statusFilter === 'all' || row.statusGroup === statusFilter;
      return matchesSearch && matchesPlace && matchesStatus;
    });
  }, [allRows, placeFilter, searchClient, statusFilter]);

  const stats = useMemo(() => {
    const paidCount = allRows.filter((row) => row.statusGroup === 'paid').length;
    const pendingRows = allRows.filter((row) => row.statusGroup === 'pending');
    const startingRows = allRows.filter((row) => row.statusGroup === 'not-started');
    return {
      totalClients: allRows.length,
      paidCount,
      pendingCount: pendingRows.length,
      startingCount: startingRows.length,
      totalLoan: allRows.reduce((sum, row) => sum + row.amountTaken, 0),
      totalPaid: allRows.reduce((sum, row) => sum + row.paidAmount, 0),
      totalPending: allRows.reduce((sum, row) => sum + row.remainingAmount, 0),
      weeklyPending: pendingRows.reduce((sum, row) => sum + row.weeklyPayment, 0),
    };
  }, [allRows]);

  const describeStatus = (row) => {
    if (row.statusGroup === 'paid') return 'Paid this week';
    if (row.rawStatus === 'submitted') return 'Approval review';
    if (row.rawStatus === 'rejected') return 'Rejected';
    if (row.week?.isOverdue) return 'Overdue';
    if (row.statusGroup === 'not-started') return 'Starts next week';
    if (row.statusGroup === 'completed') return 'Completed';
    return 'Pending';
  };

  const statusClass = (row) => {
    if (row.statusGroup === 'paid') return 'paid';
    if (row.rawStatus === 'submitted') return 'review';
    if (row.rawStatus === 'rejected' || row.week?.isOverdue) return 'overdue';
    if (row.statusGroup === 'not-started') return 'starting';
    if (row.statusGroup === 'completed') return 'completed';
    return 'pending';
  };

  const getWeekInfoText = (row) => {
    if (!row.week) return 'Loading weekly status';
    const rowTotalWeeks = row.week.schedule?.totalWeeks || row.totalWeeks || 25;
    if (row.statusGroup === 'completed') return `${rowTotalWeeks} weeks completed`;
    if (row.statusGroup === 'not-started') return `Week 1 starts ${formatDate(row.week.weekStart)}`;
    const weekLabel = `Week ${row.week.schedule?.currentWeekNumber || 1} of ${rowTotalWeeks}`;
    if (!row.week.dueDate) return weekLabel;
    return `${weekLabel} - ${row.week.paid ? 'Paid' : 'Due'} ${formatDate(row.week.dueDate)}`;
  };

  const renderWeekInfo = (row) => {
    if (!row.week) return <span className="muted-text">Loading weekly status</span>;
    const rowTotalWeeks = row.week.schedule?.totalWeeks || row.totalWeeks || 25;
    if (row.statusGroup === 'completed') return <span>{rowTotalWeeks} weeks completed</span>;
    if (row.statusGroup === 'not-started') {
      return (
        <>
          <strong>Week 1 starts {formatDate(row.week.weekStart)}</strong>
          <span>New plan begins next Sunday</span>
        </>
      );
    }
    return (
      <>
        <strong>Week {row.week.schedule?.currentWeekNumber || 1} of {row.week.schedule?.totalWeeks || 25}</strong>
        {row.week.dueDate && <span>{row.week.paid ? 'Paid' : 'Due'} {formatDate(row.week.dueDate)}</span>}
      </>
    );
  };

  const handleDownloadClientListPdf = async () => {
    try {
      await downloadClientListPdf(
        rows.map((row, index) => ({
          ...row,
          reportIndex: index + 1,
          statusText: describeStatus(row),
          weekText: getWeekInfoText(row),
        })),
        {
          search: searchClient,
          place: placeFilter,
          status: statusFilter === 'all' ? 'All' : statusFilter,
        }
      );
    } catch (err) {
      alert(err.message || 'Could not generate client list PDF.');
    }
  };

  if (loading && clients.length === 0) {
    return (
      <section className="section anim-tab-in client-list-page">
        <div className="wk2-skeleton-header" />
        <div className="wk2-skeleton-pills" />
        <div className="wk2-skeleton-table" />
      </section>
    );
  }

  return (
    <section key="client-list-tab" className="section anim-tab-in client-list-page">
      <div className="client-list-head">
        <div>
          <h2>Client List</h2>
          <p>All clients with loan details, paid amount, pending balance, and this week's status.</p>
        </div>
        <div className="client-list-head__actions">
          <button type="button" className="btn small client-list-pdf-btn" onClick={handleDownloadClientListPdf}>
            Generate PDF
          </button>
          <button type="button" className="btn small primary clients-add-btn" onClick={onAddClient}>
            + Add Client
          </button>
        </div>
      </div>

      <div className="client-list-kpis">
        <div className="client-list-kpi">
          <span>Total Clients</span>
          <strong>{stats.totalClients}</strong>
          <em>Registered customers</em>
        </div>
        <div className="client-list-kpi client-list-kpi--green">
          <span>Paid This Week</span>
          <strong>{stats.paidCount}</strong>
          <em>{formatMoney(stats.totalPaid)} total paid</em>
        </div>
        <div className="client-list-kpi client-list-kpi--gold">
          <span>Pending This Week</span>
          <strong>{stats.pendingCount}</strong>
          <em>{formatMoney(stats.weeklyPending)} weekly pending</em>
        </div>
        <div className="client-list-kpi client-list-kpi--orange">
          <span>Total Pending</span>
          <strong>{formatMoney(stats.totalPending)}</strong>
          <em>Remaining balance</em>
        </div>
        <div className="client-list-kpi client-list-kpi--blue">
          <span>New Starts</span>
          <strong>{stats.startingCount}</strong>
          <em>Starting next week</em>
        </div>
      </div>

      <div className="client-list-filters">
        <input
          type="search"
          className="search-input"
          value={searchClient}
          onChange={onSearchChange}
          placeholder="Search by name, place, or phone"
          aria-label="Search client list"
        />
        <select className="search-input" value={placeFilter} onChange={(e) => onPlaceFilterChange(e.target.value)}>
          <option value="">All places</option>
          {places.map((place) => (
            <option key={place} value={place}>{place}</option>
          ))}
        </select>
        <select className="search-input" value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
          <option value="all">All status</option>
          <option value="paid">Paid this week</option>
          <option value="pending">Not paid / pending</option>
          <option value="not-started">Starts next week</option>
          <option value="completed">Completed</option>
        </select>
        <button type="button" className="btn small" onClick={onResetFilters}>
          Reset
        </button>
      </div>

      <div className="table-wrap client-list-table anim-scale-in">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Client details</th>
              <th>Loan details</th>
              <th>Payment progress</th>
              <th>Week info</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>No clients match the selected filters.</td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const message = `Namaste ${row.name}, Lakshmi Ganapati Finance. Your weekly payment is ${formatMoney(row.weeklyPayment)}. Current balance is ${formatMoney(row.remainingAmount)}.`;
                const canUpdatePayment = Boolean(row.week?.paymentId);
                return (
                  <tr
                    key={row._id}
                    className={`anim-row-in client-list-row client-list-row--${statusClass(row)}`}
                    style={{ animationDelay: `${0.05 + index * 0.025}s` }}
                  >
                    <td data-label="#" className="client-list-index">{index + 1}</td>
                    <td data-label="Client details">
                      <div className="client-list-person">
                        <WkAvatar name={row.name} photo={row.profilePhoto} tone={statusClass(row)} />
                        <div>
                          {row.uniqueNo && <em>{row.uniqueNo}</em>}
                          <strong>{row.name}</strong>
                          <span>{row.phone}</span>
                          <em>{row.place || 'No place'}</em>
                        </div>
                      </div>
                    </td>
                    <td data-label="Loan details">
                      <div className="client-list-loan-grid">
                        <span><em>Amount</em><strong>{formatMoney(row.amountTaken)}</strong></span>
                        <span><em>Interest</em><strong>{formatMoney(row.interestAmount)}</strong></span>
                        <span><em>Total</em><strong>{formatMoney(row.totalPayable)}</strong></span>
                        <span><em>Weekly</em><strong>{formatMoney(row.weeklyPayment)}</strong></span>
                      </div>
                    </td>
                    <td data-label="Payment progress">
                      <div className="client-list-progress">
                        <div className="client-list-progress__top">
                          <strong>{row.progress}%</strong>
                          <span>{formatMoney(row.paidAmount)} paid</span>
                        </div>
                        <div className="client-list-progress__track">
                          <span style={{ width: `${row.progress}%` }} />
                        </div>
                        <small>{formatMoney(row.remainingAmount)} remaining</small>
                      </div>
                    </td>
                    <td data-label="Week info">
                      <div className="client-list-week">
                        {renderWeekInfo(row)}
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`client-list-status client-list-status--${statusClass(row)}`}>
                        {describeStatus(row)}
                      </span>
                    </td>
                    <td data-label="Actions" className="actions">
                      <div className="client-list-actions">
                        {canUpdatePayment && (
                          <button
                            type="button"
                            className={`client-list-mini-btn ${row.paidThisWeek ? 'client-list-mini-btn--ghost' : 'client-list-mini-btn--pay'}`}
                            onClick={() => togglePaid(row.week.paymentId, row.paidThisWeek)}
                          >
                            {row.paidThisWeek ? 'Undo' : 'Paid'}
                          </button>
                        )}
                        {canUpdatePayment && !row.paidThisWeek && (
                          <button
                            type="button"
                            className="client-list-mini-btn client-list-mini-btn--warn"
                            onClick={() => sendReminder(row.week.paymentId, true)}
                          >
                            Remind
                          </button>
                        )}
                        <button
                          type="button"
                          className="action-icon-btn action-icon-btn--view"
                          onClick={() => onViewPlan(row)}
                          aria-label={`View ${row.name} payment plan`}
                          title="View weeks"
                          data-tooltip="View weeks"
                        >
                          {ACTION_ICONS.view}
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn action-icon-btn--renew"
                          onClick={() => startRenewal(row)}
                          aria-label={`Top-up ${row.name}`}
                          title="Top-up"
                          data-tooltip="Top-up"
                        >
                          {ACTION_ICONS.renew}
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn action-icon-btn--wa"
                          onClick={() => handleWhatsApp(row.phone, message)}
                          aria-label={`WhatsApp ${row.name}`}
                          title="WhatsApp"
                          data-tooltip="WhatsApp"
                        >
                          {ACTION_ICONS.whatsapp}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClientPaymentPlanModal({
  client,
  plan,
  loading,
  updatingWeek,
  onClose,
  onToggleWeekPaid,
  formatDate,
  formatMoney,
}) {
  const weeks = plan?.weeks || [];
  const summary = plan?.summary || {};
  const planTotalWeeks = summary.totalWeeks || plan?.client?.totalWeeks || client?.totalWeeks || 25;

  const statusLabel = (week) => {
    if (week.paid) return 'Paid';
    if (week.paymentStatus === 'submitted') return 'Review';
    if (week.paymentStatus === 'rejected') return 'Rejected';
    if (week.paymentStatus === 'upcoming') return 'Upcoming';
    if (week.isOverdue) return 'Not paid';
    return 'Not paid';
  };

  const statusClass = (week) => {
    if (week.paid) return 'paid';
    if (week.paymentStatus === 'submitted') return 'review';
    if (week.paymentStatus === 'rejected') return 'rejected';
    if (week.paymentStatus === 'upcoming') return 'upcoming';
    if (week.isOverdue) return 'overdue';
    return 'pending';
  };

  return (
    <div className="payment-plan-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="payment-plan-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${client?.name || 'Client'} payment plan`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="payment-plan-modal__header">
          <div>
            <span>{planTotalWeeks} Week Payment Plan</span>
            <h2>{client?.name || plan?.client?.name || 'Client'}</h2>
            <p>
              {plan?.client?.phone || client?.phone || ''}
              {(plan?.client?.place || client?.place) ? ` · ${plan?.client?.place || client?.place}` : ''}
            </p>
          </div>
          <button type="button" className="payment-plan-modal__close" onClick={onClose} aria-label="Close payment plan">
            X
          </button>
        </header>

        {loading ? (
          <div className="payment-plan-modal__loading">
            <LoadingSpinner label={`Loading ${planTotalWeeks} week plan...`} inline />
          </div>
        ) : (
          <>
            <div className="payment-plan-summary">
              <div>
                <span>Paid Weeks</span>
                <strong>{summary.paidWeeks || 0}</strong>
              </div>
              <div>
                <span>Not Paid</span>
                <strong>{summary.notPaidWeeks || 0}</strong>
              </div>
              <div>
                <span>Total Paid</span>
                <strong>{formatMoney(summary.totalPaid)}</strong>
              </div>
              <div>
                <span>Weekly Amount</span>
                <strong>{formatMoney(plan?.client?.weeklyPayment || client?.weeklyPayment)}</strong>
              </div>
            </div>

            <div className="payment-plan-legend" aria-label="Payment status legend">
              <span className="payment-plan-dot payment-plan-dot--paid" /> Paid
              <span className="payment-plan-dot payment-plan-dot--pending" /> Not paid
              <span className="payment-plan-dot payment-plan-dot--upcoming" /> Upcoming
            </div>

            <div className="payment-plan-grid">
              {weeks.map((week) => {
                const actionKey = `${client?._id || plan?.client?._id}:${week.weekNumber}`;
                const isUpdating = updatingWeek === actionKey;
                return (
                  <article
                    key={`${week.weekNumber}-${week.weekStart}`}
                    className={`payment-plan-week payment-plan-week--${statusClass(week)} ${week.isCurrentWeek ? 'payment-plan-week--current' : ''}`}
                  >
                    <div className="payment-plan-week__top">
                      <strong>Week {week.weekNumber}</strong>
                      <span>{statusLabel(week)}</span>
                    </div>
                    <p>{formatDate(week.weekStart)}</p>
                    <em>{formatMoney(week.amount)}</em>
                    {week.paidAt && <small>Paid {formatDate(week.paidAt)}</small>}
                    {!week.paid && week.dueDate && <small>Due {formatDate(week.dueDate)}</small>}
                    <button
                      type="button"
                      className={`payment-plan-week__action ${week.paid ? 'payment-plan-week__action--undo' : 'payment-plan-week__action--paid'}`}
                      disabled={isUpdating}
                      onClick={() => onToggleWeekPaid(week)}
                    >
                      {isUpdating ? 'Saving...' : week.paid ? 'Undo' : 'Mark as paid'}
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(() => getManagerTabFromHash());
  const [clients, setClients] = useState([]);
  const [weekly, setWeekly] = useState(null);
  const [collections, setCollections] = useState([]);
  const [form, setForm] = useState(emptyClient);
  const [collectionForm, setCollectionForm] = useState(emptyCollection);
  const [collectionAdjustments, setCollectionAdjustments] = useState(emptyCollectionAdjustments);
  const [renewalForm, setRenewalForm] = useState(emptyRenewal);
  const [renewingClient, setRenewingClient] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchClient, setSearchClient] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [clientListPlace, setClientListPlace] = useState('');
  const [clientListStatus, setClientListStatus] = useState('all');
  const [editClientId, setEditClientId] = useState(null);
  const [defaulters, setDefaulters] = useState([]);
  const [defaulterCount, setDefaulterCount] = useState(0);
  const [defaulterDetailId, setDefaulterDetailId] = useState('');
  const [defaulterActionLoading, setDefaulterActionLoading] = useState(false);
  const [dailyReport, setDailyReport] = useState(null);
  const pendingRequestsRef = useRef({});
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [monthlyMonth, setMonthlyMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthlyDetailKey, setMonthlyDetailKey] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [bulkReminding, setBulkReminding] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [paymentApprovals, setPaymentApprovals] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [planClient, setPlanClient] = useState(null);
  const [planData, setPlanData] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planUpdatingWeek, setPlanUpdatingWeek] = useState('');
  const [enterAnim, setEnterAnim] = useState(
    () => sessionStorage.getItem('lg_login_anim') === '1'
  );

  // Clear enter-animation flag after the dashboard has had time to render and play once.
  useEffect(() => {
    if (!enterAnim || dashboardLoading) return;
    sessionStorage.removeItem('lg_login_anim');
    const t = setTimeout(() => setEnterAnim(false), 2600);
    return () => clearTimeout(t);
  }, [dashboardLoading, enterAnim]);

  useEffect(() => {
    const syncFromHash = () => {
      setSidebarOpen(false);
      setTab(getManagerTabFromHash());
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const requestOnce = useCallback(async (key, fn) => {
    if (pendingRequestsRef.current[key]) return pendingRequestsRef.current[key];
    const promise = fn().finally(() => {
      delete pendingRequestsRef.current[key];
    });
    pendingRequestsRef.current[key] = promise;
    return promise;
  }, []);

  const loadClients = useCallback(
    (q = '') =>
      requestOnce(`clients:${q}`, async () => {
        const data = await api.getClients(q);
        setClients(data);
        return data;
      }).catch((e) => setMessage({ type: 'error', text: e.message })),
    [requestOnce]
  );

  const loadDefaulters = useCallback(
    () =>
      requestOnce('defaulters', async () => {
        const data = await api.getDefaulters();
        const list = data.defaulters || [];
        setDefaulters(list);
        // badge = unique customers, not raw payment rows
        const uniqueCount = new Set(list.map((d) => String(d.clientId))).size;
        setDefaulterCount(uniqueCount);
        setMessage((current) => (current.type === 'error' ? { type: '', text: '' } : current));
        return data;
      }).catch((e) => setMessage({ type: 'error', text: e.message })),
    [requestOnce]
  );

  const loadDailyReport = useCallback(
    (date = dailyDate) => {
      setReportLoading(true);
      return requestOnce(`daily-report:${date}`, async () => api.getDailyCollectionsReport(date))
        .then(setDailyReport)
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => setReportLoading(false));
    },
    [dailyDate, requestOnce]
  );

  const loadMonthlyReport = useCallback(
    (month = monthlyMonth) => {
      setReportLoading(true);
      return requestOnce(`monthly-profit:${month}`, async () => {
        const shouldUseCurrentWeekly = month === getMonthKey(new Date());
        const [report, weeklyStatus] = await Promise.all([
          api.getMonthlyProfitReport(month),
          shouldUseCurrentWeekly
            ? weekly
              ? Promise.resolve(weekly)
              : api.getWeeklyStatus()
            : Promise.resolve(null),
        ]);
        if (weeklyStatus) setWeekly(weeklyStatus);
        return mergeReportWithCurrentWeeklyIncome(report, weeklyStatus);
      })
        .then((data) => {
          setMonthlyReport(data);
          setMonthlyDetailKey('');
          return data;
        })
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => setReportLoading(false));
    },
    [monthlyMonth, requestOnce, weekly]
  );

  const handleDownloadMonthlyReport = useCallback(async () => {
    try {
      let report = monthlyReport?.month === monthlyMonth
        ? monthlyReport
        : await api.getMonthlyProfitReport(monthlyMonth);
      if (monthlyMonth === getMonthKey(new Date())) {
        const weeklyStatus = weekly || await api.getWeeklyStatus();
        if (!weekly) setWeekly(weeklyStatus);
        report = mergeReportWithCurrentWeeklyIncome(report, weeklyStatus);
      }
      setMonthlyReport(report);
      await downloadMonthlyProfitReportPdf(report);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Could not download report' });
    }
  }, [monthlyMonth, monthlyReport, weekly]);

 const loadWeekly = useCallback(async (background = false) => {
  try {
    if (!background) setLoading(true);

    const data = await api.getWeeklyStatus();
    setWeekly(data);
  } catch (err) {
    setError(err.message);
  } finally {
    if (!background) setLoading(false);
  }
}, []);

  const loadPaymentApprovals = useCallback(
    (background = false) =>
      requestOnce('payment-approvals', async () => {
        if (!background) setApprovalsLoading(true);
        const data = await api.getPaymentApprovals();
        setPaymentApprovals(data);
        setMessage((current) => (current.type === 'error' ? { type: '', text: '' } : current));
        return data;
      })
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => {
          if (!background) setApprovalsLoading(false);
        }),
    [requestOnce]
  );

  const loadDashboard = useCallback(
    async ({ background = false } = {}) => {
      if (!background) setDashboardLoading(true);
      const load = async () => {
        const data = await api.getManagerDashboard();
        setDashboardData(data);
        setDefaulterCount(data?.kpis?.defaulters || 0);
        setDashboardCache(data);
        setMessage((current) => (current.type === 'error' ? { type: '', text: '' } : current));
        return data;
      };

      return requestOnce('dashboard', load)
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => {
          if (!background) setDashboardLoading(false);
        });
    },
    [requestOnce]
  );

  const loadCollections = useCallback(
    () =>
      requestOnce('collections', async () => {
        setCollectionLoading(true);
        const data = await api.getCollections();
        setCollections(data);
        return data;
      })
        .catch((e) => setMessage({ type: 'error', text: e.message }))
        .finally(() => setCollectionLoading(false)),
    [requestOnce]
  );

  useEffect(() => {
    const cachedDashboard = getDashboardCache();
    if (cachedDashboard) {
      setDashboardData(cachedDashboard);
      setDashboardLoading(false);
    }

    const startup = async () => {
      if (!cachedDashboard) {
        await Promise.allSettled([loadDashboard()]);
        return;
      }
      loadDashboard({ background: true });
    };

    startup();
  }, [loadDashboard]);

  useEffect(() => {
    if (tab === 'client-list' || tab === 'reminders') {
      loadClients(globalSearch.trim());
      loadWeekly(true);
    }
    if (tab === 'clients') loadClients(globalSearch.trim());
    if (tab === 'weekly') loadWeekly();
    if (tab === 'collection') loadCollections();
    if (tab === 'daily-report') loadDailyReport();
    if (tab === 'monthly-profit') loadMonthlyReport();
    if (tab === 'defaulters') loadDefaulters();
    if (tab === 'payment-approvals') loadPaymentApprovals();
    if (tab === 'dashboard') loadDashboard({ background: true });
  }, [tab, loadClients, loadWeekly, loadCollections, loadDailyReport, loadMonthlyReport, loadDefaulters, loadDashboard, loadPaymentApprovals]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (tab === 'dashboard') loadDashboard({ background: true });
      if (tab === 'weekly') loadWeekly(true);
      if (tab === 'payment-approvals') loadPaymentApprovals(true);
      if (tab === 'client-list' || tab === 'reminders') {
        loadClients(globalSearch.trim());
        loadWeekly(true);
      }
      if (tab === 'clients') loadClients(globalSearch.trim());
      if (tab === 'defaulters') loadDefaulters();
    }, 30000);
    return () => clearInterval(timer);
  }, [
    tab,
    globalSearch,
    loadClients,
    loadDashboard,
    loadDefaulters,
    loadPaymentApprovals,
    loadWeekly,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => loadClients(globalSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [globalSearch, loadClients]);

  const logout = useCallback(() => {
    localStorage.clear();
    sessionStorage.clear();
    navigate('/');
  }, [navigate]);

  const handleFormChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((current) => ({ ...current, [name]: value }));
  }, []);

  const handleSearchChange = useCallback(
    (e) => {
      const term = e.target.value;
      setSearchClient(term);
      setGlobalSearch(term);
    },
    []
  );

  const handleResetClientListFilters = useCallback(() => {
    setSearchClient('');
    setGlobalSearch('');
    setClientListPlace('');
    setClientListStatus('all');
    loadClients('');
  }, [loadClients]);

  const interestPreview = useMemo(
    () => calcInterestAmount(form.amountTaken, form.interestRate),
    [form.amountTaken, form.interestRate]
  );

  const totalPreview = useMemo(
    () => calcTotalAmount(form.amountTaken, form.interestRate),
    [form.amountTaken, form.interestRate]
  );

  const weeklyPreview = useMemo(() => {
    if (form.amountTaken === '' || form.interestRate === '') return '';
    const totalWeeks = Number(form.totalWeeks) || RENEWAL_TOTAL_WEEKS;
    const weekly = totalPreview / totalWeeks;
    if (!weekly) return '';
    return Number.isInteger(weekly) ? String(weekly) : weekly.toFixed(2);
  }, [form.amountTaken, form.interestRate, form.totalWeeks, totalPreview]);

  useEffect(() => {
    const nextRate = String(getClientInterestRateForWeeks(form.totalWeeks));
    setForm((current) => (
      current.interestRate === nextRate
        ? current
        : { ...current, interestRate: nextRate }
    ));
  }, [form.totalWeeks]);

  useEffect(() => {
    setForm((current) => (
      current.weeklyPayment === weeklyPreview
        ? current
        : { ...current, weeklyPayment: weeklyPreview }
    ));
  }, [weeklyPreview]);

  const filteredClients = useMemo(() => clients, [clients]);

  const handleAddClient = useCallback(
    async (e) => {
      e.preventDefault();
      setSubmitting(true);
      setMessage({ type: '', text: '' });
      try {
        if (editClientId) {
          await api.updateClient(editClientId, form);
          setMessage({ type: 'success', text: 'Client updated successfully' });
        } else {
          await api.addClient(form);
          setMessage({ type: 'success', text: 'Client added successfully' });
        }
        setForm(emptyClient);
        setEditClientId(null);
        loadClients();
        loadWeekly();
        syncManagerHash('clients');
        setTab('clients');
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      } finally {
        setSubmitting(false);
      }
    },
    [editClientId, form, loadClients, loadWeekly]
  );

  const handleEditClient = useCallback((client) => {
    setForm({
      uniqueNo: client.uniqueNo || '',
      name: client.name,
      place: client.place,
      phone: client.phone,
      amountTaken: client.amountTaken?.toString() || '',
      dateTaken: client.dateTaken ? client.dateTaken.slice(0, 10) : '',
      totalWeeks: String(client.totalWeeks || 25),
      interestRate: client.interestRate?.toString() || '',
      weeklyPayment: client.weeklyPayment?.toString() || '',
      username: client.username || '',
      password: '',
    });
    setEditClientId(client._id);
    setMessage({ type: 'info', text: `Editing ${client.name}. Update the fields and save.` });
    syncManagerHash('add');
    setTab('add');
  }, []);

  const handleDeleteClient = useCallback(
    async (id) => {
      if (!window.confirm('Delete this client? This action cannot be undone.')) return;
      setSubmitting(true);
      setMessage({ type: '', text: '' });
      try {
        await api.deleteClient(id);
        setMessage({ type: 'success', text: 'Client deleted successfully' });
        loadClients();
        loadWeekly();
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      } finally {
        setSubmitting(false);
      }
    },
    [loadClients, loadWeekly]
  );

  const handleCancelEdit = useCallback(() => {
    setForm(emptyClient);
    setEditClientId(null);
    setMessage({ type: '', text: '' });
  }, []);

  const handleOpenAddClient = useCallback(() => {
    setForm(emptyClient);
    setEditClientId(null);
    setMessage({ type: '', text: '' });
    syncManagerHash('add');
    setTab('add');
  }, []);

  const startRenewal = useCallback((client) => {
    const previousAmount = String(
      client.previousRemainingAmount ?? client.totalAmount ?? calcTotalAmount(client.amountTaken, client.interestRate)
    );
    setRenewingClient(client);
    setRenewalForm({
      previousAmount,
      amountTaken: '',
      dateTaken: new Date().toISOString().slice(0, 10),
      interestRate: client.interestRate?.toString() || '',
      totalWeeks: String(RENEWAL_TOTAL_WEEKS),
      weeklyPayment: '',
      note: '',
    });
    setMessage({ type: 'info', text: `Top-up for ${client.name}. Enter new amount and interest.` });
  }, []);

  const handleRenewalChange = useCallback((e) => {
  const { name, value } = e.target;

  setRenewalForm((current) => {
    const next = { ...current, [name]: value };

    if (name === 'totalWeeks') {
      next.interestRate = value === '12' ? '20' : '25';
    }

    next.weeklyPayment = calcRenewalWeeklyAmount(
      next.previousAmount,
      next.amountTaken,
      next.interestRate
    );

    return next;
  });
}, []);
  const handleRenewClient = useCallback(
    async (e) => {
      e.preventDefault();
      if (!renewingClient) return;
      setSubmitting(true);
      setMessage({ type: '', text: '' });
      try {
        const updatedClient = await api.topUpClient(renewingClient._id, {
          newAmountTaken: renewalForm.amountTaken,
          interestRate: renewalForm.interestRate,
          topUpDate: renewalForm.dateTaken,
          note: renewalForm.note,
        });
        const { downloadTopUpReceipt } = await import('../utils/receiptPdf');
        await downloadTopUpReceipt(
          { name: renewingClient.name, phone: renewingClient.phone },
          updatedClient.topUp
        );
        setMessage({ type: 'success', text: `${renewingClient.name} top-up saved successfully` });
        setRenewingClient(null);
        setRenewalForm(emptyRenewal);
        loadClients();
        loadWeekly();
        loadDashboard();
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      } finally {
        setSubmitting(false);
      }
    },
    [loadClients, loadDashboard, loadWeekly, renewalForm, renewingClient]
  );

  const togglePaid = useCallback(
    async (paymentId, currentPaid) => {
      try {
        await api.updatePayment(paymentId, !currentPaid);
        loadWeekly();
        loadDefaulters();
        loadDashboard();
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      }
    },
    [loadWeekly, loadDefaulters, loadDashboard]
  );

  const handleReviewPayment = useCallback(
    async (paymentId, action) => {
      try {
        await api.reviewPaymentApproval(paymentId, action);
        setMessage({
          type: 'success',
          text: action === 'approve' ? 'Payment approved successfully' : 'Payment rejected',
        });
        loadPaymentApprovals();
        loadWeekly();
        loadDefaulters();
        loadDashboard();
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      }
    },
    [loadDashboard, loadDefaulters, loadPaymentApprovals, loadWeekly]
  );

  const handleCollectionChange = useCallback((e) => {
    const { name, value } = e.target;
    setCollectionForm((current) => ({ ...current, [name]: value }));
  }, []);

  const handleCollectionAdjustmentChange = useCallback((field, value) => {
    setCollectionAdjustments((current) => ({ ...current, [field]: value }));
  }, []);

  const applyCollectionAdjustment = useCallback(
    (field, operator) => {
      const adjustment = Number(collectionAdjustments[field] || 0);
      if (!Number.isFinite(adjustment) || adjustment <= 0) return;

      setCollectionForm((current) => {
        const currentAmount = Number(current[field] || 0);
        const nextAmount =
          operator === 'add'
            ? currentAmount + adjustment
            : Math.max(0, currentAmount - adjustment);

        return {
          ...current,
          [field]: formatAmountInput(nextAmount),
        };
      });

      setCollectionAdjustments((current) => ({ ...current, [field]: '' }));
    },
    [collectionAdjustments]
  );

  const handleAddCollection = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage({ type: '', text: '' });
    try {
      await api.addCollection(collectionForm);
      setCollectionForm(emptyCollection);
      setCollectionAdjustments(emptyCollectionAdjustments);
      setMessage({ type: 'success', text: 'Collection saved successfully' });
      loadCollections();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCollection = async (id) => {
    if (!window.confirm('Delete this collection record?')) return;
    try {
      await api.deleteCollection(id);
      setMessage({ type: 'success', text: 'Record deleted' });
      loadCollections();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handlePrintCollection = (row) => {
    const printWindow = window.open('', '_blank');
    const balance = calcBalance(row);
    if (!printWindow) return;

    const safe = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const money = (value) => `\u20B9 ${Number(value || 0).toLocaleString('en-IN')}`;
    const receiptDate = (value) =>
      new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    const logoUrl = new URL(LOGO_SRC, window.location.origin).href;
    const receiptRows = [
      ['Name', row.name || 'Collection'],
      ['Date', receiptDate(row.entryDate)],
      ['Previous Amount (+)', money(row.previousAmount)],
      ['Collection (+)', money(row.collection)],
      ['Charges (-)', money(row.charges)],
      ['Payments (-)', money(row.payments)],
      ['Balance', money(balance)],
    ];
    const receiptHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safe(BRAND_NAME)} Receipt</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #f6efe4;
              font-family: Arial, Helvetica, sans-serif;
              color: #202020;
            }
            .receipt {
              position: relative;
              width: 430px;
              min-height: 780px;
              overflow: hidden;
              padding: 24px 28px 138px;
              background: #fffefb;
              border: 2px solid #c99a46;
              border-radius: 12px;
              box-shadow: 0 16px 38px rgba(35, 24, 8, 0.16);
            }
            .brand,
            .receipt-title,
            .rows,
            .thanks,
            .signature {
              position: relative;
              z-index: 2;
            }
            .brand {
              text-align: center;
            }
            .brand img {
              width: 76px;
              height: 76px;
              display: block;
              margin: 0 auto 5px;
              object-fit: contain;
            }
            .brand h1 {
              margin: 0;
              color: #08723d;
              font-size: 24px;
              line-height: 1.12;
              font-weight: 800;
              letter-spacing: 0.02em;
            }
            .receipt-title {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 15px;
              margin: 22px 0 30px;
              color: #c99631;
              font-family: Georgia, 'Times New Roman', serif;
              font-size: 38px;
              font-style: italic;
              font-weight: 700;
            }
            .receipt-title::before,
            .receipt-title::after {
              content: '';
              width: 96px;
              height: 1px;
              background: linear-gradient(90deg, transparent, #e2c683, transparent);
            }
            .rows {
              display: grid;
              gap: 13px;
              font-size: 17px;
              line-height: 1.25;
            }
            .row {
              display: grid;
              grid-template-columns: 132px 14px 1fr;
              gap: 8px;
              align-items: baseline;
            }
            .label,
            .colon,
            .value {
              font-weight: 700;
            }
            .value {
              word-break: break-word;
            }
            .thanks {
              margin-top: 34px;
              text-align: center;
              font-size: 19px;
              font-weight: 800;
            }
            .signature {
              width: 230px;
              margin: 24px 0 0 auto;
              padding: 0 8px 20px;
              text-align: center;
              overflow: visible;
            }
            .signature span {
              display: block;
              margin-bottom: 10px;
              font-size: 15px;
              font-weight: 700;
            }
            .signature strong {
              display: block;
              width: 100%;
              padding: 4px 6px 9px;
              border-bottom: 2px solid #222;
              font-family: Georgia, 'Times New Roman', serif;
              font-size: 24px;
              font-style: italic;
              font-weight: 700;
              line-height: 1.2;
              white-space: nowrap;
              transform: none;
            }
            .wave-gold,
            .wave-green,
            .wave-white {
              position: absolute;
              left: -45px;
              width: calc(100% + 90px);
              border-radius: 50% 50% 0 0;
              pointer-events: none;
              z-index: 1;
            }
            .wave-gold {
              bottom: 34px;
              height: 82px;
              background: #dfc98d;
            }
            .wave-green {
              bottom: -42px;
              height: 112px;
              background: #014b2c;
            }
            .wave-white {
              bottom: 50px;
              height: 84px;
              background: #fffefb;
            }
            @page { size: A5 portrait; margin: 8mm; }
            @media print {
              body {
                min-height: auto;
                background: #fff;
              }
              .receipt {
                width: 100%;
                min-height: 188mm;
                padding-bottom: 42mm;
                box-shadow: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="brand">
              <img src="${logoUrl}" alt="" />
              <h1>${safe(BRAND_NAME).toUpperCase()} FINANCE</h1>
            </div>
            <div class="receipt-title">Receipt</div>
            <div class="rows">
              ${receiptRows
                .map(
                  ([label, value]) => `
                    <div class="row">
                      <span class="label">${safe(label)}</span>
                      <span class="colon">:</span>
                      <span class="value">${safe(value)}</span>
                    </div>
                  `
                )
                .join('')}
            </div>
            <div class="thanks">Thank you for your payment!</div>
            <div class="signature">
              <span>Authorized Signature</span>
              <strong>N.K.V.REDDY</strong>
            </div>
            <div class="wave-gold"></div>
            <div class="wave-green"></div>
            <div class="wave-white"></div>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 150);
    return;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Collection Record</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 24px; }
            .header p { margin: 5px 0; color: #666; }
            .details { margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px; border-bottom: 1px solid #eee; }
            .detail-label { font-weight: 600; }
            .detail-value { text-align: right; }
            .balance-row { font-size: 18px; font-weight: bold; margin-top: 20px; padding: 10px; background: #f0f0f0; }
            .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Lakshmi Ganapati</h1>
            <p>Collection Record</p>
          </div>
          <div class="details">
            ${row.name ? `<div class="detail-row"><span class="detail-label">Name:</span><span class="detail-value">${row.name}</span></div>` : ''}
            <div class="detail-row"><span class="detail-label">Date:</span><span class="detail-value">${formatDate(row.entryDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Previous Amount:</span><span class="detail-value">₹${Number(row.previousAmount).toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Collection:</span><span class="detail-value">₹${Number(row.collection).toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Charges:</span><span class="detail-value">₹${Number(row.charges).toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Payments:</span><span class="detail-value">₹${Number(row.payments).toLocaleString('en-IN')}</span></div>
            <div class="balance-row"><span class="detail-label">Balance:</span><span class="detail-value">₹${balance.toLocaleString('en-IN')}</span></div>
          </div>
          <div class="footer">
            <p>Printed on ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 100);
  };

  const sendReminder = async (paymentId, openWa = false) => {
    try {
      const res = await api.sendReminder(paymentId);
      setMessage({
        type: 'success',
        text: openWa
          ? 'Reminder saved. Opening WhatsApp…'
          : `${res.message} — ${res.smsPreview}`,
      });
      loadWeekly();
      loadDefaulters();
      loadDashboard();
      if (openWa && res.phone && res.smsPreview) {
        openWhatsApp(res.phone, res.smsPreview);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const sendBulkReminders = async () => {
    if (!window.confirm('Send reminders to all pending payments this week?')) return;
    setBulkReminding(true);
    try {
      const res = await api.sendBulkReminders();
      setMessage({ type: 'success', text: res.message });
      loadWeekly();
      loadDefaulters();
      loadDashboard();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBulkReminding(false);
    }
  };

  const handleViewPaymentPlan = useCallback(async (client) => {
    setPlanClient(client);
    setPlanData(null);
    setPlanLoading(true);
    setPlanUpdatingWeek('');
    try {
      const data = await api.getClientPaymentPlan(client._id);
      setPlanData(data);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      setPlanClient(null);
    } finally {
      setPlanLoading(false);
    }
  }, []);

  const handleClosePaymentPlan = useCallback(() => {
    setPlanClient(null);
    setPlanData(null);
    setPlanLoading(false);
    setPlanUpdatingWeek('');
  }, []);

  const handleTogglePlanWeekPaid = useCallback(
    async (week) => {
      const clientId = planData?.client?._id || planClient?._id;
      if (!clientId) return;
      const nextPaid = !week.paid;
      const actionKey = `${clientId}:${week.weekNumber}`;
      setPlanUpdatingWeek(actionKey);
      try {
        await api.updateClientPaymentPlanWeek(clientId, week.weekNumber, nextPaid);
        const updatedPlan = await api.getClientPaymentPlan(clientId);
        setPlanData(updatedPlan);
        setMessage({
          type: 'success',
          text: `Week ${week.weekNumber} marked ${nextPaid ? 'paid' : 'not paid'}`,
        });
        loadClients(globalSearch.trim());
        loadWeekly(true);
        loadDefaulters();
        loadDashboard({ background: true });
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      } finally {
        setPlanUpdatingWeek('');
      }
    },
    [globalSearch, loadClients, loadDashboard, loadDefaulters, loadWeekly, planClient, planData]
  );

  const handleWhatsApp = useCallback((phone, message) => {
    openWhatsApp(phone, message);
  }, []);

  const groupedDefaulters = useMemo(() => groupDefaultersByClient(defaulters), [defaulters]);

  const selectedDefaulter = useMemo(
    () => groupedDefaulters.find((g) => String(g.clientId) === String(defaulterDetailId)) || null,
    [groupedDefaulters, defaulterDetailId]
  );

  const closeDefaulterDetail = useCallback(() => {
    setDefaulterDetailId('');
  }, []);

  const handleDefaulterSendReminders = useCallback(async () => {
    if (!selectedDefaulter) return;
    setDefaulterActionLoading(true);
    try {
      for (const week of selectedDefaulter.pendingWeeks) {
        await api.sendReminder(week.paymentId);
      }
      setMessage({
        type: 'success',
        text: `Reminders sent for ${selectedDefaulter.pendingWeeks.length} pending week(s).`,
      });
      loadWeekly();
      loadDefaulters();
      loadDashboard();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDefaulterActionLoading(false);
    }
  }, [selectedDefaulter, loadWeekly, loadDefaulters, loadDashboard]);

  const handleDefaulterWhatsApp = useCallback(() => {
    if (!selectedDefaulter) return;
    const lastWeek = selectedDefaulter.pendingWeeks[selectedDefaulter.pendingWeeks.length - 1];
    handleWhatsApp(selectedDefaulter.phone, lastWeek?.reminderMessage);
  }, [selectedDefaulter, handleWhatsApp]);

  const handleDefaulterMarkAllPaid = useCallback(async () => {
    if (!selectedDefaulter) return;
    const count = selectedDefaulter.pendingWeeks.length;
    if (!window.confirm(`Mark all ${count} pending week(s) as paid for ${selectedDefaulter.name}?`)) {
      return;
    }
    setDefaulterActionLoading(true);
    try {
      for (const week of selectedDefaulter.pendingWeeks) {
        await api.updatePayment(week.paymentId, true);
      }
      setMessage({ type: 'success', text: `${count} week(s) marked as paid.` });
      closeDefaulterDetail();
      loadWeekly();
      loadDefaulters();
      loadDashboard();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDefaulterActionLoading(false);
    }
  }, [selectedDefaulter, closeDefaulterDetail, loadWeekly, loadDefaulters, loadDashboard]);

  const handleGlobalSearch = useCallback(
    (value) => {
      setGlobalSearch(value);
      setSearchClient(value);
      if (value.trim()) {
        syncManagerHash('clients');
        setTab('clients');
      }
    },
    []
  );

  const handleNavigate = useCallback(
    (nextTab) => {
      if (!MANAGER_TAB_IDS.has(nextTab)) return;
      setMonthlyDetailKey('');
      setDefaulterDetailId('');
      setPlanClient(null);
      setPlanData(null);
      setRenewingClient(null);
      setSidebarOpen(false);
      syncManagerHash(nextTab);
      setTab(nextTab);
      if (nextTab === 'weekly') {
        loadWeekly();
      }
    },
    [loadWeekly]
  );

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const pageTitles = useMemo(
    () => ({
      dashboard: 'Dashboard',
      'client-list': 'Client List',
      weekly: 'Weekly payments',
      reminders: 'Reminders',
      clients: 'Clients',
      collection: 'Collection',
      'payment-approvals': 'Payment approvals',
      add: 'Add client',
      'daily-report': 'Daily collections',
      'monthly-profit': 'Monthly profit',
      defaulters: 'Defaulters',
    }),
    []
  );

  const managerName = useMemo(
    () => sessionStorage.getItem('name') || localStorage.getItem('name') || 'Manager',
    []
  );

  const isDashboard = tab === 'dashboard';
  const topUpInterestAmount = calcTopUpInterest(renewalForm.amountTaken, renewalForm.interestRate);
  const topUpTotalPayable = calcTopUpTotal(
    renewalForm.previousAmount,
    renewalForm.amountTaken,
    renewalForm.interestRate
  );
  const topUpFirstPaymentDate = getFirstPaymentDateFromTopUp(renewalForm.dateTaken);
  const collectionBalancePreview = calcBalance(collectionForm);
  const syncedMonthlyReport = useMemo(
    () => mergeReportWithCurrentWeeklyIncome(monthlyReport, weekly),
    [monthlyReport, weekly]
  );
  const monthlyReportCards = useMemo(() => {
    if (!syncedMonthlyReport) return [];
    const summary = syncedMonthlyReport.summary || {};
    const isCurrentMonthReport = syncedMonthlyReport.month === getMonthKey(new Date());
    return [
      {
        key: 'collectionIncome',
        label: 'Collection income',
        value: formatMoney(summary.collectionIncome),
        hint: `${summary.entriesCount || 0} collection entries`,
      },
      {
        key: 'weeklyIncome',
        label: 'Weekly income',
        value: formatMoney(summary.weeklyIncome),
        hint: isCurrentMonthReport
          ? `${summary.weeklyPaymentsCount || 0} paid this week`
          : `${summary.weeklyPaymentsCount || 0} weekly payment entries only`,
      },
      {
        key: 'charges',
        label: 'Charges',
        value: formatMoney(summary.chargesIncome),
        hint: 'From collection entries',
      },
      {
        key: 'paymentsOut',
        label: 'Payments out',
        value: formatMoney(summary.paymentsOut),
        hint: 'From entry payments',
      },
      {
        key: 'monthlyProfit',
        label: 'Monthly profit',
        value: formatMoney(summary.profit),
        hint: 'Income minus payments out',
        highlight: true,
      },
    ];
  }, [syncedMonthlyReport]);

  const monthlyDetailRows = useMemo(() => {
    if (!monthlyDetailKey || !syncedMonthlyReport) return [];

    const backendRows = syncedMonthlyReport.details?.[monthlyDetailKey];
    if (Array.isArray(backendRows) && backendRows.length > 0) return backendRows;

    if (monthlyDetailKey === 'monthlyProfit') {
      return buildMonthlyProfitRows(syncedMonthlyReport.summary);
    }

    if (MONTHLY_COLLECTION_DETAIL_CONFIG[monthlyDetailKey]) {
      return buildCollectionDetailRows(collections, monthlyMonth, monthlyDetailKey);
    }

    return Array.isArray(backendRows) ? backendRows : [];
  }, [collections, monthlyDetailKey, monthlyMonth, syncedMonthlyReport]);

  const handleMonthlyReportCardClick = useCallback(
    (key) => {
      setMonthlyDetailKey(key);
      if (MONTHLY_COLLECTION_DETAIL_CONFIG[key] && collections.length === 0) {
        loadCollections();
      }
    },
    [collections.length, loadCollections]
  );

  const closeMonthlyDetailModal = useCallback(() => {
    setMonthlyDetailKey('');
  }, []);

  const renderMonthlyDetailTable = () => {
    if (!monthlyDetailKey) return null;

    if (monthlyDetailKey === 'monthlyProfit') {
      return (
        <div className="table-wrap monthly-detail-table">
          <table>
            <thead>
              <tr>
                <th>Breakdown</th>
                <th>Type</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {monthlyDetailRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>
                    <span className={`monthly-detail-type monthly-detail-type--${row.type}`}>
                      {row.type}
                    </span>
                  </td>
                  <td>{formatMoney(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (MONTHLY_COLLECTION_DETAIL_CONFIG[monthlyDetailKey] && collectionLoading) {
      return <LoadingSpinner label="Loading details..." inline />;
    }

    if (monthlyDetailRows.length === 0) {
      return <p className="monthly-detail-empty">No details found for this month.</p>;
    }

    if (monthlyDetailKey === 'weeklyIncome') {
      return (
        <div className="table-wrap monthly-detail-table">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Place</th>
                <th>Phone</th>
                <th>Week</th>
                <th>Paid at</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {monthlyDetailRows.map((row) => (
                <tr key={row._id}>
                  <td>{row.name}</td>
                  <td>{row.place || '-'}</td>
                  <td>{row.phone || '-'}</td>
                  <td>{row.weekStart ? formatDate(row.weekStart) : '-'}</td>
                  <td>{row.paidAt ? formatDate(row.paidAt) : '-'}</td>
                  <td>{formatMoney(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="table-wrap monthly-detail-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              {monthlyDetailKey === 'collectionIncome' && <th>Previous amount</th>}
              <th>{MONTHLY_DETAIL_LABELS[monthlyDetailKey]?.replace(' details', '') || 'Amount'}</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {monthlyDetailRows.map((row) => (
              <tr key={row._id}>
                <td>{row.date ? formatDate(row.date) : '-'}</td>
                <td>{row.name}</td>
                {monthlyDetailKey === 'collectionIncome' && <td>{formatMoney(row.previousAmount)}</td>}
                <td>{formatMoney(row.amount)}</td>
                <td>{row.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className={`manager-layout dash-animated ${isDashboard ? 'manager-layout--premium' : ''}${enterAnim ? ' manager-layout--enter' : ''}`}>
      {!isDashboard && (
        <Suspense fallback={<div className="mg-suspense-fallback" />}> 
          <DashboardBg />
        </Suspense>
      )}
      {enterAnim && isDashboard && (
        <div className="manager-login-burst" aria-hidden="true">
          <div className="manager-login-burst__ring" />
          <div className="manager-login-burst__ring manager-login-burst__ring--delay" />
          <div className="manager-login-burst__logo">
            <img src={LOGO_SRC} alt="" />
          </div>
          <span className="manager-login-burst__scan" />
        </div>
      )}
      <ManagerSidebar
        active={tab}
        onNavigate={handleNavigate}
        onLogout={logout}
        mobileOpen={sidebarOpen}
        onMenuToggle={handleSidebarToggle}
        onCloseMobile={() => setSidebarOpen(false)}
        defaulterCount={defaulterCount}
      />

      <main className="manager-main">
        {!isDashboard && (
        <header className="dash-header anim-fade-down">
          <div>
            <h1>{pageTitles[tab] || 'Manager Panel'}</h1>
            <p className="subtitle">{managerName}</p>
          </div>
          <div className="manager-header-toolbar">
            <input
              type="search"
              className="search-input manager-global-search"
              placeholder="Search customers…"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              aria-label="Search customers"
            />
            <button
              type="button"
              className="btn small warning"
              disabled={bulkReminding}
              onClick={sendBulkReminders}
              title="One-click reminder for all pending this week"
            >
              {bulkReminding ? 'Sending…' : 'Remind all'}
            </button>
          </div>
        </header>
        )}

        {message.text && (
          <div
            className={`alert anim-fade-up ${message.type === 'error' ? 'error' : 'success'}`}
          >
            {message.text}
          </div>
        )}

        {tab === 'dashboard' && (
          <Suspense fallback={<div className="mg-suspense-fallback" />}>
            <ManagerDashboardHome
              data={dashboardData}
              loading={dashboardLoading}
              managerName={managerName}
              globalSearch={globalSearch}
              onSearchChange={handleGlobalSearch}
              onRemindAll={sendBulkReminders}
              bulkReminding={bulkReminding}
              onNavigate={handleNavigate}
              onRemind={sendReminder}
              onWhatsApp={handleWhatsApp}
              notificationCount={defaulterCount}
              onMenuToggle={handleSidebarToggle}
            />
          </Suspense>
        )}

        {tab === 'client-list' && (
          <ClientListModule
            clients={clients}
            weekly={weekly}
            loading={loading && clients.length === 0}
            searchClient={searchClient}
            onSearchChange={handleSearchChange}
            placeFilter={clientListPlace}
            onPlaceFilterChange={setClientListPlace}
            statusFilter={clientListStatus}
            onStatusFilterChange={setClientListStatus}
            onResetFilters={handleResetClientListFilters}
            onAddClient={handleOpenAddClient}
            formatDate={formatDate}
            formatMoney={formatMoney}
            togglePaid={togglePaid}
            sendReminder={sendReminder}
            handleWhatsApp={handleWhatsApp}
            startRenewal={startRenewal}
            onViewPlan={handleViewPaymentPlan}
          />
        )}

        {tab === 'reminders' && (
          <ClientListModule
            clients={clients}
            weekly={weekly}
            loading={loading && clients.length === 0}
            searchClient={searchClient}
            onSearchChange={handleSearchChange}
            placeFilter={clientListPlace}
            onPlaceFilterChange={setClientListPlace}
            statusFilter="pending"
            onStatusFilterChange={setClientListStatus}
            onResetFilters={handleResetClientListFilters}
            onAddClient={handleOpenAddClient}
            formatDate={formatDate}
            formatMoney={formatMoney}
            togglePaid={togglePaid}
            sendReminder={sendReminder}
            handleWhatsApp={handleWhatsApp}
            startRenewal={startRenewal}
            onViewPlan={handleViewPaymentPlan}
          />
        )}

        {tab === 'clients' && (
          <section key="clients-tab" className="section anim-tab-in">
            <h2>Clients</h2>
            <div className="section-toolbar">
              <input
                type="text"
                value={searchClient}
                onChange={handleSearchChange}
                placeholder="Search by name, place, or phone"
                className="search-input"
              />
              <button
                type="button"
                className="btn small primary clients-add-btn"
                onClick={handleOpenAddClient}
              >
                + Add Client
              </button>
            </div>
            <div className="table-wrap anim-scale-in">
              <table>
                <thead>
                  <tr>
                    <th>Unique No</th>
                    <th>Name</th>
                    <th>Place</th>
                    <th>Phone</th>
                    <th>Amount</th>
                    <th>Interest</th>
                    <th>Total</th>
                    <th>Weekly</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={9}>{searchClient ? 'No clients found.' : 'No clients yet.'}</td>
                    </tr>
                  ) : (
                    filteredClients.map((client, i) => {
                      const msg = `Namaste ${client.name}, Lakshmi Ganapati. Your account total is ${formatMoney(client.totalAmount ?? calcTotalAmount(client.amountTaken, client.interestRate))}. Weekly payment: ${formatMoney(client.weeklyPayment)}.`;
                      return (
                      <tr
                        key={client._id}
                        className="anim-row-in"
                        style={{ animationDelay: `${0.08 + i * 0.03}s` }}
                      >
                        <td>{client.uniqueNo || '-'}</td>
                        <td>{client.name}</td>
                        <td>{client.place}</td>
                        <td>{client.phone}</td>
                        <td>{formatMoney(client.amountTaken)}</td>
                        <td>{formatMoney(client.interestAmount ?? calcInterestAmount(client.amountTaken, client.interestRate))}</td>
                        <td>{formatMoney(client.totalAmount ?? calcTotalAmount(client.amountTaken, client.interestRate))}</td>
                        <td>{formatMoney(client.weeklyPayment)}</td>
                        <td className="actions">
                          <div className="client-actions">
                            <button
                              type="button"
                              className="action-icon-btn action-icon-btn--edit"
                              onClick={() => handleEditClient(client)}
                              aria-label={`Edit ${client.name}`}
                              title="Edit"
                              data-tooltip="Edit"
                            >
                              {ACTION_ICONS.edit}
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn action-icon-btn--renew"
                              onClick={() => startRenewal(client)}
                              aria-label={`Top-up ${client.name}`}
                              title="Top-up"
                              data-tooltip="Top-up"
                            >
                              {ACTION_ICONS.renew}
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn action-icon-btn--delete"
                              onClick={() => handleDeleteClient(client._id)}
                              aria-label={`Delete ${client.name}`}
                              title="Delete"
                              data-tooltip="Delete"
                            >
                              {ACTION_ICONS.delete}
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn action-icon-btn--wa"
                              onClick={() => handleWhatsApp(client.phone, msg)}
                              aria-label={`WhatsApp ${client.name}`}
                              title="WhatsApp"
                              data-tooltip="WhatsApp"
                            >
                              {ACTION_ICONS.whatsapp}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {renewingClient && (
              <form onSubmit={handleRenewClient} className="renewal-form card form-card anim-fade-up">
                <div className="section-toolbar">
                  <div>
                    <h2>Top-up Amount - {renewingClient.name}</h2>
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setRenewingClient(null);
                      setRenewalForm(emptyRenewal);
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <div className="renewal-summary-grid">
                  <label>
                    Previous remaining balance
                    <input
                      name="previousAmount"
                      type="number"
                      value={renewalForm.previousAmount}
                      readOnly
                    />
                  </label>
                  <label>
                    Old total payable
                    <input
                      type="text"
                      value={formatMoney(renewingClient.totalAmount ?? calcTotalAmount(renewingClient.amountTaken, renewingClient.interestRate))}
                      readOnly
                    />
                  </label>
                  <label>
                    New total payable
                    <input
                      type="text"
                      value={formatMoney(topUpTotalPayable)}
                      readOnly
                    />
                  </label>
                  <label>
                    Total weeks
                   <select
  name="totalWeeks"
  value={renewalForm.totalWeeks}
  onChange={handleRenewalChange}
>
  <option value="12">12 Weeks</option>
  <option value="25">25 Weeks</option>
</select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Top-up amount
                    <input
                      name="amountTaken"
                      type="number"
                      min="0"
                      step="0.01"
                      value={renewalForm.amountTaken}
                      onChange={handleRenewalChange}
                      placeholder="Enter new amount"
                      required
                    />
                  </label>
                  <label>
                    Top-up date
                    <input
                      name="dateTaken"
                      type="date"
                      value={renewalForm.dateTaken}
                      onChange={handleRenewalChange}
                      required
                    />
                  </label>
                  <label>
                    Interest percentage (%)
                    <input
                      name="interestRate"
                      type="number"
                      min="0"
                      step="0.1"
                      value={renewalForm.interestRate}
                      onChange={handleRenewalChange}
                      required
                    />
                  </label>
                  <label>
                    Weekly payment (auto)
                    <input
                      name="weeklyPayment"
                      type="number"
                      min="0"
                      step="0.01"
                      value={renewalForm.weeklyPayment}
                      readOnly
                      placeholder="New amount / 25"
                      required
                    />
                  </label>
                </div>
                <p className="renewal-formula-note">
                  Interest: {formatMoney(topUpInterestAmount)}. First payment starts {formatDate(topUpFirstPaymentDate)}.
                </p>
                <div className="form-row">
                  <label>
                    Top-up note
                    <input
                      name="note"
                      value={renewalForm.note}
                      onChange={handleRenewalChange}
                      placeholder="Optional note"
                    />
                  </label>
                </div>
                <div className="interest-calc-preview anim-fade-up">
                  <div className="interest-calc-preview__item">
                    <span>Interest amount</span>
                    <strong>{formatMoney(topUpInterestAmount)}</strong>
                  </div>
                  <div className="interest-calc-preview__item highlight">
                    <span>Weekly payment for 25 weeks</span>
                    <strong>{formatMoney(renewalForm.weeklyPayment)}</strong>
                  </div>
                </div>
                <button type="submit" className="btn primary" disabled={submitting}>
                  {submitting ? 'Saving top-up...' : 'Save top-up & PDF receipt'}
                </button>
              </form>
            )}
          </section>
        )}

      {tab === 'add' && (
        <section key="add-tab" className="section card form-card anim-tab-in">
          <h2>{editClientId ? 'Edit client' : 'Add new client'}</h2>
          <form onSubmit={handleAddClient} className="client-form">
            <div className="form-row">
              <label>
                Unique No
                <input name="uniqueNo" value={form.uniqueNo} onChange={handleFormChange} required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Name
                <input name="name" value={form.name} onChange={handleFormChange} required />
              </label>
              <label>
                Place
                <input name="place" value={form.place} onChange={handleFormChange} required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Phone (for reminders)
                <input name="phone" type="tel" value={form.phone} onChange={handleFormChange} required />
              </label>
              <label>
                Date amount taken
                <input
                  name="dateTaken"
                  type="date"
                  value={form.dateTaken}
                  onChange={handleFormChange}
                  required
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Amount taken (₹)
                <input
                  name="amountTaken"
                  type="number"
                  min="0"
                  value={form.amountTaken}
                  onChange={handleFormChange}
                  required
                />
              </label>
              <label>
                Weeks
                <select
                  name="totalWeeks"
                  value={form.totalWeeks}
                  onChange={handleFormChange}
                  required
                >
                  {CLIENT_WEEK_OPTIONS.map((weeks) => (
                    <option key={weeks} value={weeks}>
                      {weeks} weeks
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Interest rate (auto)
                <input
                  name="interestRate"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.interestRate}
                  readOnly
                  required
                />
              </label>
              <label>
                Weekly payment (auto: total / {form.totalWeeks || 25})
                <input
                  name="weeklyPayment"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.weeklyPayment}
                  readOnly
                  placeholder="Auto calculated"
                  required
                />
              </label>
            </div>
            <div className="interest-calc-preview anim-fade-up">
              <div className="interest-calc-preview__item">
                <span>Interest amount (auto)</span>
                <strong>{formatMoney(interestPreview)}</strong>
              </div>
              <div className="interest-calc-preview__item highlight">
                <span>Total amount (auto)</span>
                <strong>{formatMoney(totalPreview)}</strong>
              </div>
              <p className="muted-text">12 weeks uses 20% interest. 25 weeks uses 25% interest.</p>
            </div>
            <div className="form-row">
              <label>
                Login username
                <input name="username" value={form.username} onChange={handleFormChange} required />
              </label>
              <label>
                Login password
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleFormChange}
                  required={!editClientId}
                  minLength={6}
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={submitting}>
                {submitting
                  ? editClientId ? 'Saving...' : 'Adding...'
                  : editClientId ? 'Update client' : 'Add client'}
              </button>
              {editClientId && (
                <button type="button" className="btn secondary" onClick={handleCancelEdit}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {tab === 'collection' && (
        <section key="collection-tab" className="section anim-tab-in">
          <h2>Collection</h2>

          <form onSubmit={handleAddCollection} className="collection-form card form-card">
            <div className="form-row collection-fields">
              <label>
                Name
                <input
                  name="name"
                  type="text"
                  value={collectionForm.name}
                  onChange={handleCollectionChange}
                  placeholder="Client name"
                />
              </label>
              <label>
                Date
                <input
                  name="entryDate"
                  type="date"
                  value={collectionForm.entryDate}
                  onChange={handleCollectionChange}
                  required
                />
              </label>
              {COLLECTION_AMOUNT_FIELDS.map((field) => (
                <div className="collection-adjust-field" key={field.name}>
                  <label htmlFor={`collection-${field.name}`}>
                    {field.label} ({field.sign})
                  </label>
                  <input
                    id={`collection-${field.name}`}
                    name={field.name}
                    type="number"
                    min="0"
                    step="0.01"
                    value={collectionForm[field.name]}
                    onChange={handleCollectionChange}
                    placeholder="0"
                  />
                  <div className="collection-adjust-controls">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={collectionAdjustments[field.name]}
                      onChange={(e) => handleCollectionAdjustmentChange(field.name, e.target.value)}
                      placeholder={`${field.label} adjust`}
                      aria-label={`${field.label} adjust amount`}
                    />
                    <button
                      type="button"
                      className="collection-adjust-btn collection-adjust-btn--add"
                      onClick={() => applyCollectionAdjustment(field.name, 'add')}
                      aria-label={`Add to ${field.label}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="collection-adjust-btn collection-adjust-btn--subtract"
                      onClick={() => applyCollectionAdjustment(field.name, 'subtract')}
                      aria-label={`Subtract from ${field.label}`}
                    >
                      -
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="collection-formula-strip" aria-live="polite">
              <span>
                <em>Previous Amount</em>
                <strong>{formatMoney(collectionForm.previousAmount)}</strong>
              </span>
              <b>+</b>
              <span>
                <em>Collection</em>
                <strong>{formatMoney(collectionForm.collection)}</strong>
              </span>
              <b>-</b>
              <span>
                <em>Charges</em>
                <strong>{formatMoney(collectionForm.charges)}</strong>
              </span>
              <b>-</b>
              <span>
                <em>Payments</em>
                <strong>{formatMoney(collectionForm.payments)}</strong>
              </span>
              <b>=</b>
              <span className="collection-formula-strip__balance">
                <em>Balance</em>
                <strong>{formatMoney(collectionBalancePreview)}</strong>
              </span>
            </div>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save collection'}
            </button>
          </form>

          {collectionLoading ? (
            <LoadingSpinner label="Loading collections..." inline />
          ) : (
            <div className="table-wrap anim-scale-in" style={{ marginTop: '1.5rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Previous Amount (+)</th>
                    <th>Collection (+)</th>
                    <th>Charges (-)</th>
                    <th>Payments (-)</th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No collection records yet.</td>
                    </tr>
                  ) : (
                    collections.map((row, i) => (
                      <tr
                        key={row._id}
                        className="anim-row-in"
                        style={{ animationDelay: `${0.1 + i * 0.04}s` }}
                      >
                        <td>{row.name || '—'}</td>
                        <td>{formatDate(row.entryDate)}</td>
                        <td>{formatMoney(row.previousAmount)}</td>
                        <td>{formatMoney(row.collection)}</td>
                        <td>{formatMoney(row.charges)}</td>
                        <td>{formatMoney(row.payments)}</td>
                        <td className="balance-cell">{formatMoney(calcBalance(row))}</td>
                        <td>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => handlePrintCollection(row)}
                            title="Print record"
                          >
                            Print
                          </button>
                          <button
                            type="button"
                            className="btn small danger"
                            onClick={() => handleDeleteCollection(row._id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'daily-report' && (
        <section key="daily-report-tab" className="section anim-tab-in">
          <div className="section-toolbar">
            <h2>Daily collections report</h2>
            <input
              type="date"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              className="search-input"
            />
            <button type="button" className="btn small primary" onClick={() => loadDailyReport(dailyDate)}>
              Load report
            </button>
          </div>
          {reportLoading ? (
            <LoadingSpinner label="Loading report..." inline />
          ) : dailyReport ? (
            <>
              <div className="card-grid">
                <div className="info-card">
                  <span className="label">Collections</span>
                  <span className="value">{formatMoney(dailyReport.summary.collectionTotal)}</span>
                </div>
                <div className="info-card">
                  <span className="label">Weekly paid</span>
                  <span className="value">{formatMoney(dailyReport.summary.weeklyPaymentsTotal)}</span>
                </div>
                <div className="info-card">
                  <span className="label">Charges</span>
                  <span className="value">{formatMoney(dailyReport.summary.chargesTotal)}</span>
                </div>
                <div className="info-card highlight">
                  <span className="label">Day total</span>
                  <span className="value">{formatMoney(dailyReport.summary.dayTotal)}</span>
                </div>
              </div>
              <div className="table-wrap" style={{ marginTop: '1.25rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Collection</th>
                      <th>Charges</th>
                      <th>Payments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyReport.entries.length === 0 ? (
                      <tr><td colSpan={4}>No collection entries for this date.</td></tr>
                    ) : (
                      dailyReport.entries.map((row) => (
                        <tr key={row._id}>
                          <td>{row.name || '—'}</td>
                          <td>{formatMoney(row.collection)}</td>
                          <td>{formatMoney(row.charges)}</td>
                          <td>{formatMoney(row.payments)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      )}

     {tab === 'monthly-profit' && (
  <>
  <section key="monthly-profit-tab" className="section anim-tab-in monthly-profit-page">
    <div className="monthly-profit-header">
      <div>
        <h2>Monthly Profit Dashboard</h2>
        <p>Income, expense and profit summary.</p>
      </div>

      <div className="monthly-profit-actions">
        <input
          type="month"
          value={monthlyMonth}
          onChange={(e) => setMonthlyMonth(e.target.value)}
          className="search-input"
        />

        <button
          type="button"
          className="btn small primary"
          onClick={() => loadMonthlyReport(monthlyMonth)}
        >
          Load Report
        </button>

        <button
          type="button"
          className="btn small monthly-report-download-btn"
          onClick={handleDownloadMonthlyReport}
          disabled={reportLoading}
        >
          Download PDF
        </button>
      </div>
    </div>

    {reportLoading ? (
      <LoadingSpinner label="Loading report..." inline />
    ) : syncedMonthlyReport ? (
      <>
        <div className="monthly-simple-cards">
          <button
            type="button"
            className={`monthly-simple-card${monthlyDetailKey === 'collectionIncome' ? ' monthly-simple-card--active' : ''}`}
            onClick={() => handleMonthlyReportCardClick('collectionIncome')}
          >
            <span>Collection Income</span>
            <strong>{formatMoney(syncedMonthlyReport.summary.collectionIncome)}</strong>
          </button>

          <button
            type="button"
            className={`monthly-simple-card${monthlyDetailKey === 'weeklyIncome' ? ' monthly-simple-card--active' : ''}`}
            onClick={() => handleMonthlyReportCardClick('weeklyIncome')}
          >
            <span>Weekly Income</span>
            <strong>{formatMoney(syncedMonthlyReport.summary.weeklyIncome)}</strong>
          </button>

          <button
            type="button"
            className={`monthly-simple-card${monthlyDetailKey === 'charges' ? ' monthly-simple-card--active' : ''}`}
            onClick={() => handleMonthlyReportCardClick('charges')}
          >
            <span>Charges</span>
            <strong>{formatMoney(syncedMonthlyReport.summary.chargesIncome)}</strong>
          </button>

          <button
            type="button"
            className={`monthly-simple-card monthly-simple-card--red${monthlyDetailKey === 'paymentsOut' ? ' monthly-simple-card--active' : ''}`}
            onClick={() => handleMonthlyReportCardClick('paymentsOut')}
          >
            <span>Payments Out</span>
            <strong>{formatMoney(syncedMonthlyReport.summary.paymentsOut)}</strong>
          </button>

          <button
            type="button"
            className={`monthly-simple-card monthly-simple-card--profit${monthlyDetailKey === 'monthlyProfit' ? ' monthly-simple-card--active' : ''}`}
            onClick={() => handleMonthlyReportCardClick('monthlyProfit')}
          >
            <span>Monthly Profit</span>
            <strong>{formatMoney(syncedMonthlyReport.summary.profit)}</strong>
          </button>
        </div>
      </>
    ) : (
      <div className="monthly-empty">
        Select a month and click Load Report.
      </div>
    )}
  </section>

  {monthlyDetailKey && syncedMonthlyReport && (
    <div
      className="monthly-detail-overlay"
      role="presentation"
      onClick={closeMonthlyDetailModal}
    >
      <section
        className="monthly-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={MONTHLY_DETAIL_LABELS[monthlyDetailKey]}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="monthly-detail-modal__header">
          <h2>{MONTHLY_DETAIL_LABELS[monthlyDetailKey]}</h2>
          <button
            type="button"
            className="monthly-detail-modal__close"
            onClick={closeMonthlyDetailModal}
            aria-label="Close details"
          >
            X
          </button>
        </header>
        <div className="monthly-detail-modal__body">
          {renderMonthlyDetailTable()}
        </div>
      </section>
    </div>
  )}
  </>
)}
      {tab === 'defaulters' && (
        <>
        <section key="defaulters-tab" className="section anim-tab-in defaulters-page">
          <div className="defaulters-header">
            <div>
              <h2>
                Defaulters
                <span className={`defaulters-live-badge ${defaulterCount > 0 ? 'defaulters-live-badge--hot' : ''}`}>
                  <span className="defaulters-live-dot" />
                  LIVE
                </span>
                <span className="defaulters-count-pill">{groupedDefaulters.length}</span>
              </h2>
              <p className="muted-text">
                One summary row per customer — open details to view all unpaid weeks.
              </p>
            </div>
          </div>

          <div className="table-wrap defaulters-table-wrap anim-scale-in">
            {groupedDefaulters.length === 0 ? (
              <div className="defaulters-empty">
                ✓ No defaulters — all payments are up to date.
              </div>
            ) : (
              <table className="defaulters-summary-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Place</th>
                    <th>Total Due</th>
                    <th>Pending Weeks</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDefaulters.map((d, gi) => {
                    const totalDue = d.pendingWeeks.reduce((s, w) => s + (w.weeklyPayment || 0), 0);
                    const anyOverdue = d.pendingWeeks.some((w) => w.isOverdue);
                    const anyReminded = d.pendingWeeks.some((w) => w.reminderSent);

                    return (
                      <tr
                        key={d.clientId}
                        className={anyOverdue ? 'defaulter-row--overdue' : 'defaulter-row--current'}
                        style={{ animationDelay: `${gi * 0.04}s` }}
                      >
                        <td>
                          <div className="defaulter-name-cell">
                            <span className="defaulter-avatar">
                              {d.profilePhoto ? (
                                <img src={d.profilePhoto} alt="" loading="lazy" decoding="async" />
                              ) : (
                                (d.name?.[0] || '?').toUpperCase()
                              )}
                            </span>
                            <strong>{d.name}</strong>
                          </div>
                        </td>
                        <td>{d.place || '-'}</td>
                        <td>
                          <strong className="defaulters-total-due">{formatMoney(totalDue)}</strong>
                        </td>
                        <td>
                          <span className="defaulters-weeks-pill">{d.pendingWeeks.length}</span>
                        </td>
                        <td>
                          {anyOverdue ? (
                            <span className="defaulter-overdue-tag">Overdue</span>
                          ) : anyReminded ? (
                            <span className="badge warning">Reminded</span>
                          ) : (
                            <span className="badge warning">Pending</span>
                          )}
                        </td>
                        <td className="actions">
                          <button
                            type="button"
                            className="btn small primary defaulters-view-btn"
                            onClick={() => setDefaulterDetailId(String(d.clientId))}
                          >
                            <span className="defaulters-view-btn__icon" aria-hidden="true">▼</span>
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {selectedDefaulter && (() => {
          const totalDue = selectedDefaulter.pendingWeeks.reduce(
            (s, w) => s + (w.weeklyPayment || 0),
            0
          );
          const weekCount = selectedDefaulter.pendingWeeks.length;

          return (
            <div
              className="monthly-detail-overlay defaulter-detail-overlay"
              role="presentation"
              onClick={closeDefaulterDetail}
            >
              <section
                className="monthly-detail-modal defaulter-detail-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${selectedDefaulter.name} pending weeks`}
                onClick={(e) => e.stopPropagation()}
              >
                <header className="monthly-detail-modal__header defaulter-detail-modal__header">
                  <div className="defaulter-detail-modal__intro">
                    <p className="defaulter-detail-modal__eyebrow">Defaulter Details</p>
                    <h2>{selectedDefaulter.name}</h2>
                    <div className="defaulter-detail-modal__meta">
                      <span>Mobile: {selectedDefaulter.phone || '-'}</span>
                      <span>Total pending: {formatMoney(totalDue)}</span>
                      <span>
                        {weekCount} pending week{weekCount > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="monthly-detail-modal__close"
                    onClick={closeDefaulterDetail}
                    aria-label="Close defaulter details"
                  >
                    X
                  </button>
                </header>

                <div className="monthly-detail-modal__body defaulter-detail-modal__body">
                  <div className="table-wrap defaulter-detail-weeks-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Week Number</th>
                          <th>Due Date</th>
                          <th>Weekly Amount</th>
                          <th>Status</th>
                          <th>Days Late</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDefaulter.pendingWeeks.map((w) => {
                          const daysLate = getDefaulterDaysLate(w);
                          return (
                            <tr key={w.paymentId} className={w.isOverdue ? 'defaulter-week-row--overdue' : ''}>
                              <td>Week {w.weekNumber}</td>
                              <td>{w.dueDate ? formatDate(w.dueDate) : formatDate(w.weekStart)}</td>
                              <td>{formatMoney(w.weeklyPayment)}</td>
                              <td>
                                {w.isOverdue ? (
                                  <span className="defaulter-overdue-tag">Overdue</span>
                                ) : (
                                  <span className="defaulter-pending-tag">Pending</span>
                                )}
                              </td>
                              <td>{daysLate > 0 ? `${daysLate} day${daysLate > 1 ? 's' : ''}` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <footer className="defaulter-detail-modal__footer">
                  <button
                    type="button"
                    className="btn small warning"
                    onClick={handleDefaulterSendReminders}
                    disabled={defaulterActionLoading}
                  >
                    {defaulterActionLoading ? 'Sending...' : 'Send Reminder'}
                  </button>
                  <button
                    type="button"
                    className="btn small whatsapp"
                    onClick={handleDefaulterWhatsApp}
                    disabled={defaulterActionLoading}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={handleDefaulterMarkAllPaid}
                    disabled={defaulterActionLoading}
                  >
                    Mark as Paid
                  </button>
                </footer>
              </section>
            </div>
          );
        })()}
        </>
      )}

      {tab === 'payment-approvals' && (
        <section key="payment-approvals-tab" className="section anim-tab-in">
          <div className="section-toolbar">
            <div>
              <h2>Payment Approvals</h2>
              <p className="muted-text">Review UPI screenshots submitted by customers.</p>
            </div>
            <button type="button" className="btn small primary" onClick={loadPaymentApprovals}>
              Refresh
            </button>
          </div>
          {approvalsLoading ? (
            <LoadingSpinner label="Loading payment approvals..." inline />
          ) : paymentApprovals.length === 0 ? (
            <div className="upi-empty-state">
              <strong>No screenshots waiting for approval.</strong>
              <p>Submitted UPI payments will appear here.</p>
            </div>
          ) : (
            <div className="payment-approval-grid">
              {paymentApprovals.map((payment) => (
                <article key={payment._id} className="payment-approval-card">
                  <div className="payment-approval-card__top">
                    <div>
                      <span className="upi-card__eyebrow">UPI Screenshot</span>
                      <h3>{payment.customerName}</h3>
                      <p>{payment.place} · {payment.phone}</p>
                    </div>
                    <span className={`badge ${payment.paymentStatus === 'rejected' ? 'warning' : 'success'}`}>
                      {payment.paymentStatus === 'rejected' ? 'Rejected' : 'Submitted'}
                    </span>
                  </div>
                  <div className="upi-details-grid compact">
                    <div>
                      <span>Payment Amount</span>
                      <strong>{formatMoney(payment.amount)}</strong>
                    </div>
                    <div>
                      <span>Week</span>
                      <strong>{formatDate(payment.weekStart)}</strong>
                    </div>
                    <div>
                      <span>Uploaded</span>
                      <strong>{payment.screenshotUploadedAt ? formatDate(payment.screenshotUploadedAt) : 'Pending'}</strong>
                    </div>
                    <div>
                      <span>UPI ID</span>
                      <strong>9346697486@ptsbi</strong>
                    </div>
                  </div>
                  {payment.screenshot && (
                    <a
                      href={payment.screenshot}
                      target="_blank"
                      rel="noreferrer"
                      className="payment-shot-link"
                    >
                      <img
                        src={payment.screenshot}
                        alt={`${payment.customerName} payment screenshot`}
                        loading="lazy"
                        decoding="async"
                      />
                    </a>
                  )}
                  {payment.managerNote && (
                    <p className="payment-manager-note">{payment.managerNote}</p>
                  )}
                  <div className="payment-approval-actions">
                    <button
                      type="button"
                      className="btn small primary"
                      onClick={() => handleReviewPayment(payment._id, 'approve')}
                    >
                      Approve Payment
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => handleReviewPayment(payment._id, 'reject')}
                    >
                      Reject Payment
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'weekly' && (
        <WeeklyPaymentsModule
          weekly={weekly}
          loading={weeklyLoading}
          bulkReminding={bulkReminding}
          formatDate={formatDate}
          formatMoney={formatMoney}
          togglePaid={togglePaid}
          sendReminder={sendReminder}
          sendBulkReminders={sendBulkReminders}
          handleWhatsApp={handleWhatsApp}
        />
      )}
      </main>
      {planClient && (
        <ClientPaymentPlanModal
          client={planClient}
          plan={planData}
          loading={planLoading}
          updatingWeek={planUpdatingWeek}
          onClose={handleClosePaymentPlan}
          onToggleWeekPaid={handleTogglePlanWeekPaid}
          formatDate={formatDate}
          formatMoney={formatMoney}
        />
      )}
    </div>
  );
}
