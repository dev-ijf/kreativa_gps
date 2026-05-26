const templateContent = {
  'hero-eyebrow': 'Kreativa Global School Presents',
  'hero-title': 'Global Parenting Summit 2026',
  'hero-subtitle': 'A focused morning for parents to connect, learn, and prepare children for a changing world.',
  'event-date': 'Saturday, 20 June 2026',
  'event-time': '08:00 - 14:00 WIB',
  'event-venue': 'Exibition Hall, Summarecon Mall Bandung',
  'hero-cta': 'Register Now',
  'about-title': 'Parenting With Clarity, Connection, and Confidence',
  'about-desc': 'Join educators, family experts, and fellow parents for practical conversations about supporting children academically, emotionally, and socially in 2026 and beyond.',
  'reg-title': 'Registration',
  'reg-subtitle': 'Choose your parent category to see the correct registration flow.',
  'reg-type-label': 'Parent Category',
  'payment-title': 'Payment Confirmation',
  'payment-title-b': 'Payment Confirmation',
  'qris-label': 'Scan QRIS Syariah Payment to complete your reservation',
  'qris-label-b': 'Scan QRIS Syariah Payment to complete your reservation',
  'qris-name': 'Kreativa Global School',
  'qris-name-b': 'Kreativa Global School',
  'upload-label': 'Upload payment proof',
  'upload-label-b': 'Upload payment proof',
  'submit-btn': 'Submit Registration',
  'submit-btn-b': 'Submit Registration',
  'exclusive-text': 'This summit is currently reserved for registered and waiting-list parents. Please contact our admission team for further information.',
  'wa-btn': 'WhatsApp Admission',
  'contact-btn': 'Contact School',
  'confirm-title': 'Registration Confirmed',
  'confirm-msg': 'Your registration details and attendance QR code are ready.',
  'footer-name': 'Global Parenting Summit 2026',
  'footer-tagline': 'Hosted by Kreativa Global School',
  'footer-contact': 'info@kreativaglobal.sch.id'
};

const imageSources = {
  'hero-img': 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1800&q=80',
  'about-img': 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=1200&q=80'
};

let generatedSeatNumber = '';
let currentRegistration = null;
const appConfig = {
  ticketPrice: 0,
  ticketQuota: 800,
  remainingSeats: 800
};

function fillTemplateContent() {
  Object.entries(templateContent).forEach(([id, value]) => {
    const element = document.querySelector(`[data-template-id="${id}"]`);
    if (element && !element.textContent.trim()) {
      element.textContent = value;
    }
  });

  Object.entries(imageSources).forEach(([id, src]) => {
    const image = document.querySelector(`[data-template-id="${id}"]`);
    if (image && !image.getAttribute('src')) {
      image.src = src;
      image.alt = id === 'hero-img'
        ? 'Parents attending an education summit'
        : 'Teacher and families in a school learning session';
    }
  });
}

function resetFlows() {
  ['flow-a', 'flow-b', 'flow-c'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  generatedSeatNumber = '';
}

function handleParentTypeChange(event) {
  resetFlows();

  const selectedFlow = {
    existing: 'flow-a',
    waitlist: 'flow-b',
    new: 'flow-c'
  }[event.target.value];

  if (selectedFlow) {
    document.getElementById(selectedFlow).classList.remove('hidden');
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      return;
    }

    const config = await response.json();
    appConfig.ticketPrice = Number(config.ticketPrice || 0);
    appConfig.ticketQuota = Number(config.ticketQuota || 800);
    appConfig.remainingSeats = Number(config.remainingSeats || 0);
    updateQuotaSummary();
    updateAllPriceSummaries();
  } catch {
    updateQuotaSummary();
    updateAllPriceSummaries();
  }
}

function updateQuotaSummary() {
  const quotaDisplay = document.getElementById('quota-display');

  if (!quotaDisplay) {
    return;
  }

  quotaDisplay.textContent = `${appConfig.remainingSeats} / ${appConfig.ticketQuota}`;
}

function updatePriceSummary(form) {
  const attendeeCount = Number(form.querySelector('[name="attendeeCount"]')?.value || 0);
  const priceLabel = form.querySelector('[data-price-label]');
  const quantityLabel = form.querySelector('[data-quantity-label]');
  const totalLabel = form.querySelector('[data-total-label]');

  if (!priceLabel || !quantityLabel || !totalLabel) {
    return;
  }

  priceLabel.textContent = formatCurrency(appConfig.ticketPrice);
  quantityLabel.textContent = attendeeCount ? `${attendeeCount} ticket(s)` : '-';
  totalLabel.textContent = attendeeCount ? formatCurrency(attendeeCount * appConfig.ticketPrice) : '-';
}

function updateAllPriceSummaries() {
  document.querySelectorAll('form').forEach(updatePriceSummary);
}

function setupAttendanceLunchSync() {
  document.querySelectorAll('form').forEach(form => {
    const attendeeSelect = form.querySelector('[name="attendeeCount"]');
    const lunchSelect = form.querySelector('[name="lunchBoxCount"]');

    if (!attendeeSelect || !lunchSelect) {
      return;
    }

    attendeeSelect.addEventListener('change', () => {
      lunchSelect.value = attendeeSelect.value;
      updatePriceSummary(form);
    });

    lunchSelect.addEventListener('change', () => {
      if (!attendeeSelect.value) {
        attendeeSelect.value = lunchSelect.value;
      }

      if (lunchSelect.value !== attendeeSelect.value) {
        lunchSelect.value = attendeeSelect.value;
      }

      updatePriceSummary(form);
    });

    updatePriceSummary(form);
  });
}

function generateSeatNumber() {
  generatedSeatNumber = String(Math.floor(Math.random() * appConfig.ticketQuota) + 1);
}

function updatePaymentProofPreview(input) {
  const file = input.files && input.files[0];
  const zone = input.closest('.upload-zone');

  if (!zone) {
    return;
  }

  let preview = zone.querySelector('.upload-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'upload-preview hidden';
    zone.appendChild(preview);
  }

  if (!file) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }

  const fileSize = `${Math.max(file.size / 1024 / 1024, 0.01).toFixed(2)} MB`;

  if (file.type.startsWith('image/')) {
    const imageUrl = URL.createObjectURL(file);
    preview.innerHTML = `
      <img src="${imageUrl}" alt="Selected payment proof" class="upload-preview-image">
      <div class="upload-preview-meta">
        <strong>${file.name}</strong>
        <span>${fileSize}</span>
      </div>
    `;
  } else {
    preview.innerHTML = `
      <div class="upload-preview-file">
        <span>PDF</span>
      </div>
      <div class="upload-preview-meta">
        <strong>${file.name}</strong>
        <span>${fileSize}</span>
      </div>
    `;
  }

  preview.classList.remove('hidden');
}

function getSelectedCategory() {
  return document.getElementById('parent-type').value;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read payment proof file.'));
    reader.readAsDataURL(file);
  });
}

async function buildRegistrationPayload(form) {
  const formData = new FormData(form);
  const paymentProof = formData.get('paymentProof');
  const attendeeCount = String(formData.get('attendeeCount') || '1');
  const hasPaymentProof = paymentProof && paymentProof.name;

  if (hasPaymentProof && paymentProof.size > 5_000_000) {
    throw new Error('Payment proof file is too large. Maximum size is 5 MB.');
  }

  const payload = {
    category: getSelectedCategory(),
    waitingListStatus: String(formData.get('waitingListStatus') || ''),
    studentLevel: String(formData.get('studentLevel') || ''),
    studentName: String(formData.get('studentName') || ''),
    parentName: String(formData.get('parentName') || ''),
    phone: String(formData.get('phone') || ''),
    email: String(formData.get('email') || ''),
    attendeeCount,
    lunchBoxCount: attendeeCount,
    paymentProofFilename: hasPaymentProof ? paymentProof.name : '',
    paymentProofMimeType: hasPaymentProof ? paymentProof.type : '',
    paymentProofData: ''
  };

  if (hasPaymentProof) {
    payload.paymentProofData = await readFileAsDataUrl(paymentProof);
  }

  return payload;
}

async function saveRegistration(form) {
  const payload = await buildRegistrationPayload(form);

  const response = await fetch('/api/registrations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Registration failed.');
  }

  return result.registration;
}

async function showConfirmation(event) {
  event.preventDefault();

  const form = event.target;
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  const attendeeCount = form.querySelector('[name="attendeeCount"]')?.value;
  const lunchBoxCount = form.querySelector('[name="lunchBoxCount"]')?.value;

  if (attendeeCount !== lunchBoxCount) {
    alert('Lunch box reservation must match number of attendees.');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Saving...';

  try {
    const registration = await saveRegistration(form);
    currentRegistration = registration;

    document.getElementById('reg-id').textContent = registration.registrationId;
    document.getElementById('seat-display').textContent = registration.seatNumber || generatedSeatNumber || '-';
    document.getElementById('attendee-display').textContent = `${registration.attendeeCount} attendee(s)`;
    document.getElementById('total-display').textContent = formatCurrency(registration.totalAmount);
    document.getElementById('confirmation').classList.remove('hidden');
    loadConfig();
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
}

function downloadTicket() {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 800;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 600, 800);

  ctx.fillStyle = '#b8860b';
  ctx.fillRect(0, 0, 600, 100);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Global Parenting Summit', 300, 50);
  ctx.font = '20px Poppins, sans-serif';
  ctx.fillText('2026', 300, 80);

  ctx.fillStyle = '#1a2744';
  ctx.font = 'bold 18px Poppins, sans-serif';
  ctx.fillText('Registration ID', 300, 150);
  ctx.font = 'bold 24px Poppins, sans-serif';
  ctx.fillText(document.getElementById('reg-id').textContent, 300, 180);

  ctx.font = 'bold 14px Poppins, sans-serif';
  ctx.fillText('Seat Number(s)', 300, 210);
  ctx.font = 'bold 18px Poppins, sans-serif';
  ctx.fillText(document.getElementById('seat-display').textContent, 300, 235);

  ctx.font = 'bold 14px Poppins, sans-serif';
  ctx.fillText('Total Payment', 300, 265);
  ctx.font = 'bold 18px Poppins, sans-serif';
  ctx.fillText(document.getElementById('total-display').textContent, 300, 290);

  ctx.fillStyle = '#4a5568';
  ctx.font = '14px Poppins, sans-serif';
  ctx.fillText('Date: Saturday, 15 August 2026', 300, 330);
  ctx.fillText('Time: 08:00 - 12:00 WIB', 300, 360);
  ctx.fillText('Venue: Kreativa Global School Auditorium', 300, 390);

  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(175, 425, 250, 250);
  ctx.fillStyle = '#b8860b';
  ctx.font = '14px Poppins, sans-serif';
  ctx.fillText('[QR Code]', 300, 550);

  ctx.fillStyle = '#1a2744';
  ctx.font = 'bold 16px Poppins, sans-serif';
  ctx.fillText('Kreativa Global School', 300, 730);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Poppins, sans-serif';
  ctx.fillText('info@kreativaglobal.sch.id', 300, 760);

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = document.getElementById('reg-id').textContent + '_ticket.png';
  link.click();
}

function setupUploadZones() {
  document.querySelectorAll('.upload-zone').forEach(zone => {
    const input = zone.querySelector('input[type="file"]');

    if (input) {
      input.addEventListener('change', () => updatePaymentProofPreview(input));
    }

    zone.addEventListener('dragover', event => {
      event.preventDefault();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

    zone.addEventListener('drop', event => {
      event.preventDefault();
      zone.classList.remove('dragover');

      const input = zone.querySelector('input[type="file"]');
      if (input && event.dataTransfer.files.length) {
        input.files = event.dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}

function initPage() {
  fillTemplateContent();
  document.getElementById('parent-type').addEventListener('change', handleParentTypeChange);
  setupAttendanceLunchSync();
  setupUploadZones();
  loadConfig();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

window.generateSeatNumber = generateSeatNumber;
window.showConfirmation = showConfirmation;
window.downloadTicket = downloadTicket;

document.addEventListener('DOMContentLoaded', initPage);
