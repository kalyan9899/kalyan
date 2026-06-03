function getWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = -day;
  d.setDate(d.getDate() + diff);
  return d;
}

const TOTAL_PAYMENT_WEEKS = 25;
const ALLOWED_PAYMENT_WEEKS = [12, 25];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeTotalWeeks(totalWeeks = TOTAL_PAYMENT_WEEKS) {
  const weeks = Number(totalWeeks);
  return ALLOWED_PAYMENT_WEEKS.includes(weeks) ? weeks : TOTAL_PAYMENT_WEEKS;
}

function getInterestRateForWeeks(totalWeeks = TOTAL_PAYMENT_WEEKS) {
  return normalizeTotalWeeks(totalWeeks) === 12 ? 20 : 25;
}

function addWeeks(date, weeks) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function getFirstPaymentWeekStart(dateTaken) {
  return addWeeks(getWeekStart(dateTaken), 1);
}

function getPaymentWeekStart(dateTaken, weekNumber) {
  return addWeeks(getFirstPaymentWeekStart(dateTaken), Math.max(0, Number(weekNumber || 1) - 1));
}

function buildPaymentWeeks(dateTaken, totalWeeks = TOTAL_PAYMENT_WEEKS) {
  const normalizedTotalWeeks = normalizeTotalWeeks(totalWeeks);
  return Array.from({ length: normalizedTotalWeeks }, (_, index) => {
    const weekNumber = index + 1;
    return {
      weekNumber,
      weekStart: getPaymentWeekStart(dateTaken, weekNumber),
    };
  });
}

function getPaymentWeekNumber(dateTaken, weekStart = new Date()) {
  const firstWeekStart = getFirstPaymentWeekStart(dateTaken);
  const normalizedWeekStart = getWeekStart(weekStart);
  return Math.floor((normalizedWeekStart - firstWeekStart) / WEEK_MS) + 1;
}

function getPaymentSchedule(dateTaken, weekStart = new Date(), totalWeeks = TOTAL_PAYMENT_WEEKS) {
  const normalizedTotalWeeks = normalizeTotalWeeks(totalWeeks);
  const firstPaymentWeekStart = getFirstPaymentWeekStart(dateTaken);
  const currentWeekStart = getWeekStart(weekStart);
  const currentWeekNumber = getPaymentWeekNumber(dateTaken, currentWeekStart);
  return {
    totalWeeks: normalizedTotalWeeks,
    firstPaymentWeekStart,
    currentWeekNumber,
    isBeforeStart: currentWeekNumber < 1,
    isAfterSchedule: currentWeekNumber > normalizedTotalWeeks,
    isActiveWeek: currentWeekNumber >= 1 && currentWeekNumber <= normalizedTotalWeeks,
  };
}

/** Weekly payment week runs Sunday through Saturday. */
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
  ALLOWED_PAYMENT_WEEKS,
  normalizeTotalWeeks,
  getInterestRateForWeeks,
  getWeekStart,
  addWeeks,
  getFirstPaymentWeekStart,
  getPaymentWeekStart,
  buildPaymentWeeks,
  getPaymentWeekNumber,
  getPaymentSchedule,
  getDueDate,
  getDaysUntil,
};
