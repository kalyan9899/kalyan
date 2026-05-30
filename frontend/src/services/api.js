const API = '/api';

function getToken() {
  return localStorage.getItem('token');
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
  getClients: () => request('/manager/clients'),
  addClient: (body) => request('/manager/clients', { method: 'POST', body: JSON.stringify(body) }),
  getWeeklyStatus: () => request('/manager/weekly-status'),
  updatePayment: (paymentId, paid) =>
    request(`/manager/payments/${paymentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ paid }),
    }),
  sendReminder: (paymentId) =>
    request(`/manager/send-reminder/${paymentId}`, { method: 'POST' }),
  getCollections: () => request('/manager/collections'),
  addCollection: (body) =>
    request('/manager/collections', { method: 'POST', body: JSON.stringify(body) }),
  updateCollection: (id, body) =>
    request(`/manager/collections/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCollection: (id) => request(`/manager/collections/${id}`, { method: 'DELETE' }),
};
