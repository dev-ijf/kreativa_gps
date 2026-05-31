const templateContent = {
  'hero-eyebrow': 'Kreativa Global School Mempersembahkan',
  'hero-title': 'Global Parenting Summit 2026',
  'hero-subtitle': '',
  'event-date': 'Sabtu, 20 Juni 2026',
  'event-time': '08:00 - 16:00 WIB',
  'event-venue': 'Exibition Hall (Lantai 3), Summarecon Mall Bandung',
  'hero-cta': 'Daftar Sekarang',
  'about-title': 'APA ITU GLOBAL PARENTING SUMMIT?',
  'about-desc-1': 'Global Parenting Summit adalah forum edukasi tahunan yang diinisiasi oleh Kreativa Global School untuk mendukung orang tua dalam menghadapi tantangan mendampingi anak di dunia yang terus berubah dengan cepat.',
  'about-desc-2': 'Kami percaya bahwa peran orang tua sangat penting dalam perjalanan pendidikan anak. Melalui summit ini, para pendidik, pakar, dan orang tua berkumpul untuk mengeksplorasi cara keluarga dapat mempersiapkan anak agar tumbuh dengan percaya diri dan memiliki tujuan.',
  'about-desc-3': 'Melalui diskusi yang bermakna dan berbagi wawasan, Global Parenting Summit mendorong orang tua untuk berperan aktif dalam mendampingi perkembangan anak sekaligus memperkuat kolaborasi antara keluarga dan sekolah.',
  'reg-title': 'Pendaftaran',
  'reg-subtitle': 'Pilih kategori untuk melihat alur pendaftaran yang sesuai.',
  'verification-note': '',
  'reg-type-label': 'Kategori Orang Tua',
  'payment-title': 'Konfirmasi Pembayaran',
  'payment-title-b': 'Konfirmasi Pembayaran',
  'qris-label': 'Pindai QRIS untuk menyelesaikan pembayaran Anda',
  'qris-label-b': 'Pindai QRIS untuk menyelesaikan pembayaran Anda',
  'qris-name': 'Kreativa Global School',
  'qris-name-b': 'Kreativa Global School',
  'upload-label': 'Unggah bukti pembayaran (wajib)',
  'upload-label-b': 'Unggah bukti pembayaran (wajib)',
  'submit-btn': 'Lanjutkan',
  'submit-btn-b': 'Lanjutkan',
  'wa-btn': 'WhatsApp',
  'confirm-title': 'Pendaftaran Berhasil',
  'confirm-msg': 'Detail pendaftaran dan tiket Anda sudah siap.',
  'footer-name': 'Global Parenting Summit 2026',
  'footer-tagline': 'Diselenggarakan oleh Kreativa Global School',
  'footer-contact': 'info@kreativaglobal.sch.id'
};

const imageSources = {
  'hero-img': 'assets/bg-1.jpeg',
  'about-img': 'assets/desc2.jpeg'
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

function normalizeVisibleUrl() {
  if (window.location.pathname.endsWith('/index.html')) {
    window.history.replaceState({}, '', window.location.pathname.replace(/\/index\.html$/, '/') + window.location.search + window.location.hash);
  }
}

function normalizeInputValue(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

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
        ? 'Orang tua mengikuti sesi edukasi'
        : 'Guru dan keluarga dalam sesi belajar di sekolah';
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
  ['review-section', 'already-registered-section', 'interest-section', 'confirmation'].forEach(id => {
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
    setSubmitLabel(form, 'Lanjutkan');
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
  setSubmitLabel(form, 'Kirim Bukti Pembayaran');

  const paymentSection = form.querySelector('#payment-a, #payment-b');
  paymentSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetVerificationState() {
  document.querySelectorAll('form').forEach(form => {
    delete form.dataset.registrationId;
    delete form.dataset.draftRegistrationId;
    delete form.dataset.verificationStatus;
    hidePaymentSections(form);
  });
}

function clearPaymentProofSelection(form) {
  form.querySelectorAll('[name="paymentProof"]').forEach(input => {
    input.value = '';
    const preview = input.closest('.upload-zone')?.querySelector('.upload-preview');
    if (preview) {
      preview.classList.add('hidden');
      preview.innerHTML = '';
    }
  });
}

function resetFormVerificationState(form) {
  if (form.dataset.registrationId) {
    form.dataset.draftRegistrationId = form.dataset.registrationId;
  }

  delete form.dataset.registrationId;
  delete form.dataset.verificationStatus;
  currentRegistration = null;
  generatedSeatNumber = '';
  hideResultSections();
  hidePaymentSections(form);
  clearPaymentProofSelection(form);
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
    quantityLabel.textContent = attendeeCount ? `${attendeeCount} tiket` : '-';
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

function setupIdentityChangeReset() {
  document.querySelectorAll('form').forEach(form => {
    form.querySelectorAll('[name="studentName"], [name="studentLevel"], [name="waitingListStatus"]').forEach(input => {
      input.addEventListener('input', () => resetFormVerificationState(form));
      input.addEventListener('change', () => resetFormVerificationState(form));
    });
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
      <img src="${imageUrl}" alt="Bukti pembayaran yang dipilih" class="upload-preview-image">
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
    reader.onerror = () => reject(new Error('Gagal membaca file bukti pembayaran.'));
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
    throw new Error('Gambar bukti pembayaran terlalu besar. Mohon unggah screenshot atau foto yang lebih kecil.');
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
    throw new Error('PDF bukti pembayaran terlalu besar. Ukuran maksimum PDF adalah 2 MB.');
  }

  const dataUrl = await readFileAsDataUrl(file);
  if (dataUrl.length > maxPaymentProofDataUrlLength) {
    throw new Error('File bukti pembayaran terlalu besar. Mohon unggah file yang lebih kecil.');
  }

  return {
    filename: file.name,
    mimeType: file.type,
    dataUrl
  };
}

function getFriendlyErrorMessage(error) {
  const message = String(error?.message || error || 'Pendaftaran gagal.');
  const translations = {
    'Parent category is required.': 'Kategori orang tua wajib dipilih.',
    'Student level, student name, parent name, phone, and email are required.': 'Jenjang siswa, nama siswa, nama orang tua, nomor telepon, dan email wajib diisi.',
    'Phone number must contain numbers only.': 'Nomor telepon hanya boleh berisi angka.',
    'Email address is not valid.': 'Alamat email tidak valid.',
    'Number of attendees must be 1 or 2.': 'Jumlah kehadiran harus 1 atau 2.',
    'Lunch box reservation must match number of attendees.': 'Paket Snack & Makan Siang harus sama dengan jumlah kehadiran.',
    'Payment proof is required.': 'Bukti pembayaran wajib diunggah.',
    'Payment proof upload is only available for verified registrations.': 'Unggah bukti pembayaran hanya tersedia untuk pendaftaran yang sudah terverifikasi.',
    'Payment is only available for verified registrations.': 'Pembayaran hanya tersedia untuk pendaftaran yang sudah terverifikasi.',
    'Registration not found.': 'Data pendaftaran tidak ditemukan.',
    'Ticket quota is full.': 'Kuota tiket sudah penuh.',
    'Registration failed.': 'Pendaftaran gagal.'
  };

  if (message.includes('expected pattern')) {
    return 'Unggahan gagal karena file bukti pembayaran terlalu besar untuk browser ini. Mohon unggah gambar yang lebih kecil.';
  }

  if (translations[message]) {
    return translations[message];
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

  alert('Bukti pembayaran wajib diunggah. Mohon unggah JPG, PNG, atau PDF.');
  return false;
}

function validateContactFields(form) {
  const phoneInput = form.querySelector('[name="phone"]');
  const emailInput = form.querySelector('[name="email"]');
  const phone = String(phoneInput?.value || '').trim();
  const email = String(emailInput?.value || '').trim();

  if (!/^\d+$/.test(phone)) {
    phoneInput?.focus();
    alert('Nomor telepon hanya boleh berisi angka.');
    return false;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailInput?.focus();
    alert('Mohon masukkan alamat email yang valid.');
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
    registrationId: form.dataset.registrationId || form.dataset.draftRegistrationId || '',
    category: getSelectedCategory(),
    waitingListStatus: normalizeInputValue(formData.get('waitingListStatus')),
    studentLevel: normalizeInputValue(formData.get('studentLevel')),
    studentName: normalizeInputValue(formData.get('studentName')),
    parentName: normalizeInputValue(formData.get('parentName')),
    phone: normalizeInputValue(formData.get('phone')),
    email: normalizeInputValue(formData.get('email')),
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
    throw new Error(result.error || result.message || 'Pendaftaran gagal.');
  }

  return result;
}

async function verifyRegistration(form) {
  return postRegistrationPayload(await buildRegistrationPayload(form));
}

async function submitPaymentProof(form) {
  return postRegistrationPayload(await buildRegistrationPayload(form, { includePaymentProof: true }));
}

function isPaymentLinkContinuable(registration) {
  const paymentStatus = String(registration?.paymentStatus || '').trim();
  const hasPaymentProof = Boolean(registration?.paymentProofFilename);
  const lockedStatuses = new Set(['verified', 'paid', 'confirmed', 'waiting_confirmation']);

  return registration?.verificationStatus === 'verified'
    && !lockedStatuses.has(paymentStatus)
    && !(paymentStatus === 'pending' && hasPaymentProof);
}

function fillRegistrationForm(form, registration) {
  const values = {
    waitingListStatus: registration.waitingListStatus || 'paid_commitment_fee',
    studentLevel: registration.studentLevel,
    studentName: registration.studentName,
    parentName: registration.parentName,
    phone: registration.phone,
    email: registration.email,
    attendeeCount: registration.attendeeCount || 1,
    lunchBoxCount: registration.lunchBoxCount || registration.attendeeCount || 1
  };

  Object.entries(values).forEach(([name, value]) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (input) {
      input.value = value || '';
    }
  });

  form.dataset.registrationId = registration.id || registration.registrationId || '';
  form.dataset.verificationStatus = 'verified';
  clearPaymentProofSelection(form);
  updatePriceSummary(form);
}

async function loadPaymentContinuationLink() {
  const params = new URLSearchParams(window.location.search);
  const registrationId = normalizeInputValue(params.get('registration') || params.get('pay') || '');

  if (!registrationId) {
    return;
  }

  try {
    const response = await fetch(`/api/registrations/${encodeURIComponent(registrationId)}`);
    const result = await response.json();

    if (!response.ok || !result.registration) {
      throw new Error(result.error || 'Data pendaftaran tidak ditemukan.');
    }

    const registration = result.registration;

    if (!isPaymentLinkContinuable(registration)) {
      if (registration.verificationStatus === 'need_review') {
        showReviewSection(registration.id);
        return;
      }

      if (registration.verificationStatus === 'already_registered'
        || registration.paymentProofFilename
        || ['verified', 'paid', 'confirmed', 'waiting_confirmation'].includes(String(registration.paymentStatus || '').trim())) {
        showAlreadyRegisteredSection(registration.id);
        return;
      }

      showInterestSection(registration.id);
      return;
    }

    const parentType = document.getElementById('parent-type');
    parentType.value = registration.parentCategory;
    parentType.dispatchEvent(new Event('change', { bubbles: true }));

    const form = registration.parentCategory === 'waitlist'
      ? document.getElementById('flow-b')
      : document.getElementById('flow-a');

    if (!form) {
      throw new Error('Form pembayaran tidak ditemukan.');
    }

    fillRegistrationForm(form, registration);
    showPaymentSection(form, registration);
  } catch (error) {
    alert(getFriendlyErrorMessage(error));
  }
}

function showReviewSection() {
  hideResultSections();
  document.getElementById('review-section')?.classList.remove('hidden');
  document.getElementById('review-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showAlreadyRegisteredSection() {
  hideResultSections();
  document.getElementById('already-registered-section')?.classList.remove('hidden');
  document.getElementById('already-registered-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setInterestSectionCopy() {
  const section = document.getElementById('interest-section');
  if (!section) return;

  const title = section.querySelector('[data-interest-title]');
  const primary = section.querySelector('[data-interest-primary]');
  const secondary = section.querySelector('[data-interest-secondary]');
  const exclusive = section.querySelector('[data-interest-exclusive]');
  const list = section.querySelector('[data-interest-list]');
  const parentType = getSelectedCategory();
  const isExisting = parentType === 'existing';
  const isWaitlist = parentType === 'waitlist';

  const hideExclusiveList = () => {
    exclusive?.classList.add('hidden');
    list?.classList.add('hidden');
  };

  if (isWaitlist) {
    if (title) title.textContent = 'Mohon Maaf';
    if (primary) primary.textContent = 'Mohon maaf, nama anak Bapak/Ibu belum terdaftar sebagai siswa Waiting List Kreativa Global School Tahun Ajaran 2027/2028.';
    if (secondary) secondary.textContent = 'Silakan menghubungi tim Admin kami melalui WhatsApp untuk konfirmasi data atau mendapatkan bantuan lebih lanjut.';
    hideExclusiveList();
    return;
  }

  if (isExisting) {
    if (title) title.textContent = 'Mohon Maaf';
    if (primary) primary.textContent = 'Mohon maaf, nama anak Bapak/Ibu belum terdaftar sebagai siswa Kreativa Global School untuk Tahun Ajaran 2026/2027.';
    if (secondary) secondary.textContent = 'Apabila anak Bapak/Ibu sudah terdaftar, kemungkinan terdapat perbedaan atau kesalahan dalam penulisan nama. Silakan menghubungi tim Admin kami melalui WhatsApp untuk konfirmasi data atau mendapatkan bantuan lebih lanjut.';
    hideExclusiveList();
    return;
  }

  if (title) title.textContent = 'Terima Kasih atas Ketertarikan Anda';
  if (primary) primary.textContent = 'Saat ini, Global Parenting Summit 2026 diprioritaskan untuk:';
  if (secondary) secondary.textContent = 'Jika anak Anda belum terdaftar di Kreativa Global School, silakan hubungi tim admin kami melalui WhatsApp untuk mendapatkan informasi lebih lanjut mengenai kemungkinan undangan khusus, selama kuota masih tersedia.';
  if (exclusive) exclusive.textContent = 'Jika anak Anda sudah terdaftar namun nama siswa tidak ditemukan, silakan hubungi admin kami melalui WhatsApp agar data dapat kami periksa kembali.';
  exclusive?.classList.remove('hidden');
  list?.classList.remove('hidden');
}

function showInterestSection() {
  hideResultSections();
  setInterestSectionCopy();
  document.getElementById('interest-section')?.classList.remove('hidden');
  document.getElementById('interest-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showTicketConfirmation(registration) {
  currentRegistration = registration;

  document.getElementById('reg-id').textContent = registration.registrationId;
  document.getElementById('seat-display').textContent = registration.seatNumber || generatedSeatNumber || '-';
  document.getElementById('attendee-display').textContent = `${registration.attendeeCount} peserta`;
  document.getElementById('total-display').textContent = formatCurrency(registration.totalAmount);
  document.getElementById('confirmation').classList.remove('hidden');
  loadConfig();
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

function finishRegistration() {
  document.querySelectorAll('form').forEach(form => {
    form.reset();
    delete form.dataset.registrationId;
    delete form.dataset.draftRegistrationId;
    delete form.dataset.verificationStatus;
    clearPaymentProofSelection(form);
    updatePriceSummary(form);
  });

  const parentType = document.getElementById('parent-type');
  if (parentType) {
    parentType.value = '';
  }

  currentRegistration = null;
  generatedSeatNumber = '';
  resetFlows();
  updateWaitingListStatusFlow();
  document.getElementById('confirmation')?.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
    alert('Paket Snack & Makan Siang harus sama dengan jumlah kehadiran.');
    return;
  }

  if (!validateContactFields(form)) {
    return;
  }

  if (isPaymentStep && !validatePaymentProofSelection(form)) {
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = isPaymentStep ? 'Menyimpan...' : 'Memeriksa...';

  try {
    if (isPaymentStep) {
      const result = await submitPaymentProof(form);
      if (result.status === 'already_registered') {
        showAlreadyRegisteredSection(result.registration_id);
        return;
      }
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

    if (result.status === 'already_registered') {
      showAlreadyRegisteredSection(result.registration_id);
      return;
    }

    showInterestSection(result.registration_id);
  } catch (error) {
    alert(getFriendlyErrorMessage(error));
  } finally {
    submitButton.disabled = false;
    if (form.dataset.verificationStatus === 'verified' && form.dataset.registrationId) {
      submitButton.textContent = 'Kirim Bukti Pembayaran';
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
  drawTicketCanvas(ctx, {
    registrationId: document.getElementById('reg-id').textContent,
    studentName: currentRegistration?.studentName,
    parentName: currentRegistration?.parentName,
    seatNumber: document.getElementById('seat-display').textContent,
    attendeeCount: currentRegistration?.attendeeCount
  });

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = document.getElementById('reg-id').textContent + '_tiket.png';
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
    input.setAttribute('title', 'Nomor telepon hanya boleh berisi angka.');

    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '');
    });
  });

  document.querySelectorAll('[name="email"]').forEach(input => {
    input.setAttribute('autocomplete', 'email');
  });
}

function initPage() {
  normalizeVisibleUrl();
  fillTemplateContent();
  document.getElementById('parent-type').addEventListener('change', handleParentTypeChange);
  setupIdentityChangeReset();
  setupAttendanceLunchSync();
  setupWaitingListStatus();
  setupUploadZones();
  setupContactValidation();
  hidePaymentSections();
  loadConfig().then(loadPaymentContinuationLink);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

window.generateSeatNumber = generateSeatNumber;
window.showConfirmation = showConfirmation;
window.downloadTicket = downloadTicket;
window.finishRegistration = finishRegistration;

document.addEventListener('DOMContentLoaded', initPage);

