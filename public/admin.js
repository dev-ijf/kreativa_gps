const tableBody = document.getElementById('registrations-body');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');
const gradeFilter = document.getElementById('grade-filter');
const paymentFilter = document.getElementById('payment-filter');
const statusFilter = document.getElementById('status-filter');
const refreshButton = document.getElementById('refresh-btn');
const exportExcelButton = document.getElementById('export-excel-btn');
const registrationCountSummary = document.getElementById('registration-count-summary');
const quotaTotal = document.getElementById('admin-quota-total');
const quotaUsed = document.getElementById('admin-quota-used');
const quotaRemaining = document.getElementById('admin-quota-remaining');
const tabButtons = document.querySelectorAll('[data-admin-tab]');
const tabPanels = document.querySelectorAll('[data-admin-panel]');
const studentsBody = document.getElementById('students-body');
const studentsEmptyState = document.getElementById('students-empty-state');
const studentForm = document.getElementById('student-form');
const studentSubmitButton = document.getElementById('student-submit-btn');
const studentCancelButton = document.getElementById('student-cancel-btn');
const studentSearchInput = document.getElementById('student-search-input');
const studentStatusFilter = document.getElementById('student-status-filter');
const studentRefreshButton = document.getElementById('student-refresh-btn');

const paymentOptions = ['pending', 'verified', 'rejected'];
const statusOptions = ['confirmed', 'attended', 'cancelled'];
let currentRows = [];
let currentStudents = [];
let studentsLoaded = false;
let editingStudentId = null;

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

function formatStudentParentStatus(parentStatus) {
  const labels = {
    existing_parent: 'Siswa Aktif 2026/2027',
    waiting_list_parent: 'Waiting List 2027/2028',
    has_not_registered: 'Has Not Registered'
  };

  return labels[parentStatus] || '-';
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

function getSelectedOptionLabel(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function renderCountCard(label, value, tone = 'slate') {
  const tones = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    blue: 'bg-blue-50 border-blue-100 text-[#1f3f8f]',
    green: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    red: 'bg-red-50 border-red-100 text-red-700'
  };

  return `
    <div class="rounded-lg border ${tones[tone] || tones.slate} px-4 py-3">
      <div class="text-xs uppercase tracking-wide opacity-70">${escapeHtml(label)}</div>
      <div class="text-2xl font-bold mt-1">${escapeHtml(value)}</div>
    </div>
  `;
}

function updateRegistrationCountSummary(rows) {
  if (!registrationCountSummary) {
    return;
  }

  const counts = rows.reduce((summary, row) => {
    const paymentStatus = row.paymentStatus || 'unknown';
    summary[paymentStatus] = (summary[paymentStatus] || 0) + 1;
    return summary;
  }, {});
  const activeFilters = [
    searchInput.value.trim() ? `Search: ${searchInput.value.trim()}` : '',
    categoryFilter.value ? `Category: ${getSelectedOptionLabel(categoryFilter)}` : '',
    gradeFilter.value ? `Grade: ${gradeFilter.value}` : '',
    paymentFilter.value ? `Payment: ${getSelectedOptionLabel(paymentFilter)}` : '',
    statusFilter.value ? `Status: ${getSelectedOptionLabel(statusFilter)}` : ''
  ].filter(Boolean);

  registrationCountSummary.innerHTML = `
    ${renderCountCard('Total data tampil', rows.length, 'blue')}
    ${renderCountCard('Pending', counts.pending || 0, 'slate')}
    ${renderCountCard('Verified', counts.verified || 0, 'green')}
    ${renderCountCard('Rejected', counts.rejected || 0, 'red')}
    <div class="sm:col-span-2 lg:col-span-4 text-slate-500">
      ${activeFilters.length ? `Filter aktif: ${escapeHtml(activeFilters.join(' | '))}` : 'Filter aktif: Semua data registration'}
    </div>
  `;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index) {
  let name = '';
  let number = index + 1;

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

let crcTable = null;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  bytes.forEach(byte => {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function getDosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function stringBytes(value) {
  return new TextEncoder().encode(value);
}

function createZip(files) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;
  const { time, date } = getDosDateTime();

  files.forEach(file => {
    const nameBytes = stringBytes(file.name);
    const dataBytes = stringBytes(file.content);
    const checksum = crc32(dataBytes);
    const localHeader = [];

    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, time);
    writeUint16(localHeader, date);
    writeUint32(localHeader, checksum);
    writeUint32(localHeader, dataBytes.length);
    writeUint32(localHeader, dataBytes.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);

    chunks.push(Uint8Array.from(localHeader), nameBytes, dataBytes);

    const centralHeader = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, time);
    writeUint16(centralHeader, date);
    writeUint32(centralHeader, checksum);
    writeUint32(centralHeader, dataBytes.length);
    writeUint32(centralHeader, dataBytes.length);
    writeUint16(centralHeader, nameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);
    centralDirectory.push(Uint8Array.from(centralHeader), nameBytes);

    offset += localHeader.length + nameBytes.length + dataBytes.length;
  });

  const centralSize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
  const endRecord = [];
  writeUint32(endRecord, 0x06054b50);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, files.length);
  writeUint16(endRecord, files.length);
  writeUint32(endRecord, centralSize);
  writeUint32(endRecord, offset);
  writeUint16(endRecord, 0);

  return new Blob([...chunks, ...centralDirectory, Uint8Array.from(endRecord)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

function createWorksheetXml(headers, rows) {
  const allRows = [headers, ...rows];
  const rowXml = allRows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowNumber}`;
      const style = rowIndex === 0 ? ' s="1"' : '';
      return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');
  const lastColumn = columnName(headers.length - 1);
  const lastRow = Math.max(allRows.length, 1);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;
}

function createXlsxBlob(headers, rows) {
  const worksheetXml = createWorksheetXml(headers, rows);
  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Registrations" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      name: 'xl/styles.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: worksheetXml
    }
  ];

  return createZip(files);
}

function exportRegistrationsToExcel() {
  if (!currentRows.length) {
    alert('Tidak ada data registration untuk diexport.');
    return;
  }

  const headers = [
    'Registration ID',
    'Created At',
    'Student Name',
    'Student Grade',
    'Parent Name',
    'Phone',
    'Email',
    'Category',
    'Waiting List Status',
    'Attendance',
    'Paket Snack & Makan Siang',
    'Seat Number',
    'Ticket Price',
    'Total Amount',
    'Payment Status',
    'Registration Status',
    'Payment Proof',
    'Notes'
  ];

  const rows = currentRows.map(row => [
    row.registrationId,
    formatDate(row.createdAt),
    row.studentName,
    row.studentLevel,
    row.parentName,
    row.phone,
    row.email,
    formatCategory(row.parentCategory),
    row.waitingListStatus,
    row.attendeeCount,
    row.lunchBoxCount,
    row.seatNumber,
    row.ticketPrice,
    row.totalAmount,
    row.paymentStatus,
    row.status,
    row.paymentProofFilename,
    row.notes
  ]);

  const blob = createXlsxBlob(headers, rows);
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  link.href = objectUrl;
  link.download = `registrations-gps-2026-${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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

  if (gradeFilter.value) {
    params.set('studentLevel', gradeFilter.value);
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
  updateRegistrationCountSummary(rows);
  emptyState.classList.toggle('hidden', rows.length > 0);

  if (!rows.length) {
    tableBody.innerHTML = '';
    return;
  }

  tableBody.innerHTML = rows.map(row => `
    <tr data-id="${row.id}" class="align-top">
      <td class="px-3 py-4 break-words">
        <div class="font-semibold text-[#1a2744] leading-snug">${escapeHtml(row.registrationId)}</div>
        <div class="text-slate-500">Seat ${escapeHtml(row.seatNumber)}</div>
        <div class="text-xs text-slate-400 mt-1">${formatDate(row.createdAt)}</div>
      </td>
      <td class="px-3 py-4 break-words">
        <div class="font-medium leading-snug">${escapeHtml(row.studentName)}</div>
        <div class="text-slate-500">${escapeHtml(row.studentLevel)}</div>
        <div class="text-slate-500">${escapeHtml(row.attendeeCount)} attendee(s), ${escapeHtml(row.lunchBoxCount)} lunch</div>
        <div class="text-[#ED3A5F] font-semibold mt-1">${formatCurrency(row.totalAmount)}</div>
      </td>
      <td class="px-3 py-4 break-words">
        <div class="font-medium leading-snug">${escapeHtml(row.parentName)}</div>
        <div class="text-slate-500 break-all">${escapeHtml(row.phone)}</div>
        <div class="text-slate-500 break-all">${escapeHtml(row.email)}</div>
      </td>
      <td class="px-3 py-4 break-words">
        <span class="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 leading-tight">${formatCategory(row.parentCategory)}</span>
        ${row.waitingListStatus ? `<div class="text-slate-500 mt-2">${escapeHtml(row.waitingListStatus)}</div>` : ''}
      </td>
      <td class="px-3 py-4">
        <select data-field="paymentStatus" class="admin-update w-full p-2 rounded-lg border border-slate-200 text-sm">
          ${optionHtml(paymentOptions, row.paymentStatus)}
        </select>
        <div class="text-xs text-slate-400 mt-2 break-all">${escapeHtml(row.paymentProofFilename || 'No file name')}</div>
        ${renderPaymentProof(row)}
      </td>
      <td class="px-3 py-4">
        <select data-field="status" class="admin-update w-full p-2 rounded-lg border border-slate-200 text-sm">
          ${optionHtml(statusOptions, row.status)}
        </select>
      </td>
      <td class="px-3 py-4">
        <textarea data-field="notes" class="admin-update w-full min-h-16 p-2 rounded-lg border border-slate-200 text-sm resize-y">${escapeHtml(row.notes || '')}</textarea>
      </td>
      <td class="px-3 py-4">
        <div class="flex items-center justify-end gap-1.5">
        <button data-action="payment-link" title="Copy payment link" aria-label="Copy payment link for ${escapeHtml(row.registrationId)}" class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[#1f3f8f] bg-blue-50 hover:bg-blue-100">
          <i data-lucide="link" class="w-5 h-5"></i>
        </button>
        <button data-action="ticket" title="Open ticket" aria-label="Open ticket for ${escapeHtml(row.registrationId)}" class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[#1a2744] bg-slate-100 hover:bg-slate-200">
          <i data-lucide="ticket" class="w-5 h-5"></i>
        </button>
        <button data-action="delete" title="Delete registration" aria-label="Delete ${escapeHtml(row.registrationId)}" class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-red-700 bg-red-50 hover:bg-red-100">
          <i data-lucide="trash-2" class="w-5 h-5"></i>
        </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function buildStudentQuery() {
  const params = new URLSearchParams();

  if (studentSearchInput.value.trim()) {
    params.set('search', studentSearchInput.value.trim());
  }

  if (studentStatusFilter.value) {
    params.set('parentStatus', studentStatusFilter.value);
  }

  return params.toString();
}

async function loadEligibleStudents() {
  studentsBody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500">Loading...</td></tr>';

  const query = buildStudentQuery();
  const response = await fetch(`/api/eligible-students${query ? `?${query}` : ''}`);
  const result = await response.json();

  if (!response.ok) {
    studentsBody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-red-600">${result.error || 'Failed to load student data.'}</td></tr>`;
    return;
  }

  currentStudents = result.students || [];
  studentsLoaded = true;
  renderEligibleStudents(currentStudents);
}

function renderEligibleStudents(rows) {
  studentsEmptyState.classList.toggle('hidden', rows.length > 0);

  if (!rows.length) {
    studentsBody.innerHTML = '';
    return;
  }

  studentsBody.innerHTML = rows.map(student => {
    const isEditing = String(student.id) === String(editingStudentId);
    return `
    <tr data-id="${escapeHtml(student.id)}" class="align-top">
      <td class="px-3 py-4">
        ${isEditing
          ? `<input data-student-field="studentName" value="${escapeHtml(student.studentName)}" class="w-full p-2 rounded-lg border border-slate-200 text-sm font-semibold text-[#1a2744]">`
          : `<div class="font-semibold text-[#1a2744] leading-snug">${escapeHtml(student.studentName)}</div>`}
      </td>
      <td class="px-3 py-4">
        ${isEditing ? `
        <select data-student-field="parentStatus" class="w-full p-2 rounded-lg border border-slate-200 text-sm">
          <option value="existing_parent" ${student.parentStatus === 'existing_parent' ? 'selected' : ''}>Siswa Aktif 2026/2027</option>
          <option value="waiting_list_parent" ${student.parentStatus === 'waiting_list_parent' ? 'selected' : ''}>Waiting List 2027/2028</option>
          <option value="has_not_registered" ${student.parentStatus === 'has_not_registered' ? 'selected' : ''}>Has Not Registered</option>
        </select>
        ` : `<span class="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 leading-tight">${formatStudentParentStatus(student.parentStatus)}</span>`}
      </td>
      <td class="px-3 py-4">
        ${isEditing ? `
        <select data-student-field="grade" class="w-full p-2 rounded-lg border border-slate-200 text-sm">
          <option value="">Grade</option>
          ${['Kindergarten 1', 'Kindergarten 2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 7', 'Grade 10'].map(grade => `<option value="${grade}" ${student.grade === grade ? 'selected' : ''}>${grade}</option>`).join('')}
        </select>
        ` : `<span class="text-slate-600">${escapeHtml(student.grade || '-')}</span>`}
      </td>
      <td class="px-3 py-4">
        <div class="flex items-center justify-end gap-1.5">
          ${isEditing ? `
          <button data-action="save-student-row" title="Save student" aria-label="Save ${escapeHtml(student.studentName)}" class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[#1f3f8f] bg-blue-50 hover:bg-blue-100">
            <i data-lucide="save" class="w-5 h-5"></i>
          </button>
          <button data-action="cancel-student-edit" title="Cancel edit" aria-label="Cancel edit for ${escapeHtml(student.studentName)}" class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
          ` : `
          <button data-action="edit-student" title="Edit student" aria-label="Edit ${escapeHtml(student.studentName)}" class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[#1f3f8f] bg-blue-50 hover:bg-blue-100">
            <i data-lucide="pencil" class="w-5 h-5"></i>
          </button>
          `}
          <button data-action="delete-student" title="Delete student" aria-label="Delete ${escapeHtml(student.studentName)}" class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-red-700 bg-red-50 hover:bg-red-100">
            <i data-lucide="trash-2" class="w-5 h-5"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function resetStudentForm() {
  studentForm.reset();
  studentForm.elements.id.value = '';
  studentSubmitButton.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i>Simpan';
  studentCancelButton.classList.add('hidden');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function fillStudentForm(student) {
  studentForm.elements.id.value = student.id;
  studentForm.elements.studentName.value = student.studentName || '';
  studentForm.elements.parentStatus.value = student.parentStatus || '';
  studentForm.elements.grade.value = student.grade || '';
  studentSubmitButton.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i>Update';
  studentCancelButton.classList.remove('hidden');
  studentForm.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function saveEligibleStudent(event) {
  event.preventDefault();
  const id = studentForm.elements.id.value;
  const payload = {
    studentName: studentForm.elements.studentName.value,
    parentStatus: studentForm.elements.parentStatus.value,
    grade: studentForm.elements.grade.value
  };

  const response = await fetch(id ? `/api/eligible-students/${encodeURIComponent(id)}` : '/api/eligible-students', {
    method: id ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to save student data.');
  }

  resetStudentForm();
  await loadEligibleStudents();
}

async function deleteEligibleStudent(id) {
  const response = await fetch(`/api/eligible-students/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || 'Failed to delete student data.');
  }
}

function readStudentRowPayload(row) {
  return {
    studentName: row.querySelector('[data-student-field="studentName"]')?.value || '',
    parentStatus: row.querySelector('[data-student-field="parentStatus"]')?.value || '',
    grade: row.querySelector('[data-student-field="grade"]')?.value || ''
  };
}

async function updateEligibleStudentRow(id, payload) {
  const response = await fetch(`/api/eligible-students/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to update student data.');
  }
}

async function switchAdminTab(tabName) {
  tabButtons.forEach(button => {
    button.classList.toggle('is-active', button.dataset.adminTab === tabName);
  });

  tabPanels.forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.adminPanel !== tabName);
  });

  if (tabName === 'students' && !studentsLoaded) {
    await loadEligibleStudents();
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

[categoryFilter, gradeFilter, paymentFilter, statusFilter].forEach(filter => {
  filter.addEventListener('change', loadRegistrations);
});

tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    switchAdminTab(button.dataset.adminTab).catch(error => alert(error.message));
  });
});

searchInput.addEventListener('input', debounce(loadRegistrations));
refreshButton.addEventListener('click', loadRegistrations);
exportExcelButton.addEventListener('click', exportRegistrationsToExcel);

studentSearchInput.addEventListener('input', debounce(loadEligibleStudents));
studentStatusFilter.addEventListener('change', loadEligibleStudents);
studentRefreshButton.addEventListener('click', loadEligibleStudents);
studentCancelButton.addEventListener('click', resetStudentForm);
studentForm.addEventListener('submit', event => {
  saveEligibleStudent(event).catch(error => alert(error.message));
});

studentsBody.addEventListener('click', async event => {
  const editButton = event.target.closest('[data-action="edit-student"]');
  const saveButton = event.target.closest('[data-action="save-student-row"]');
  const cancelButton = event.target.closest('[data-action="cancel-student-edit"]');
  const deleteButton = event.target.closest('[data-action="delete-student"]');

  if (editButton) {
    const row = editButton.closest('tr');
    editingStudentId = row.dataset.id;
    renderEligibleStudents(currentStudents);
    return;
  }

  if (cancelButton) {
    editingStudentId = null;
    renderEligibleStudents(currentStudents);
    return;
  }

  if (saveButton) {
    const row = saveButton.closest('tr');
    const originalIcon = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5"></i>';

    if (window.lucide) {
      window.lucide.createIcons();
    }

    try {
      await updateEligibleStudentRow(row.dataset.id, readStudentRowPayload(row));
      editingStudentId = null;
      await loadEligibleStudents();
    } catch (error) {
      alert(error.message);
      saveButton.disabled = false;
      saveButton.innerHTML = originalIcon;
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }

    return;
  }

  if (deleteButton) {
    const row = deleteButton.closest('tr');
    const student = currentStudents.find(item => String(item.id) === String(row.dataset.id));
    const confirmed = confirm(`Hapus data siswa ${student?.studentName || ''}?`);

    if (!confirmed) {
      return;
    }

    try {
      await deleteEligibleStudent(row.dataset.id);
      if (String(editingStudentId) === String(row.dataset.id)) {
        editingStudentId = null;
      }
      resetStudentForm();
      await loadEligibleStudents();
    } catch (error) {
      alert(error.message);
    }
  }
});

if (window.lucide) {
  window.lucide.createIcons();
}

loadRegistrations();
