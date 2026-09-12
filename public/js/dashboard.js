// Dashboard JavaScript helpers

// Format currency
function formatCurrency(amount) {
  return 'Rs. ' + (amount || 0).toLocaleString();
}

// Format phone
function formatPhone(phone) {
  if (!phone) return '';
  const p = phone.replace(/[^0-9]/g, '');
  if (p.startsWith('92')) {
    return '+92 ' + p.substring(2, 4) + ' ' + p.substring(4);
  }
  return phone;
}

// Time ago
function timeAgo(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = (now - date) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago';
  return date.toLocaleDateString();
}
