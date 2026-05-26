const tableBody = document.getElementById('registrations-body');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');
const paymentFilter = document.getElementById('payment-filter');
const statusFilter = document.getElementById('status-filter');
const refreshButton = document.getElementById('refresh-btn');
const quotaTotal = document.getElementById('admin-quota-total');
const quotaUsed = document.getElementById('admin-quota-used');
const quotaRemaining = document.getElementById('admin-quota-remaining');

const paymentOptions = ['pending', 'verified', 'rejected'];
const statusOptions = ['confirmed', 'attended', 'cancelled'];

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function debounce(callback, delay = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

function optionHtml(options, selected) {
  return options.map(option => {
    const isSelected = option === selected ? 'selected' : '';
    return `<option value="${option}" ${isSelected}>${escapeHtml(option)}</option>`;
  }).join('');
}

function formatCategory(category) {
  return category === 'existing' ? 'Existing Parent' : 'Waiting List';
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function paymentProofUrl(filename) {
  return `/uploads/payment-proofs/${encodeURIComponent(filename)}`;
}

function renderPaymentProof(row) {
  const filename = row.paymentProofFilename || '';

  if (!filename) {
    return '<div class="text-xs text-slate-400 mt-2">No file uploaded</div>';
  }

  const url = paymentProofUrl(filename);

  return `
    <a href="${url}" target="_blank" rel="noopener noreferrer" title="View payment proof" aria-label="View payment proof for ${escapeHtml(row.registrationId)}" class="payment-proof-action mt-3">
      <i data-lucide="eye" class="w-5 h-5"></i>
    </a>
  `;
}

function buildQuery() {
  const params = new URLSearchParams();

  if (searchInput.value.trim()) {
    params.set('search', searchInput.value.trim());
  }

  if (categoryFilter.value) {
    params.set('category', categoryFilter.value);
  }

  if (paymentFilter.value) {
    params.set('paymentStatus', paymentFilter.value);
  }

  if (statusFilter.value) {
    params.set('status', statusFilter.value);
  }

  return params.toString();
}

async function loadQuotaSummary() {
  const response = await fetch('/api/config');
  const config = await response.json();

  if (!response.ok) {
    throw new Error(config.error || 'Failed to load quota.');
  }

  quotaTotal.textContent = config.ticketQuota ?? '-';
  quotaUsed.textContent = config.usedSeats ?? '-';
  quotaRemaining.textContent = config.remainingSeats ?? '-';
}

async function loadRegistrations() {
  tableBody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-500">Loading...</td></tr>';

  const query = buildQuery();
  const [response] = await Promise.all([
    fetch(`/api/registrations${query ? `?${query}` : ''}`),
    loadQuotaSummary().catch(() => {})
  ]);
  const result = await response.json();

  if (!response.ok) {
    tableBody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-red-600">${result.error || 'Failed to load data.'}</td></tr>`;
    return;
  }

  renderRows(result.registrations);
}

function renderRows(rows) {
  emptyState.classList.toggle('hidden', rows.length > 0);

  if (!rows.length) {
    tableBody.innerHTML = '';
    return;
  }

  tableBody.innerHTML = rows.map(row => `
    <tr data-id="${row.id}" class="align-top">
      <td class="px-4 py-4">
        <div class="font-semibold text-[#1a2744]">${escapeHtml(row.registrationId)}</div>
        <div class="text-slate-500">Seat ${escapeHtml(row.seatNumber)}</div>
        <div class="text-xs text-slate-400 mt-1">${formatDate(row.createdAt)}</div>
      </td>
      <td class="px-4 py-4">
        <div class="font-medium">${escapeHtml(row.studentName)}</div>
        <div class="text-slate-500">${escapeHtml(row.studentLevel)}</div>
        <div class="text-slate-500">${escapeHtml(row.attendeeCount)} attendee(s), ${escapeHtml(row.lunchBoxCount)} lunch</div>
        <div class="text-[#b8860b] font-semibold mt-1">${formatCurrency(row.totalAmount)}</div>
      </td>
      <td class="px-4 py-4">
        <div class="font-medium">${escapeHtml(row.parentName)}</div>
        <div class="text-slate-500">${escapeHtml(row.phone)}</div>
        <div class="text-slate-500">${escapeHtml(row.email)}</div>
      </td>
      <td class="px-4 py-4">
        <span class="inline-flex px-3 py-1 rounded-full bg-slate-100 text-slate-700">${formatCategory(row.parentCategory)}</span>
        ${row.waitingListStatus ? `<div class="text-slate-500 mt-2">${escapeHtml(row.waitingListStatus)}</div>` : ''}
      </td>
      <td class="px-4 py-4">
        <select data-field="paymentStatus" class="admin-update w-full p-2 rounded-lg border border-slate-200">
          ${optionHtml(paymentOptions, row.paymentStatus)}
        </select>
        <div class="text-xs text-slate-400 mt-2">${escapeHtml(row.paymentProofFilename || 'No file name')}</div>
        ${renderPaymentProof(row)}
      </td>
      <td class="px-4 py-4">
        <select data-field="status" class="admin-update w-full p-2 rounded-lg border border-slate-200">
          ${optionHtml(statusOptions, row.status)}
        </select>
      </td>
      <td class="px-4 py-4">
        <textarea data-field="notes" class="admin-update w-56 min-h-20 p-2 rounded-lg border border-slate-200">${escapeHtml(row.notes || '')}</textarea>
      </td>
      <td class="px-4 py-4 text-right">
        <button data-action="delete" class="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-red-700 bg-red-50 hover:bg-red-100">
          Delete
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function updateRegistration(id, patch) {
  const response = await fetch(`/api/registrations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || 'Failed to update registration.');
  }
}

async function deleteRegistration(id) {
  const response = await fetch(`/api/registrations/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || 'Failed to delete registration.');
  }
}

tableBody.addEventListener('change', async event => {
  const field = event.target.dataset.field;
  if (!field) {
    return;
  }

  const row = event.target.closest('tr');
  try {
    await updateRegistration(row.dataset.id, { [field]: event.target.value });
  } catch (error) {
    alert(error.message);
    await loadRegistrations();
  }
});

tableBody.addEventListener('blur', async event => {
  const field = event.target.dataset.field;
  if (field !== 'notes') {
    return;
  }

  const row = event.target.closest('tr');
  try {
    await updateRegistration(row.dataset.id, { notes: event.target.value });
  } catch (error) {
    alert(error.message);
    await loadRegistrations();
  }
}, true);

tableBody.addEventListener('click', async event => {
  const button = event.target.closest('[data-action="delete"]');
  if (!button) {
    return;
  }

  const row = button.closest('tr');
  const confirmed = confirm('Delete this registration?');
  if (!confirmed) {
    return;
  }

  try {
    await deleteRegistration(row.dataset.id);
    await loadRegistrations();
  } catch (error) {
    alert(error.message);
  }
});

[categoryFilter, paymentFilter, statusFilter].forEach(filter => {
  filter.addEventListener('change', loadRegistrations);
});

searchInput.addEventListener('input', debounce(loadRegistrations));
refreshButton.addEventListener('click', loadRegistrations);

if (window.lucide) {
  window.lucide.createIcons();
}

loadRegistrations();
