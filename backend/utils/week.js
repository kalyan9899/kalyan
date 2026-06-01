function getWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const TOTAL_PAYMENT_WEEKS = 25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function addWeeks(date, weeks) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function getFirstPaymentWeekStart(dateTaken) {
  return addWeeks(getWeekStart(dateTaken), 1);
}

function getPaymentWeekNumber(dateTaken, weekStart = new Date()) {
  const firstWeekStart = getFirstPaymentWeekStart(dateTaken);
  const normalizedWeekStart = getWeekStart(weekStart);
  return Math.floor((normalizedWeekStart - firstWeekStart) / WEEK_MS) + 1;
}

function getPaymentSchedule(dateTaken, weekStart = new Date()) {
  const firstPaymentWeekStart = getFirstPaymentWeekStart(dateTaken);
  const currentWeekStart = getWeekStart(weekStart);
  const currentWeekNumber = getPaymentWeekNumber(dateTaken, currentWeekStart);
  return {
    totalWeeks: TOTAL_PAYMENT_WEEKS,
    firstPaymentWeekStart,
    currentWeekNumber,
    isBeforeStart: currentWeekNumber < 1,
    isAfterSchedule: currentWeekNumber > TOTAL_PAYMENT_WEEKS,
    isActiveWeek: currentWeekNumber >= 1 && currentWeekNumber <= TOTAL_PAYMENT_WEEKS,
  };
}

/** Weekly payment is due by end of Sunday (same week as weekStart). */
function getDueDate(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getDaysUntil(date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

module.exports = {
  TOTAL_PAYMENT_WEEKS,
  getWeekStart,
  addWeeks,
  getFirstPaymentWeekStart,
  getPaymentWeekNumber,
  getPaymentSchedule,
  getDueDate,
  getDaysUntil,
};
