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
let currentRows = [];

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

function fitCanvasText(ctx, text, maxWidth) {
  const value = String(text || '-');

  if (ctx.measureText(value).width <= maxWidth) {
    return value;
  }

  let clipped = value;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }

  return `${clipped}...`;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawTicketCanvas(ctx, ticket) {
  ctx.fillStyle = '#f6f8fb';
  ctx.fillRect(0, 0, 600, 800);

  ctx.save();
  ctx.shadowColor = 'rgba(26, 39, 68, 0.16)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;
  drawRoundedRect(ctx, 48, 42, 504, 732, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  drawRoundedRect(ctx, 48, 42, 504, 150, 28);
  ctx.fillStyle = '#1f3f8f';
  ctx.fill();
  ctx.fillRect(48, 150, 504, 42);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 13px Poppins, sans-serif';
  ctx.fillText('KREATIVA GLOBAL SCHOOL', 300, 82);
  ctx.font = 'bold 30px Poppins, sans-serif';
  ctx.fillText('Global Parenting', 300, 122);
  ctx.fillText('Summit 2026', 300, 160);

  drawRoundedRect(ctx, 214, 208, 172, 42, 21);
  ctx.fillStyle = '#eef4ff';
  ctx.fill();
  ctx.fillStyle = '#1f3f8f';
  ctx.font = 'bold 16px Poppins, sans-serif';
  ctx.fillText('E-TICKET', 300, 235);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Poppins, sans-serif';
  ctx.fillText('NAMA SISWA', 84, 306);
  ctx.fillStyle = '#1a2744';
  ctx.font = 'bold 20px Poppins, sans-serif';
  ctx.fillText(fitCanvasText(ctx, ticket.studentName, 430), 84, 334);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Poppins, sans-serif';
  ctx.fillText('NAMA ORANG TUA', 84, 378);
  ctx.fillStyle = '#1a2744';
  ctx.font = 'bold 20px Poppins, sans-serif';
  ctx.fillText(fitCanvasText(ctx, ticket.parentName, 430), 84, 406);

  [['NOMOR KURSI', ticket.seatNumber || '-'], ['PESERTA', `${ticket.attendeeCount || '-'} peserta`]].forEach(([label, value], index) => {
    const x = index === 0 ? 84 : 314;
    drawRoundedRect(ctx, x, 440, 202, 82, 16);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Poppins, sans-serif';
    ctx.fillText(label, x + 18, 470);
    ctx.fillStyle = '#1a2744';
    ctx.font = 'bold 20px Poppins, sans-serif';
    ctx.fillText(fitCanvasText(ctx, value, 166), x + 18, 500);
  });

  drawRoundedRect(ctx, 84, 544, 432, 144, 18);
  ctx.fillStyle = '#f3f7ff';
  ctx.fill();

  [
    ['HARI / TANGGAL', 'Sabtu, 20 Juni 2026'],
    ['WAKTU', '08:00 - 16:00 WIB'],
    ['LOKASI', 'Exibition Hall (Lantai 3),']
  ].forEach(([label, value], index) => {
    const y = 580 + index * 34;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px Poppins, sans-serif';
    ctx.fillText(label, 108, y);
    ctx.fillStyle = index === 0 ? '#1f3f8f' : '#1a2744';
    ctx.font = 'bold 13px Poppins, sans-serif';
    ctx.fillText(value, 228, y);
  });
  ctx.fillStyle = '#1a2744';
  ctx.font = 'bold 13px Poppins, sans-serif';
  ctx.fillText('Summarecon Mall Bandung', 228, 682);

  ctx.fillStyle = '#64748b';
  ctx.font = '11px Poppins, sans-serif';
  ctx.fillText('* Mohon simpan e-ticket ini untuk ditunjukkan saat registrasi ulang.', 84, 718);
}

function paymentProofUrl(filename) {
  return `/api/payment-proofs/${encodeURIComponent(filename)}`;
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

function buildPaymentContinuationUrl(row) {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('registration', row.registrationId || row.id);
  return url.toString();
}

async function copyPaymentContinuationLink(row) {
  const link = buildPaymentContinuationUrl(row);

  try {
    await navigator.clipboard.writeText(link);
    alert('Link lanjut pembayaran sudah disalin.');
  } catch {
    window.prompt('Salin link lanjut pembayaran:', link);
  }
}

function openTicketImage(row, ticketWindow) {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 800;

  const ctx = canvas.getContext('2d');
  drawTicketCanvas(ctx, {
    registrationId: row.registrationId,
    studentName: row.studentName,
    parentName: row.parentName,
    seatNumber: row.seatNumber,
    attendeeCount: row.attendeeCount
  });

  if (!ticketWindow) {
    alert('Pop-up diblokir. Izinkan pop-up untuk membuka tiket.');
    return;
  }

  const imageUrl = canvas.toDataURL('image/png');
  ticketWindow.document.write(`
    <!doctype html>
    <html>
      <head><title>${escapeHtml(row.registrationId || 'ticket')}</title></head>
      <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;">
        <img src="${imageUrl}" alt="Ticket ${escapeHtml(row.registrationId || '')}" style="max-width:100%;height:auto;">
      </body>
    </html>
  `);
  ticketWindow.document.close();
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
  currentRows = rows;
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
        <div class="text-[#ED3A5F] font-semibold mt-1">${formatCurrency(row.totalAmount)}</div>
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
        <button data-action="payment-link" title="Copy payment link" aria-label="Copy payment link for ${escapeHtml(row.registrationId)}" class="inline-flex items-center justify-center w-10 h-10 rounded-lg text-[#1f3f8f] bg-blue-50 hover:bg-blue-100 mr-2">
          <i data-lucide="link" class="w-5 h-5"></i>
        </button>
        <button data-action="ticket" title="Open ticket" aria-label="Open ticket for ${escapeHtml(row.registrationId)}" class="inline-flex items-center justify-center w-10 h-10 rounded-lg text-[#1a2744] bg-slate-100 hover:bg-slate-200 mr-2">
          <i data-lucide="ticket" class="w-5 h-5"></i>
        </button>
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
  const ticketButton = event.target.closest('[data-action="ticket"]');
  const paymentLinkButton = event.target.closest('[data-action="payment-link"]');

  if (paymentLinkButton) {
    const row = paymentLinkButton.closest('tr');
    const registration = currentRows.find(item => String(item.id) === String(row.dataset.id));

    if (registration) {
      await copyPaymentContinuationLink(registration);
    }

    return;
  }

  if (ticketButton) {
    const ticketWindow = window.open('', '_blank');
    if (ticketWindow) {
      ticketWindow.document.write('<!doctype html><title>Loading ticket...</title><body style="font-family:sans-serif;padding:24px;">Loading ticket...</body>');
      ticketWindow.document.close();
    }
    const row = ticketButton.closest('tr');
    const registration = currentRows.find(item => String(item.id) === String(row.dataset.id));

    if (registration) {
      openTicketImage(registration, ticketWindow);
    } else if (ticketWindow) {
      ticketWindow.close();
    }

    return;
  }

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
