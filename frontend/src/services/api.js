const API = 'https://kalyan-lbq5.onrender.com/api';

function getToken() {
  return sessionStorage.getItem('token') || localStorage.getItem('token');
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API}${url}`, { ...options, headers });
  } catch {
    throw new Error(
      'Cannot reach server. Start the backend: cd backend → npm run dev (port 5000).'
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 502 || res.status === 503) {
      throw new Error(
        'Backend is not running. Open a terminal, run: cd backend → npm run dev'
      );
    }
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getCustomerProfile: () => request('/customer/profile'),
  getCustomerPayments: () => request('/customer/payments'),
  getCustomerReminders: () => request('/customer/reminders'),
  uploadPaymentScreenshot: (paymentId, screenshot) =>
    request(`/customer/payments/${paymentId}/screenshot`, {
      method: 'POST',
      body: JSON.stringify({ screenshot }),
    }),
  uploadCustomerPhoto: (photo) =>
    request('/customer/profile/photo', {
      method: 'PATCH',
      body: JSON.stringify({ photo }),
    }),
  removeCustomerPhoto: () =>
    request('/customer/profile/photo', { method: 'DELETE' }),
  getClients: (q) => {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    return request(`/manager/clients${query}`);
  },
  addClient: (body) => request('/manager/clients', { method: 'POST', body: JSON.stringify(body) }),
  updateClient: (id, body) =>
    request(`/manager/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  renewClient: (id, body) =>
    request(`/manager/clients/${id}/renew`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteClient: (id) => request(`/manager/clients/${id}`, { method: 'DELETE' }),
  getManagerDashboard: () => request('/manager/dashboard'),
  getWeeklyStatus: () => request('/manager/weekly-status'),
  getPaymentApprovals: () => request('/manager/payment-approvals'),
  reviewPaymentApproval: (paymentId, action, managerNote = '') =>
    request(`/manager/payment-approvals/${paymentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, managerNote }),
    }),
  updatePayment: (paymentId, paid) =>
    request(`/manager/payments/${paymentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ paid }),
    }),
  sendReminder: (paymentId) =>
    request(`/manager/send-reminder/${paymentId}`, { method: 'POST' }),
  sendBulkReminders: () =>
    request('/manager/send-reminders/bulk', { method: 'POST' }),
  getDefaulters: () => request('/manager/defaulters'),
  getDailyCollectionsReport: (date) =>
    request(`/manager/reports/daily-collections?date=${date || ''}`),
  getMonthlyProfitReport: (month) =>
    request(`/manager/reports/monthly-profit?month=${month || ''}`),
  getCollections: () => request('/manager/collections'),
  addCollection: (body) =>
    request('/manager/collections', { method: 'POST', body: JSON.stringify(body) }),
  updateCollection: (id, body) =>
    request(`/manager/collections/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCollection: (id) => request(`/manager/collections/${id}`, { method: 'DELETE' }),
};
