function formatWeek(weekStart) {
  return new Date(weekStart).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatAmount(amount) {
  return Number(amount || 0).toLocaleString('en-IN');
}

function buildReminderMessage(client, payment) {
  const name = client.name || 'Customer';
  const amount = formatAmount(payment.amount ?? client.weeklyPayment);
  const week = formatWeek(payment.weekStart);
  const place = client.place ? ` (${client.place})` : '';

  return `Namaste ${name}${place}, this is Lakshmi Ganapati. Your weekly payment of Rs.${amount} for the week starting ${week} is pending. Please pay at the earliest. Thank you.`;
}

module.exports = { buildReminderMessage };
