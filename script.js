const templateContent = {
  'hero-eyebrow': 'Kreativa Global School Presents',
  'hero-title': 'Global Parenting Summit 2026',
  'hero-subtitle': 'A focused morning for parents to connect, learn, and prepare children for a changing world.',
  'event-date': 'Saturday, 20 June 2026',
  'event-time': '08:00 - 14:00 WIB',
  'event-venue': 'Exibition Hall, Summarecon Mall Bandung',
  'hero-cta': 'Register Now',
  'about-title': 'WHAT IS GLOBAL PARENTING SUMMIT?',
  'about-desc-1': 'Global Parenting Summit is an annual educational forum initiated by Kreativa Global School to support parents in navigating the challenges of raising children in a rapidly changing world.',
  'about-desc-2': 'We believe parenting plays a critical role in a child’s educational journey, and through this summit, educators, experts, and parents come together to explore how families can better prepare children to grow with confidence and purpose.',
  'about-desc-3': 'Through meaningful discussions and shared insights, Global Parenting Summit encourages parents to take an active role in guiding their children’s development while strengthening collaboration between families and schools.',
  'reg-title': 'Registration',
  'reg-subtitle': 'Choose your parent category to see the correct registration flow.',
  'verification-note': 'Registration will be verified based on student name in school records before payment can be completed.',
  'reg-type-label': 'Parent Category',
  'payment-title': 'Payment Confirmation',
  'payment-title-b': 'Payment Confirmation',
  'qris-label': 'Scan QRIS Syariah Payment to complete your reservation',
  'qris-label-b': 'Scan QRIS Syariah Payment to complete your reservation',
  'qris-name': 'Kreativa Global School',
  'qris-name-b': 'Kreativa Global School',
  'upload-label': 'Upload payment proof (required)',
  'upload-label-b': 'Upload payment proof (required)',
  'submit-btn': 'Continue',
  'submit-btn-b': 'Continue',
  'wa-btn': 'Whatsapp',
  'confirm-title': 'Registration Confirmed',
  'confirm-msg': 'Your registration details and ticket are ready.',
  'footer-name': 'Global Parenting Summit 2026',
  'footer-tagline': 'Hosted by Kreativa Global School',
  'footer-contact': 'info@kreativaglobal.sch.id'
};

const imageSources = {
  'hero-img': 'assets/bg-1.jpeg',
  'about-img': 'assets/desc1.jpeg'
};

let generatedSeatNumber = '';
let currentRegistration = null;
const appConfig = {
  ticketPrice: 0,
  ticketQuota: 800
};
const maxDirectUploadBytes = 2_000_000;
const maxPaymentProofDataUrlLength = 2_800_000;
const maxPaymentProofImageDimension = 1400;

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
  hideResultSections();
  resetVerificationState();
  generatedSeatNumber = '';
}

function hideResultSections() {
  ['review-section', 'interest-section', 'confirmation'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function setPaymentFieldsEnabled(form, enabled) {
  form.querySelectorAll('[name="paymentProof"]').forEach(input => {
    input.disabled = !enabled;
  });
}

function setSubmitLabel(form, label) {
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.textContent = label;
  }
}

function hidePaymentSections(form = document) {
  form.querySelectorAll('.price-summary, #payment-a, #payment-b').forEach(section => {
    section.classList.add('hidden');
  });

  if (form.tagName === 'FORM') {
    setPaymentFieldsEnabled(form, false);
    setSubmitLabel(form, 'Continue');
  }
}

function showPaymentSection(form, registration) {
  currentRegistration = registration;
  form.dataset.registrationId = registration.id || registration.registrationId || '';
  form.dataset.verificationStatus = 'verified';
  form.querySelectorAll('.price-summary, #payment-a, #payment-b').forEach(section => {
    section.classList.remove('hidden');
  });
  setPaymentFieldsEnabled(form, true);
  updatePriceSummary(form);
  setSubmitLabel(form, 'Submit Payment Proof');

  const paymentSection = form.querySelector('#payment-a, #payment-b');
  paymentSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetVerificationState() {
  document.querySelectorAll('form').forEach(form => {
    delete form.dataset.registrationId;
    delete form.dataset.verificationStatus;
    hidePaymentSections(form);
  });
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

  updateWaitingListStatusFlow();
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
    updateAllPriceSummaries();
  } catch {
    updateAllPriceSummaries();
  }
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

function updateWaitingListStatusFlow() {
  const form = document.getElementById('flow-b');
  const statusSelect = form?.querySelector('[name="waitingListStatus"]');
  const registrationFields = document.getElementById('flow-b-registration-fields');
  const contactCard = document.getElementById('flow-b-contact');

  if (!statusSelect || !registrationFields || !contactCard) {
    return;
  }

  const shouldContactAdmin = false;
  registrationFields.classList.toggle('hidden', shouldContactAdmin);
  contactCard.classList.toggle('hidden', true);

  registrationFields.querySelectorAll('input, select, textarea, button').forEach(element => {
    element.disabled = shouldContactAdmin;
  });

  if (shouldContactAdmin) {
    generatedSeatNumber = '';
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function setupWaitingListStatus() {
  const statusSelect = document.querySelector('#flow-b [name="waitingListStatus"]');

  if (!statusSelect) {
    return;
  }

  statusSelect.addEventListener('change', updateWaitingListStatusFlow);
  updateWaitingListStatusFlow();
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

function isImagePaymentProof(file) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function replaceFileExtension(filename, extension) {
  const baseName = String(filename || 'payment-proof').replace(/\.[^.]+$/, '');
  return `${baseName}${extension}`;
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to process this image. Please use JPG or PNG.'));
    image.src = dataUrl;
  });
}

async function compressImagePaymentProof(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(originalDataUrl);
  const scale = Math.min(
    1,
    maxPaymentProofImageDimension / image.naturalWidth,
    maxPaymentProofImageDimension / image.naturalHeight
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const qualities = [0.78, 0.66, 0.54];
  let compressedDataUrl = '';

  for (const quality of qualities) {
    compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    if (compressedDataUrl.length <= maxPaymentProofDataUrlLength) {
      break;
    }
  }

  if (compressedDataUrl.length > maxPaymentProofDataUrlLength) {
    throw new Error('Payment proof image is too large. Please upload a smaller screenshot or photo.');
  }

  return {
    filename: replaceFileExtension(file.name, '.jpg'),
    mimeType: 'image/jpeg',
    dataUrl: compressedDataUrl
  };
}

async function preparePaymentProof(file) {
  if (!file || !file.name) {
    return {
      filename: '',
      mimeType: '',
      dataUrl: ''
    };
  }

  if (isImagePaymentProof(file)) {
    return compressImagePaymentProof(file);
  }

  if (file.size > maxDirectUploadBytes) {
    throw new Error('PDF payment proof is too large. Maximum PDF size is 2 MB.');
  }

  const dataUrl = await readFileAsDataUrl(file);
  if (dataUrl.length > maxPaymentProofDataUrlLength) {
    throw new Error('Payment proof file is too large. Please upload a smaller file.');
  }

  return {
    filename: file.name,
    mimeType: file.type,
    dataUrl
  };
}

function getFriendlyErrorMessage(error) {
  const message = String(error?.message || error || 'Registration failed.');

  if (message.includes('expected pattern')) {
    return 'Upload failed because the payment proof file is too large for this browser. Please upload a smaller image.';
  }

  return message;
}

function validatePaymentProofSelection(form) {
  const input = form.querySelector('[name="paymentProof"]:not(:disabled)');
  const file = input?.files && input.files[0];

  if (file?.name) {
    return true;
  }

  const uploadZone = input?.closest('.upload-zone');
  if (uploadZone) {
    uploadZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    uploadZone.classList.add('dragover');
    window.setTimeout(() => uploadZone.classList.remove('dragover'), 1400);
  }

  alert('Payment proof is required. Please upload JPG, PNG, or PDF.');
  return false;
}

function validateContactFields(form) {
  const phoneInput = form.querySelector('[name="phone"]');
  const emailInput = form.querySelector('[name="email"]');
  const phone = String(phoneInput?.value || '').trim();
  const email = String(emailInput?.value || '').trim();

  if (!/^\d+$/.test(phone)) {
    phoneInput?.focus();
    alert('Phone number must contain numbers only.');
    return false;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailInput?.focus();
    alert('Please enter a valid email address.');
    return false;
  }

  return true;
}

async function buildRegistrationPayload(form, options = {}) {
  const includePaymentProof = Boolean(options.includePaymentProof);
  const formData = new FormData(form);
  const paymentProof = formData.get('paymentProof');
  const attendeeCount = String(formData.get('attendeeCount') || '1');
  const hasPaymentProof = includePaymentProof && paymentProof && paymentProof.name;
  const preparedPaymentProof = hasPaymentProof
    ? await preparePaymentProof(paymentProof)
    : { filename: '', mimeType: '', dataUrl: '' };

  const payload = {
    action: includePaymentProof ? 'payment' : 'verify',
    registrationId: form.dataset.registrationId || '',
    category: getSelectedCategory(),
    waitingListStatus: String(formData.get('waitingListStatus') || ''),
    studentLevel: String(formData.get('studentLevel') || ''),
    studentName: String(formData.get('studentName') || ''),
    parentName: String(formData.get('parentName') || ''),
    phone: String(formData.get('phone') || ''),
    email: String(formData.get('email') || ''),
    attendeeCount,
    lunchBoxCount: attendeeCount,
    paymentProofFilename: preparedPaymentProof.filename,
    paymentProofMimeType: preparedPaymentProof.mimeType,
    paymentProofData: preparedPaymentProof.dataUrl
  };

  return payload;
}

async function postRegistrationPayload(payload) {

  const response = await fetch('/api/registrations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok || result.success === false) {
    throw new Error(result.error || result.message || 'Registration failed.');
  }

  return result;
}

async function verifyRegistration(form) {
  return postRegistrationPayload(await buildRegistrationPayload(form));
}

async function submitPaymentProof(form) {
  return postRegistrationPayload(await buildRegistrationPayload(form, { includePaymentProof: true }));
}

function showReviewSection() {
  hideResultSections();
  document.getElementById('review-section')?.classList.remove('hidden');
  document.getElementById('review-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showInterestSection() {
  hideResultSections();
  document.getElementById('interest-section')?.classList.remove('hidden');
  document.getElementById('interest-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showTicketConfirmation(registration) {
  currentRegistration = registration;

  document.getElementById('reg-id').textContent = registration.registrationId;
  document.getElementById('seat-display').textContent = registration.seatNumber || generatedSeatNumber || '-';
  document.getElementById('attendee-display').textContent = `${registration.attendeeCount} attendee(s)`;
  document.getElementById('total-display').textContent = formatCurrency(registration.totalAmount);
  document.getElementById('confirmation').classList.remove('hidden');
  loadConfig();
}

async function showConfirmation(event) {
  event.preventDefault();

  const form = event.target;
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  const attendeeCount = form.querySelector('[name="attendeeCount"]')?.value;
  const lunchBoxCount = form.querySelector('[name="lunchBoxCount"]')?.value;
  const isPaymentStep = form.dataset.verificationStatus === 'verified' && form.dataset.registrationId;

  if (attendeeCount !== lunchBoxCount) {
    alert('Lunch box reservation must match number of attendees.');
    return;
  }

  if (!validateContactFields(form)) {
    return;
  }

  if (isPaymentStep && !validatePaymentProofSelection(form)) {
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = isPaymentStep ? 'Saving...' : 'Checking...';

  try {
    if (isPaymentStep) {
      const result = await submitPaymentProof(form);
      showTicketConfirmation(result.registration);
      return;
    }

    hideResultSections();
    hidePaymentSections(form);
    const result = await verifyRegistration(form);

    if (result.status === 'verified') {
      showPaymentSection(form, result.registration);
      return;
    }

    if (result.status === 'need_review') {
      showReviewSection(result.registration_id);
      return;
    }

    showInterestSection(result.registration_id);
  } catch (error) {
    alert(getFriendlyErrorMessage(error));
  } finally {
    submitButton.disabled = false;
    if (form.dataset.verificationStatus === 'verified' && form.dataset.registrationId) {
      submitButton.textContent = 'Submit Payment Proof';
    } else {
      submitButton.textContent = originalLabel;
    }
  }
}

function downloadTicket() {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 800;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 600, 800);

  ctx.fillStyle = '#ED3A5F';
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

  ctx.fillStyle = '#1a2744';
  ctx.font = 'bold 16px Poppins, sans-serif';
  ctx.fillText('Kreativa Global School', 300, 520);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Poppins, sans-serif';
  ctx.fillText('info@kreativaglobal.sch.id', 300, 550);

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

function setupContactValidation() {
  document.querySelectorAll('[name="phone"]').forEach(input => {
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]*');
    input.setAttribute('title', 'Phone number must contain numbers only.');

    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '');
    });
  });

  document.querySelectorAll('[name="email"]').forEach(input => {
    input.setAttribute('autocomplete', 'email');
  });
}

function initPage() {
  fillTemplateContent();
  document.getElementById('parent-type').addEventListener('change', handleParentTypeChange);
  setupAttendanceLunchSync();
  setupWaitingListStatus();
  setupUploadZones();
  setupContactValidation();
  hidePaymentSections();
  loadConfig();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

window.generateSeatNumber = generateSeatNumber;
window.showConfirmation = showConfirmation;
window.downloadTicket = downloadTicket;

document.addEventListener('DOMContentLoaded', initPage);
