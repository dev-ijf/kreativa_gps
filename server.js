import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'registrations.json');
const paymentProofDir = path.join(__dirname, 'uploads', 'payment-proofs');

loadEnvFile();

const port = Number(process.env.PORT || 3000);
const ticketPrice = normalizeCurrency(process.env.TICKET_PRICE || 0);
const ticketQuota = normalizeQuota(process.env.TICKET_QUOTA || 800);
const usePostgres = Boolean(
  process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.DATABASE_URL_UNPOOLED
    || process.env.PGHOST
    || process.env.PGDATABASE
);

const defaultEligibleStudents = [
  { id: 1, studentName: 'Ahmad Zaki', parentStatus: 'existing_parent', grade: 'P1' },
  { id: 2, studentName: 'Aisha Nabila', parentStatus: 'existing_parent', grade: 'K2' },
  { id: 3, studentName: 'Muhammad Arkan', parentStatus: 'waiting_list_parent', grade: 'P1' }
];
let verificationSchemaReady = false;
const activeDuplicatePaymentStatuses = new Set(['verified', 'paid', 'confirmed', 'waiting_confirmation']);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml'
};

const allowedUpdates = new Set([
  'paymentStatus',
  'status',
  'notes',
  'checkedInAt',
  'studentName',
  'parentName',
  'phone',
  'email',
  'attendeeCount',
  'lunchBoxCount'
]);
const eligibleParentStatuses = new Set(['existing_parent', 'waiting_list_parent']);

const paymentStatuses = new Set(['pending', 'verified', 'rejected', 'paid', 'confirmed', 'waiting_confirmation', 'failed', 'canceled', 'cancelled', 'expired']);
const registrationStatuses = new Set(['confirmed', 'cancelled', 'attended']);

const columnMap = {
  paymentStatus: 'payment_status',
  status: 'status',
  notes: 'notes',
  checkedInAt: 'checked_in_at',
  studentName: 'student_name',
  parentName: 'parent_name',
  phone: 'phone',
  email: 'email',
  attendeeCount: 'attendee_count',
  lunchBoxCount: 'lunch_box_count'
};

function normalizeCurrency(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.DATABASE_URL_UNPOOLED
    || '';
}

function shouldUseSsl(connectionString = '') {
  const host = process.env.PGHOST || process.env.POSTGRES_HOST || '';
  return process.env.PGSSLMODE === 'require'
    || connectionString.includes('sslmode=require')
    || connectionString.includes('neon.tech')
    || host.includes('neon.tech');
}

function createPoolConfig() {
  const connectionString = getDatabaseUrl();

  if (connectionString) {
    return shouldUseSsl(connectionString)
      ? { connectionString, ssl: { rejectUnauthorized: false } }
      : { connectionString };
  }

  const config = {
    host: process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || 5432),
    database: process.env.PGDATABASE || process.env.POSTGRES_DATABASE,
    user: process.env.PGUSER || process.env.POSTGRES_USER,
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD
  };

  if (shouldUseSsl()) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

async function ensureVerificationSchema(pool) {
  if (verificationSchemaReady) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS eligible_students (
      id SERIAL PRIMARY KEY,
      student_name VARCHAR(255) NOT NULL,
      parent_status VARCHAR(100) NOT NULL CHECK (
        parent_status IN ('existing_parent', 'waiting_list_parent')
      ),
      grade VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS parent_status VARCHAR(100);

    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) DEFAULT 'not_verified';

    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS matched_student_id INTEGER;

    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS duplicate_reference_id INTEGER;

    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS verification_notes TEXT;

    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS payment_proof_filename TEXT;

    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS payment_proof_mime_type TEXT;

    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS payment_proof_data TEXT;

    ALTER TABLE registrations
    ALTER COLUMN seat_number DROP NOT NULL;

    ALTER TABLE registrations
    DROP CONSTRAINT IF EXISTS registrations_seat_number_key;

    ALTER TABLE registrations
    DROP CONSTRAINT IF EXISTS registrations_verification_status_check;

    ALTER TABLE registrations
    DROP CONSTRAINT IF EXISTS registrations_payment_status_check;

    ALTER TABLE registrations
    ADD CONSTRAINT registrations_verification_status_check
    CHECK (verification_status IN ('verified', 'need_review', 'not_verified', 'already_registered'));

    ALTER TABLE registrations
    ADD CONSTRAINT registrations_payment_status_check
    CHECK (payment_status IN ('pending', 'verified', 'rejected', 'paid', 'confirmed', 'waiting_confirmation', 'failed', 'canceled', 'cancelled', 'expired'));

    CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_seat_number_unique
    ON registrations(seat_number)
    WHERE seat_number IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_eligible_students_parent_status
    ON eligible_students(parent_status);

    CREATE INDEX IF NOT EXISTS idx_registrations_verification_status
    ON registrations(verification_status);
  `);

  verificationSchemaReady = true;
}

function normalizeQuota(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 800;
}

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, 'utf8');

  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      return;
    }

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    await writeFile(dataFile, JSON.stringify({ registrations: [] }, null, 2));
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await readFile(dataFile, 'utf8');
  return JSON.parse(raw || '{"registrations":[]}');
}

async function writeStore(store) {
  await ensureDataFile();
  await writeFile(dataFile, JSON.stringify(store, null, 2));
}

function getJsonEligibleStudents(store) {
  const rows = Array.isArray(store.eligibleStudents) ? store.eligibleStudents : defaultEligibleStudents;

  return rows.map(row => ({
    id: row.id,
    studentName: row.studentName || row.student_name || '',
    parentStatus: row.parentStatus || row.parent_status || '',
    grade: row.grade || ''
  }));
}

function normalizeJsonEligibleStudents(store) {
  return getJsonEligibleStudents(store).map(row => ({
    id: row.id,
    studentName: row.studentName,
    parentStatus: row.parentStatus,
    grade: row.grade
  }));
}

function createJsonEligibleStudentId(rows) {
  const numericIds = rows
    .map(row => Number(row.id))
    .filter(Number.isFinite);
  return numericIds.length ? Math.max(...numericIds) + 1 : 1;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendNoContent(response) {
  response.writeHead(204, { 'Cache-Control': 'no-store' });
  response.end();
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000_000) {
      throw new Error('Request body is too large');
    }
  }

  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeName(name) {
  if (!name) {
    return '';
  }

  return name
    .toString()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function calculateNameSimilarity(nameA, nameB) {
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const wordsA = new Set(a.split(' '));
  const wordsB = new Set(b.split(' '));
  let matchCount = 0;

  wordsA.forEach(word => {
    if (wordsB.has(word)) {
      matchCount += 1;
    }
  });

  return matchCount / Math.max(wordsA.size, wordsB.size);
}

function normalizeCount(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeFilename(filename) {
  return normalizeText(filename)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

function getUploadExtension(filename, mimeType) {
  const extension = path.extname(filename).toLowerCase();
  const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

  if (allowedExtensions.has(extension)) {
    return extension;
  }

  const extensionByMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf'
  };

  return extensionByMime[mimeType] || '';
}

async function storePaymentProof(payload, registrationId) {
  const originalFilename = normalizeText(payload.paymentProofFilename);
  const mimeType = normalizeText(payload.paymentProofMimeType);
  const rawData = normalizeText(payload.paymentProofData);

  if (!originalFilename || !rawData) {
    return originalFilename;
  }

  const extension = getUploadExtension(originalFilename, mimeType);
  if (!extension) {
    throw new Error('Payment proof must be JPG, PNG, WEBP, or PDF.');
  }

  const base64 = rawData.includes(',')
    ? rawData.split(',').pop()
    : rawData;
  const fileBuffer = Buffer.from(base64, 'base64');

  if (!fileBuffer.length || fileBuffer.length > 5_000_000) {
    throw new Error('Payment proof file is too large. Maximum size is 5 MB.');
  }

  await mkdir(paymentProofDir, { recursive: true });

  const safeOriginal = sanitizeFilename(originalFilename.replace(/\.[^.]+$/, 'proof'));
  const storedFilename = `${registrationId}-${Date.now()}-${safeOriginal}${extension}`;
  await writeFile(path.join(paymentProofDir, storedFilename), fileBuffer);

  return storedFilename;
}

function parsePaymentProofForDatabase(payload, registrationId) {
  const originalFilename = normalizeText(payload.paymentProofFilename);
  const mimeType = normalizeText(payload.paymentProofMimeType);
  const rawData = normalizeText(payload.paymentProofData);

  if (!originalFilename || !rawData) {
    return {
      filename: originalFilename,
      mimeType: '',
      base64Data: ''
    };
  }

  const extension = getUploadExtension(originalFilename, mimeType);
  if (!extension) {
    throw new Error('Payment proof must be JPG, PNG, WEBP, or PDF.');
  }

  const base64Data = rawData.includes(',')
    ? rawData.split(',').pop()
    : rawData;
  const fileBuffer = Buffer.from(base64Data, 'base64');

  if (!fileBuffer.length || fileBuffer.length > 5_000_000) {
    throw new Error('Payment proof file is too large. Maximum size is 5 MB.');
  }

  const safeOriginal = sanitizeFilename(originalFilename.replace(/\.[^.]+$/, 'proof'));

  return {
    filename: `${registrationId}-${Date.now()}-${safeOriginal}${extension}`,
    mimeType: contentTypes[extension] || mimeType || 'application/octet-stream',
    base64Data
  };
}

async function deleteStoredPaymentProof(filename) {
  const safeFilename = path.basename(normalizeText(filename));

  if (!safeFilename) {
    return;
  }

  try {
    await unlink(path.join(paymentProofDir, safeFilename));
  } catch {
    // Ignore missing files so deleting old records still succeeds.
  }
}

function normalizeRegistrationCounts(payload) {
  return {
    attendeeCount: normalizeCount(payload.attendeeCount, 1),
    lunchBoxCount: normalizeCount(payload.lunchBoxCount, 0)
  };
}

function validateRegistration(payload) {
  const category = normalizeText(payload.category || payload.parentCategory);
  const studentLevel = normalizeText(payload.studentLevel);
  const studentName = normalizeText(payload.studentName);
  const parentName = normalizeText(payload.parentName);
  const phone = normalizeText(payload.phone);
  const email = normalizeText(payload.email);
  const { attendeeCount, lunchBoxCount } = normalizeRegistrationCounts(payload);

  if (!['existing', 'waitlist'].includes(category)) {
    return 'Parent category is required.';
  }

  if (!studentLevel || !studentName || !parentName || !phone || !email) {
    return 'Student level, student name, parent name, phone, and email are required.';
  }

  if (!/^\d+$/.test(phone)) {
    return 'Phone number must contain numbers only.';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Email address is not valid.';
  }

  if (attendeeCount < 1 || attendeeCount > 2) {
    return 'Number of attendees must be 1 or 2.';
  }

  if (lunchBoxCount !== attendeeCount) {
    return 'Lunch box reservation must match number of attendees.';
  }

  return '';
}

function validatePaymentPayload(payload) {
  const registrationId = normalizeText(payload.registrationId || payload.registration_id || payload.id);
  const paymentProofFilename = normalizeText(payload.paymentProofFilename);
  const paymentProofData = normalizeText(payload.paymentProofData);

  if (!registrationId) {
    return 'Registration ID is required.';
  }

  if (!paymentProofFilename || !paymentProofData) {
    return 'Payment proof is required.';
  }

  return '';
}

function getParentStatus(category) {
  const normalizedCategory = normalizeText(category);

  if (normalizedCategory === 'existing') {
    return 'existing_parent';
  }

  if (normalizedCategory === 'waitlist') {
    return 'waiting_list_parent';
  }

  return 'not_registered';
}

function getVerificationMessage(status) {
  if (status === 'verified') {
    return 'Student name verified.';
  }

  if (status === 'already_registered') {
    return 'This student has already been registered.';
  }

  if (status === 'need_review') {
    return 'Student name needs manual review.';
  }

  return 'Student name could not be verified.';
}

function getVerificationNextStep(status) {
  if (status === 'verified') {
    return 'show_payment';
  }

  if (status === 'need_review') {
    return 'show_review';
  }

  if (status === 'already_registered') {
    return 'show_already_registered';
  }

  return 'show_interest_message';
}

function createRegistrationId(existingRows) {
  let next = existingRows.length + 1;
  let id = '';

  do {
    id = `GPS-2026-${String(next).padStart(4, '0')}`;
    next += 1;
  } while (existingRows.some(row => row.registrationId === id));

  return id;
}

function getUsedSeatNumbers(existingRows) {
  return new Set(existingRows.flatMap(row => String(row.seatNumber || '')
    .split(',')
    .map(seat => seat.trim())
    .map(seat => seat.replace(/\D/g, ''))
    .filter(Boolean)));
}

function createSeatNumbers(count, existingRows) {
  const usedSeats = getUsedSeatNumbers(existingRows);
  let next = 1;
  const seats = [];

  while (seats.length < count) {
    if (next > ticketQuota) {
      throw new Error('Ticket quota is full.');
    }

    const seat = String(next);
    next += 1;

    if (!usedSeats.has(seat)) {
      seats.push(seat);
      usedSeats.add(seat);
    }
  }

  return seats.join(', ');
}

function getUsedSeatCount(existingRows) {
  return getUsedSeatNumbers(existingRows).size;
}

function toRegistration(payload, existingRows) {
  const category = normalizeText(payload.category || payload.parentCategory);
  const now = new Date().toISOString();
  const { attendeeCount, lunchBoxCount } = normalizeRegistrationCounts(payload);
  const resolvedTicketPrice = ticketPrice;

  return {
    id: randomUUID(),
    registrationId: createRegistrationId(existingRows),
    parentCategory: category,
    waitingListStatus: normalizeText(payload.waitingListStatus),
    studentLevel: normalizeText(payload.studentLevel),
    studentName: normalizeText(payload.studentName),
    parentName: normalizeText(payload.parentName),
    phone: normalizeText(payload.phone),
    email: normalizeText(payload.email),
    attendeeCount,
    lunchBoxCount,
    seatNumber: normalizeText(payload.seatNumber) || createSeatNumbers(attendeeCount, existingRows),
    ticketPrice: resolvedTicketPrice,
    totalAmount: attendeeCount * resolvedTicketPrice,
    paymentStatus: 'pending',
    paymentProofFilename: normalizeText(payload.paymentProofFilename),
    status: 'confirmed',
    notes: '',
    checkedInAt: '',
    createdAt: now,
    updatedAt: now
  };
}

async function verifyJsonStudentName(store, { studentName, parentStatus }) {
  const normalizedInputName = normalizeName(studentName);

  if (!normalizedInputName) {
    return {
      status: 'not_verified',
      matchedStudentId: null,
      notes: 'Student name is empty.'
    };
  }

  if (parentStatus === 'not_registered') {
    return {
      status: 'not_verified',
      matchedStudentId: null,
      notes: 'User selected child has not registered yet.'
    };
  }

  const eligibleRows = getJsonEligibleStudents(store)
    .filter(row => row.parentStatus === parentStatus);

  const exactMatch = eligibleRows.find(student => normalizeName(student.studentName) === normalizedInputName);

  if (exactMatch) {
    return {
      status: 'verified',
      matchedStudentId: exactMatch.id,
      notes: 'Verified by normalized student name.'
    };
  }

  let bestMatch = null;
  let bestSimilarity = 0;

  eligibleRows.forEach(student => {
    const similarity = calculateNameSimilarity(student.studentName, normalizedInputName);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = student;
    }
  });

  if (bestSimilarity >= 0.9) {
    return {
      status: 'verified',
      matchedStudentId: bestMatch.id,
      notes: `Verified by student name. Similarity: ${bestSimilarity}`
    };
  }

  if (bestSimilarity >= 0.6) {
    return {
      status: 'need_review',
      matchedStudentId: bestMatch ? bestMatch.id : null,
      notes: `Student name needs review. Similarity: ${bestSimilarity}`
    };
  }

  return {
    status: 'not_verified',
    matchedStudentId: null,
    notes: `Student name not found. Best similarity: ${bestSimilarity}`
  };
}

function hasStoredPaymentProof(row) {
  return Boolean(
    normalizeText(row.paymentProofFilename || row.payment_proof_filename)
    || normalizeText(row.paymentProofData || row.payment_proof_data)
  );
}

function isActiveDuplicateRegistration(row) {
  const normalizedStatus = normalizeText(row.paymentStatus || row.payment_status);
  return activeDuplicatePaymentStatuses.has(normalizedStatus)
    || ((!normalizedStatus || normalizedStatus === 'pending') && hasStoredPaymentProof(row));
}

function checkJsonExistingRegistration(store, { matchedStudentId, studentName, parentStatus, excludeRegistrationId = null }) {
  const excludedId = normalizeText(excludeRegistrationId);

  if (matchedStudentId) {
    const matched = store.registrations
      .filter(row => row.matchedStudentId === matchedStudentId
        && row.id !== excludedId
        && row.registrationId !== excludedId
        && row.verificationStatus === 'verified'
        && isActiveDuplicateRegistration(row))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];

    if (matched) {
      return {
        exists: true,
        registrationId: matched.id,
        notes: `Duplicate registration found by matched_student_id. Existing registration ID: ${matched.id}`
      };
    }
  }

  const normalizedName = normalizeName(studentName);
  const normalizedParentStatus = normalizeName(parentStatus);
  const fallback = store.registrations
    .filter(row => normalizeName(row.studentName) === normalizedName
      && normalizeName(row.parentStatus) === normalizedParentStatus
      && row.id !== excludedId
      && row.registrationId !== excludedId
      && row.verificationStatus === 'verified'
      && isActiveDuplicateRegistration(row))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];

  if (fallback) {
    return {
      exists: true,
      registrationId: fallback.id,
      notes: `Duplicate registration found by student_name + parent_status. Existing registration ID: ${fallback.id}`
    };
  }

  return {
    exists: false,
    registrationId: null,
    notes: 'No existing registration found.'
  };
}

function filterRegistrations(rows, searchParams) {
  const search = normalizeText(searchParams.get('search')).toLowerCase();
  const category = normalizeText(searchParams.get('category'));
  const status = normalizeText(searchParams.get('status'));
  const paymentStatus = normalizeText(searchParams.get('paymentStatus'));

  return rows.filter(row => {
    const searchable = [
      row.registrationId,
      row.studentName,
      row.parentName,
      row.phone,
      row.email,
      row.seatNumber
    ].join(' ').toLowerCase();

    return (!search || searchable.includes(search))
      && (!category || row.parentCategory === category)
      && (!status || row.status === status)
      && (!paymentStatus || row.paymentStatus === paymentStatus);
  });
}

function toCamelRow(row) {
  return {
    id: String(row.id),
    registrationId: row.registration_id,
    parentCategory: row.parent_category,
    waitingListStatus: row.waiting_list_status || '',
    studentLevel: row.student_level,
    studentName: row.student_name,
    parentName: row.parent_name,
    phone: row.phone,
    email: row.email,
    attendeeCount: row.attendee_count,
    lunchBoxCount: row.lunch_box_count,
    seatNumber: row.seat_number,
    ticketPrice: Number(row.ticket_price || 0),
    totalAmount: Number(row.total_amount || 0),
    paymentStatus: row.payment_status,
    paymentProofFilename: row.payment_proof_filename || '',
    parentStatus: row.parent_status || '',
    verificationStatus: row.verification_status || 'not_verified',
    matchedStudentId: row.matched_student_id || null,
    duplicateReferenceId: row.duplicate_reference_id || null,
    verificationNotes: row.verification_notes || '',
    status: row.status,
    notes: row.notes || '',
    checkedInAt: row.checked_in_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toCamelEligibleStudent(row) {
  return {
    id: String(row.id),
    studentName: row.student_name,
    parentStatus: row.parent_status,
    grade: row.grade || '',
    createdAt: row.created_at
  };
}

function validateEligibleStudentPayload(payload, partial = false) {
  const studentName = normalizeText(payload.studentName || payload.student_name);
  const parentStatus = normalizeText(payload.parentStatus || payload.parent_status);
  const grade = normalizeText(payload.grade);
  const hasStudentName = Object.prototype.hasOwnProperty.call(payload, 'studentName')
    || Object.prototype.hasOwnProperty.call(payload, 'student_name');
  const hasParentStatus = Object.prototype.hasOwnProperty.call(payload, 'parentStatus')
    || Object.prototype.hasOwnProperty.call(payload, 'parent_status');

  if ((!partial || hasStudentName) && !studentName) {
    return 'Student name is required.';
  }

  if ((!partial || hasParentStatus) && !parentStatus) {
    return 'Parent status is required.';
  }

  if (studentName && studentName.length > 255) {
    return 'Student name is too long.';
  }

  if (parentStatus && !eligibleParentStatuses.has(parentStatus)) {
    return 'Parent status is not valid.';
  }

  if (grade.length > 100) {
    return 'Grade is too long.';
  }

  return '';
}

async function createJsonRepository() {
  return {
    async health() {
      await ensureDataFile();
      const store = await readStore();
      return {
        ok: true,
        storage: 'json',
        ticketPrice,
        ticketQuota,
        usedSeats: getUsedSeatCount(store.registrations),
        remainingSeats: Math.max(ticketQuota - getUsedSeatCount(store.registrations), 0)
      };
    },

    async config() {
      const store = await readStore();
      const usedSeats = getUsedSeatCount(store.registrations);
      return {
        ticketPrice,
        ticketQuota,
        usedSeats,
        remainingSeats: Math.max(ticketQuota - usedSeats, 0)
      };
    },

    async list(searchParams) {
      const store = await readStore();
      return filterRegistrations(store.registrations, searchParams)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async listEligibleStudents(searchParams) {
      const store = await readStore();
      const search = normalizeText(searchParams.get('search')).toLowerCase();
      const parentStatus = normalizeText(searchParams.get('parentStatus'));

      return getJsonEligibleStudents(store)
        .filter(row => {
          const searchable = [row.studentName, row.grade].join(' ').toLowerCase();
          return (!search || searchable.includes(search))
            && (!parentStatus || row.parentStatus === parentStatus);
        })
        .sort((a, b) => a.studentName.localeCompare(b.studentName));
    },

    async createEligibleStudent(payload) {
      const validationError = validateEligibleStudentPayload(payload);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }

      const store = await readStore();
      const rows = normalizeJsonEligibleStudents(store);
      const student = {
        id: createJsonEligibleStudentId(rows),
        studentName: normalizeText(payload.studentName || payload.student_name),
        parentStatus: normalizeText(payload.parentStatus || payload.parent_status),
        grade: normalizeText(payload.grade),
        createdAt: new Date().toISOString()
      };

      store.eligibleStudents = [...rows, student];
      await writeStore(store);
      return student;
    },

    async updateEligibleStudent(id, payload) {
      const validationError = validateEligibleStudentPayload(payload, true);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }

      const store = await readStore();
      const rows = normalizeJsonEligibleStudents(store);
      const index = rows.findIndex(row => String(row.id) === String(id));

      if (index === -1) {
        return null;
      }

      const current = rows[index];
      const next = {
        ...current,
        studentName: Object.prototype.hasOwnProperty.call(payload, 'studentName') || Object.prototype.hasOwnProperty.call(payload, 'student_name')
          ? normalizeText(payload.studentName || payload.student_name)
          : current.studentName,
        parentStatus: Object.prototype.hasOwnProperty.call(payload, 'parentStatus') || Object.prototype.hasOwnProperty.call(payload, 'parent_status')
          ? normalizeText(payload.parentStatus || payload.parent_status)
          : current.parentStatus,
        grade: Object.prototype.hasOwnProperty.call(payload, 'grade')
          ? normalizeText(payload.grade)
          : current.grade
      };

      rows[index] = next;
      store.eligibleStudents = rows;
      await writeStore(store);
      return next;
    },

    async deleteEligibleStudent(id) {
      const store = await readStore();
      const rows = normalizeJsonEligibleStudents(store);
      const nextRows = rows.filter(row => String(row.id) !== String(id));

      if (nextRows.length === rows.length) {
        return false;
      }

      store.eligibleStudents = nextRows;
      await writeStore(store);
      return true;
    },

    async create(payload) {
      const store = await readStore();
      const category = normalizeText(payload.category || payload.parentCategory);
      const parentStatus = getParentStatus(category);
      const { attendeeCount } = normalizeRegistrationCounts(payload);
      const { lunchBoxCount } = normalizeRegistrationCounts(payload);
      const draftRegistrationId = normalizeText(payload.registrationId || payload.registration_id || payload.id);
      const draftIndex = draftRegistrationId
        ? store.registrations.findIndex(row => row.id === draftRegistrationId || row.registrationId === draftRegistrationId)
        : -1;
      const draftRegistration = draftIndex >= 0 ? store.registrations[draftIndex] : null;
      const reusableDraft = draftRegistration
        && !normalizeText(draftRegistration.paymentProofFilename)
        && (!normalizeText(draftRegistration.paymentStatus) || normalizeText(draftRegistration.paymentStatus) === 'pending');
      const verification = await verifyJsonStudentName(store, {
        studentName: payload.studentName,
        parentStatus
      });
      let verificationStatus = verification.status;
      let duplicateReferenceId = null;
      let verificationNotes = verification.notes;

      if (verification.status === 'verified') {
        const duplicateCheck = checkJsonExistingRegistration(store, {
          matchedStudentId: verification.matchedStudentId,
          studentName: payload.studentName,
          parentStatus,
          excludeRegistrationId: reusableDraft ? draftRegistration.id : null
        });

        if (duplicateCheck.exists) {
          verificationStatus = 'already_registered';
          duplicateReferenceId = duplicateCheck.registrationId;
          verificationNotes = duplicateCheck.notes;
        }
      }

      if (verificationStatus === 'verified'
        && getUsedSeatCount(store.registrations) + attendeeCount > ticketQuota) {
        const error = new Error('Ticket quota is full.');
        error.statusCode = 400;
        throw error;
      }

      const now = new Date().toISOString();
      const registration = {
        ...(reusableDraft ? draftRegistration : {}),
        id: reusableDraft ? draftRegistration.id : randomUUID(),
        registrationId: reusableDraft ? draftRegistration.registrationId : createRegistrationId(store.registrations),
        parentCategory: category,
        parentStatus,
        waitingListStatus: normalizeText(payload.waitingListStatus),
        studentLevel: normalizeText(payload.studentLevel),
        studentName: normalizeText(payload.studentName),
        parentName: normalizeText(payload.parentName),
        phone: normalizeText(payload.phone),
        email: normalizeText(payload.email),
        attendeeCount,
        lunchBoxCount,
        seatNumber: '',
        ticketPrice,
        totalAmount: attendeeCount * ticketPrice,
        paymentStatus: 'pending',
        paymentProofFilename: '',
        verificationStatus,
        matchedStudentId: verification.matchedStudentId,
        duplicateReferenceId,
        verificationNotes,
        status: 'confirmed',
        notes: '',
        checkedInAt: '',
        createdAt: reusableDraft ? draftRegistration.createdAt : now,
        updatedAt: now
      };
      if (reusableDraft) {
        store.registrations[draftIndex] = registration;
      } else {
        store.registrations.push(registration);
      }
      await writeStore(store);
      const publicRegistration = { ...registration };
      delete publicRegistration.duplicateReferenceId;

      return {
        success: true,
        status: verificationStatus,
        registration_id: registration.id,
        registrationId: registration.registrationId,
        message: getVerificationMessage(verificationStatus),
        next_step: getVerificationNextStep(verificationStatus),
        registration: publicRegistration
      };
    },

    async submitPaymentProof(payload) {
      const validationError = validatePaymentPayload(payload);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }

      const store = await readStore();
      const registrationId = normalizeText(payload.registrationId || payload.registration_id || payload.id);
      const rowIndex = store.registrations.findIndex(row => row.id === registrationId || row.registrationId === registrationId);

      if (rowIndex === -1) {
        const error = new Error('Registration not found.');
        error.statusCode = 404;
        throw error;
      }

      const current = store.registrations[rowIndex];

      if (current.verificationStatus !== 'verified') {
        const error = new Error('Payment is only available for verified registrations.');
        error.statusCode = 403;
        throw error;
      }

      const duplicateCheck = checkJsonExistingRegistration(store, {
        matchedStudentId: current.matchedStudentId,
        studentName: current.studentName,
        parentStatus: current.parentStatus,
        excludeRegistrationId: current.id
      });

      if (duplicateCheck.exists) {
        const next = {
          ...current,
          verificationStatus: 'already_registered',
          duplicateReferenceId: duplicateCheck.registrationId,
          verificationNotes: duplicateCheck.notes,
          seatNumber: '',
          updatedAt: new Date().toISOString()
        };
        store.registrations[rowIndex] = next;
        await writeStore(store);
        const publicRegistration = { ...next };
        delete publicRegistration.duplicateReferenceId;

        return {
          success: true,
          status: 'already_registered',
          registration_id: next.id,
          registrationId: next.registrationId,
          message: getVerificationMessage('already_registered'),
          next_step: getVerificationNextStep('already_registered'),
          registration: publicRegistration
        };
      }

      const { attendeeCount, lunchBoxCount } = normalizeRegistrationCounts(payload);
      const existingRows = store.registrations.filter(row => row.id !== current.id);
      const currentSeatCount = getUsedSeatCount([{ seatNumber: current.seatNumber }]);

      if ((!normalizeText(current.seatNumber) || currentSeatCount !== attendeeCount)
        && getUsedSeatCount(existingRows) + attendeeCount > ticketQuota) {
        const error = new Error('Ticket quota is full.');
        error.statusCode = 400;
        throw error;
      }

      const seatNumber = (!normalizeText(current.seatNumber) || currentSeatCount !== attendeeCount)
        ? createSeatNumbers(attendeeCount, existingRows)
        : normalizeText(current.seatNumber);

      const next = {
        ...current,
        attendeeCount,
        lunchBoxCount,
        seatNumber,
        ticketPrice,
        totalAmount: attendeeCount * ticketPrice,
        paymentStatus: 'pending',
        paymentProofFilename: await storePaymentProof(payload, current.registrationId),
        updatedAt: new Date().toISOString()
      };

      store.registrations[rowIndex] = next;
      await writeStore(store);

      return {
        success: true,
        status: next.verificationStatus,
        registration_id: next.id,
        registrationId: next.registrationId,
        message: 'Payment proof uploaded.',
        next_step: 'show_confirmation',
        registration: next
      };
    },

    async get(id) {
      const store = await readStore();
      return store.registrations.find(row => row.id === id || row.registrationId === id) || null;
    },

    async update(id, payload) {
      const store = await readStore();
      const rowIndex = store.registrations.findIndex(row => row.id === id || row.registrationId === id);

      if (rowIndex === -1) {
        return null;
      }

      const current = store.registrations[rowIndex];
      const next = { ...current };

      Object.entries(payload).forEach(([key, value]) => {
        if (allowedUpdates.has(key)) {
          next[key] = typeof value === 'string' ? normalizeText(value) : value;
        }
      });

      next.attendeeCount = normalizeCount(next.attendeeCount, current.attendeeCount);
      next.lunchBoxCount = normalizeCount(next.lunchBoxCount, current.lunchBoxCount);
      next.updatedAt = new Date().toISOString();
      store.registrations[rowIndex] = next;
      await writeStore(store);
      return next;
    },

    async delete(id) {
      const store = await readStore();
      const rowIndex = store.registrations.findIndex(row => row.id === id || row.registrationId === id);

      if (rowIndex === -1) {
        return false;
      }

      const [deletedRegistration] = store.registrations.splice(rowIndex, 1);
      await writeStore(store);
      await deleteStoredPaymentProof(deletedRegistration.paymentProofFilename);
      return true;
    }
  };
}

async function createPostgresRepository() {
  let Pool;

  try {
    ({ Pool } = await import('pg'));
  } catch {
    throw new Error('Package "pg" belum terinstall. Jalankan: npm install pg');
  }

  const pool = new Pool(createPoolConfig());

  async function verifyStudentName({ studentName, parentStatus }) {
    const normalizedInputName = normalizeName(studentName);

    if (!normalizedInputName) {
      return { status: 'not_verified', matchedStudentId: null, notes: 'Student name is empty.' };
    }

    if (parentStatus === 'not_registered') {
      return {
        status: 'not_verified',
        matchedStudentId: null,
        notes: 'User selected child has not registered yet.'
      };
    }

    await ensureVerificationSchema(pool);
    const result = await pool.query(
      `SELECT id, student_name, parent_status, grade
       FROM eligible_students
       WHERE parent_status = $1`,
      [parentStatus]
    );
    let bestMatch = null;
    let bestSimilarity = 0;
    const exactMatch = result.rows.find(student => normalizeName(student.student_name) === normalizedInputName);

    if (exactMatch) {
      return {
        status: 'verified',
        matchedStudentId: exactMatch.id,
        notes: 'Verified by normalized student name.'
      };
    }

    result.rows.forEach(student => {
      const similarity = calculateNameSimilarity(student.student_name, normalizedInputName);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = student;
      }
    });

    if (bestSimilarity >= 0.9) {
      return {
        status: 'verified',
        matchedStudentId: bestMatch.id,
        notes: `Verified by student name. Similarity: ${bestSimilarity.toFixed(2)}`
      };
    }

    if (bestSimilarity >= 0.6) {
      return {
        status: 'need_review',
        matchedStudentId: bestMatch ? bestMatch.id : null,
        notes: `Student name needs review. Similarity: ${bestSimilarity.toFixed(2)}`
      };
    }

    return {
      status: 'not_verified',
      matchedStudentId: null,
      notes: `Student name not found. Best similarity: ${bestSimilarity.toFixed(2)}`
    };
  }

  async function checkExistingRegistration({ matchedStudentId, studentName, parentStatus, excludeRegistrationId = null }) {
    await ensureVerificationSchema(pool);
    const excludedId = normalizeText(excludeRegistrationId);

    if (matchedStudentId) {
      const params = [matchedStudentId];
      const excludeClause = excludedId
        ? `AND id::text <> $${params.push(excludedId)} AND registration_id <> $${params.length}`
        : '';
      const result = await pool.query(
        `SELECT id, registration_id, student_name, parent_status, verification_status, payment_status, created_at
         FROM registrations
         WHERE matched_student_id = $1
           ${excludeClause}
           AND verification_status = 'verified'
           AND (
             payment_status IN ('verified', 'paid', 'confirmed', 'waiting_confirmation')
             OR (
               (payment_status IS NULL OR payment_status = 'pending')
               AND (
                 NULLIF(payment_proof_filename, '') IS NOT NULL
                 OR NULLIF(payment_proof_data, '') IS NOT NULL
               )
             )
         )
         ORDER BY created_at ASC
         LIMIT 1`,
        params
      );

      if (result.rows.length > 0) {
        return {
          exists: true,
          registrationId: result.rows[0].id,
          notes: `Duplicate registration found by matched_student_id. Existing registration ID: ${result.rows[0].id}`
        };
      }
    }

    const normalizedName = normalizeName(studentName);
    const normalizedParentStatus = normalizeName(parentStatus);

    if (!normalizedName || !normalizedParentStatus) {
      return {
        exists: false,
        registrationId: null,
        notes: 'No existing registration found.'
      };
    }

    const params = [normalizedName, normalizedParentStatus];
    const excludeClause = excludedId
      ? `AND id::text <> $${params.push(excludedId)} AND registration_id <> $${params.length}`
      : '';
    const fallbackResult = await pool.query(
      `SELECT id, registration_id, student_name, parent_status, verification_status, payment_status, created_at
       FROM registrations
       WHERE LOWER(TRIM(REGEXP_REPLACE(student_name, '\\s+', ' ', 'g'))) = $1
         AND LOWER(TRIM(REGEXP_REPLACE(parent_status, '\\s+', ' ', 'g'))) = $2
         ${excludeClause}
         AND verification_status = 'verified'
         AND (
           payment_status IN ('verified', 'paid', 'confirmed', 'waiting_confirmation')
           OR (
             (payment_status IS NULL OR payment_status = 'pending')
             AND (
               NULLIF(payment_proof_filename, '') IS NOT NULL
               OR NULLIF(payment_proof_data, '') IS NOT NULL
             )
           )
       )
       ORDER BY created_at ASC
       LIMIT 1`,
      params
    );

    if (fallbackResult.rows.length > 0) {
      return {
        exists: true,
        registrationId: fallbackResult.rows[0].id,
        notes: `Duplicate registration found by student_name + parent_status. Existing registration ID: ${fallbackResult.rows[0].id}`
      };
    }

    return {
      exists: false,
      registrationId: null,
      notes: 'No existing registration found.'
    };
  }

  return {
    async health() {
      await pool.query('SELECT 1');
      const config = await this.config();
      return { ok: true, storage: 'postgres', ...config };
    },

    async config() {
      const result = await pool.query('SELECT seat_number FROM registrations WHERE seat_number IS NOT NULL');
      const rows = result.rows.map(row => ({ seatNumber: row.seat_number }));
      const usedSeats = getUsedSeatCount(rows);
      return {
        ticketPrice,
        ticketQuota,
        usedSeats,
        remainingSeats: Math.max(ticketQuota - usedSeats, 0)
      };
    },

    async list(searchParams) {
      const params = [];
      const where = [];
      const search = normalizeText(searchParams.get('search'));
      const category = normalizeText(searchParams.get('category'));
      const status = normalizeText(searchParams.get('status'));
      const paymentStatus = normalizeText(searchParams.get('paymentStatus'));

      if (search) {
        params.push(`%${search}%`);
        where.push(`(
          registration_id ILIKE $${params.length}
          OR student_name ILIKE $${params.length}
          OR parent_name ILIKE $${params.length}
          OR phone ILIKE $${params.length}
          OR email ILIKE $${params.length}
          OR seat_number ILIKE $${params.length}
        )`);
      }

      if (category) {
        params.push(category);
        where.push(`parent_category = $${params.length}`);
      }

      if (status) {
        params.push(status);
        where.push(`status = $${params.length}`);
      }

      if (paymentStatus) {
        params.push(paymentStatus);
        where.push(`payment_status = $${params.length}`);
      }

      const sql = `
        SELECT *
        FROM registrations
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
      `;
      const result = await pool.query(sql, params);
      return result.rows.map(toCamelRow);
    },

    async listEligibleStudents(searchParams) {
      await ensureVerificationSchema(pool);
      const params = [];
      const where = [];
      const search = normalizeText(searchParams.get('search'));
      const parentStatus = normalizeText(searchParams.get('parentStatus'));

      if (search) {
        params.push(`%${search}%`);
        where.push(`(student_name ILIKE $${params.length} OR grade ILIKE $${params.length})`);
      }

      if (parentStatus) {
        params.push(parentStatus);
        where.push(`parent_status = $${params.length}`);
      }

      const result = await pool.query(
        `SELECT id, student_name, parent_status, grade, created_at
         FROM eligible_students
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY student_name ASC`,
        params
      );

      return result.rows.map(toCamelEligibleStudent);
    },

    async createEligibleStudent(payload) {
      const validationError = validateEligibleStudentPayload(payload);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }

      await ensureVerificationSchema(pool);
      const result = await pool.query(
        `INSERT INTO eligible_students (student_name, parent_status, grade)
         VALUES ($1, $2, NULLIF($3, ''))
         RETURNING id, student_name, parent_status, grade, created_at`,
        [
          normalizeText(payload.studentName || payload.student_name),
          normalizeText(payload.parentStatus || payload.parent_status),
          normalizeText(payload.grade)
        ]
      );

      return toCamelEligibleStudent(result.rows[0]);
    },

    async updateEligibleStudent(id, payload) {
      const validationError = validateEligibleStudentPayload(payload, true);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }

      const assignments = [];
      const values = [];
      const fields = {
        studentName: 'student_name',
        student_name: 'student_name',
        parentStatus: 'parent_status',
        parent_status: 'parent_status',
        grade: 'grade'
      };
      const assignedColumns = new Set();

      Object.entries(fields).forEach(([key, column]) => {
        if (!Object.prototype.hasOwnProperty.call(payload, key) || assignedColumns.has(column)) {
          return;
        }

        assignedColumns.add(column);
        values.push(normalizeText(payload[key]));
        assignments.push(`${column} = ${column === 'grade' ? `NULLIF($${values.length}, '')` : `$${values.length}`}`);
      });

      await ensureVerificationSchema(pool);

      if (!assignments.length) {
        const result = await pool.query(
          `SELECT id, student_name, parent_status, grade, created_at
           FROM eligible_students
           WHERE id::text = $1
           LIMIT 1`,
          [id]
        );
        return result.rows[0] ? toCamelEligibleStudent(result.rows[0]) : null;
      }

      values.push(id);
      const result = await pool.query(
        `UPDATE eligible_students
         SET ${assignments.join(', ')}
         WHERE id::text = $${values.length}
         RETURNING id, student_name, parent_status, grade, created_at`,
        values
      );

      return result.rows[0] ? toCamelEligibleStudent(result.rows[0]) : null;
    },

    async deleteEligibleStudent(id) {
      await ensureVerificationSchema(pool);
      const result = await pool.query(
        `DELETE FROM eligible_students WHERE id::text = $1`,
        [id]
      );
      return result.rowCount > 0;
    },

    async create(payload) {
      const category = normalizeText(payload.category || payload.parentCategory);
      const parentStatus = getParentStatus(category);
      const { attendeeCount, lunchBoxCount } = normalizeRegistrationCounts(payload);
      const draftRegistrationId = normalizeText(payload.registrationId || payload.registration_id || payload.id);
      let draftRegistration = null;

      if (draftRegistrationId) {
        const draftResult = await pool.query(
          `SELECT * FROM registrations WHERE id::text = $1 OR registration_id = $1 LIMIT 1`,
          [draftRegistrationId]
        );
        draftRegistration = draftResult.rows[0] || null;
      }

      const reusableDraft = draftRegistration
        && !normalizeText(draftRegistration.payment_proof_data)
        && (!normalizeText(draftRegistration.payment_status) || normalizeText(draftRegistration.payment_status) === 'pending');
      const verification = await verifyStudentName({
        studentName: payload.studentName,
        parentStatus
      });
      let verificationStatus = verification.status;
      let duplicateReferenceId = null;
      let verificationNotes = verification.notes;

      if (verification.status === 'verified') {
        const duplicateCheck = await checkExistingRegistration({
          matchedStudentId: verification.matchedStudentId,
          studentName: payload.studentName,
          parentStatus,
          excludeRegistrationId: reusableDraft ? draftRegistration.id : null
        });

        if (duplicateCheck.exists) {
          verificationStatus = 'already_registered';
          duplicateReferenceId = duplicateCheck.registrationId;
          verificationNotes = duplicateCheck.notes;
        }
      }

      if (verificationStatus === 'verified') {
        const existingSeatResult = await pool.query(
          `SELECT seat_number FROM registrations WHERE seat_number IS NOT NULL`
        );
        const usedSeats = getUsedSeatCount(existingSeatResult.rows.map(row => ({ seatNumber: row.seat_number })));

        if (usedSeats + attendeeCount > ticketQuota) {
          const error = new Error('Ticket quota is full.');
          error.statusCode = 400;
          throw error;
        }
      }

      const nextResult = reusableDraft ? null : await pool.query(
        `SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM registrations`
      );
      const nextId = reusableDraft ? null : Number(nextResult.rows[0].next_id);
      const registrationId = reusableDraft
        ? draftRegistration.registration_id
        : `GPS-2026-${String(nextId).padStart(4, '0')}`;

      const values = [
        registrationId,
        category,
        parentStatus,
        normalizeText(payload.waitingListStatus),
        normalizeText(payload.studentLevel),
        normalizeText(payload.studentName),
        normalizeText(payload.parentName),
        normalizeText(payload.phone),
        normalizeText(payload.email),
        attendeeCount,
        lunchBoxCount,
        verificationStatus,
        verification.matchedStudentId,
        duplicateReferenceId,
        verificationNotes,
        ticketPrice,
        attendeeCount * ticketPrice
      ];

      const result = reusableDraft
        ? await pool.query(
          `UPDATE registrations
           SET parent_category = $2,
               parent_status = $3,
               waiting_list_status = NULLIF($4, ''),
               student_level = $5,
               student_name = $6,
               parent_name = $7,
               phone = $8,
               email = $9,
               attendee_count = $10,
               lunch_box_count = $11,
               verification_status = $12,
               matched_student_id = $13,
               duplicate_reference_id = $14,
               verification_notes = $15,
               ticket_price = $16,
               total_amount = $17,
               payment_status = 'pending',
               seat_number = NULL
           WHERE id = $18
           RETURNING *`,
          [...values, draftRegistration.id]
        )
        : await pool.query(
          `INSERT INTO registrations (
          registration_id,
          parent_category,
          parent_status,
          waiting_list_status,
          student_level,
          student_name,
          parent_name,
          phone,
          email,
          attendee_count,
          lunch_box_count,
          verification_status,
          matched_student_id,
          duplicate_reference_id,
          verification_notes,
          ticket_price,
          total_amount
        ) VALUES (
          $1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17
        )
        RETURNING *`,
          values
        );

      const registration = toCamelRow(result.rows[0]);
      const publicRegistration = { ...registration };
      delete publicRegistration.duplicateReferenceId;

      return {
        success: true,
        status: verificationStatus,
        registration_id: registration.id,
        registrationId: registration.registrationId,
        message: getVerificationMessage(verificationStatus),
        next_step: getVerificationNextStep(verificationStatus),
        registration: publicRegistration
      };
    },

    async submitPaymentProof(payload) {
      const validationError = validatePaymentPayload(payload);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }

      await ensureVerificationSchema(pool);
      const registrationId = normalizeText(payload.registrationId || payload.registration_id || payload.id);
      const currentResult = await pool.query(
        `SELECT * FROM registrations WHERE id::text = $1 OR registration_id = $1 LIMIT 1`,
        [registrationId]
      );
      const current = currentResult.rows[0];

      if (!current) {
        const error = new Error('Registration not found.');
        error.statusCode = 404;
        throw error;
      }

      if (current.verification_status !== 'verified') {
        const error = new Error('Payment is only available for verified registrations.');
        error.statusCode = 403;
        throw error;
      }

      const duplicateCheck = await checkExistingRegistration({
        matchedStudentId: current.matched_student_id,
        studentName: current.student_name,
        parentStatus: current.parent_status,
        excludeRegistrationId: current.id
      });

      if (duplicateCheck.exists) {
        const duplicateResult = await pool.query(
          `UPDATE registrations
           SET verification_status = 'already_registered',
               duplicate_reference_id = $1,
               verification_notes = $2,
               seat_number = NULL
           WHERE id = $3
           RETURNING *`,
          [duplicateCheck.registrationId, duplicateCheck.notes, current.id]
        );
        const registration = toCamelRow(duplicateResult.rows[0]);
        const publicRegistration = { ...registration };
        delete publicRegistration.duplicateReferenceId;

        return {
          success: true,
          status: 'already_registered',
          registration_id: registration.id,
          registrationId: registration.registrationId,
          message: getVerificationMessage('already_registered'),
          next_step: getVerificationNextStep('already_registered'),
          registration: publicRegistration
        };
      }

      const { attendeeCount, lunchBoxCount } = normalizeRegistrationCounts(payload);
      let seats = normalizeText(current.seat_number);
      const currentSeatCount = getUsedSeatCount([{ seatNumber: seats }]);

      if (!seats || currentSeatCount !== attendeeCount) {
        const existingSeatResult = await pool.query(
          `SELECT seat_number FROM registrations WHERE id <> $1 AND seat_number IS NOT NULL`,
          [current.id]
        );
        const existingSeats = existingSeatResult.rows.map(row => ({ seatNumber: row.seat_number }));
        const usedSeats = getUsedSeatCount(existingSeats);

        if (usedSeats + attendeeCount > ticketQuota) {
          const error = new Error('Ticket quota is full.');
          error.statusCode = 400;
          throw error;
        }

        seats = createSeatNumbers(attendeeCount, existingSeats);
      }

      const proof = parsePaymentProofForDatabase(payload, current.registration_id);
      const result = await pool.query(
        `UPDATE registrations
         SET seat_number = $1,
             attendee_count = $2,
             lunch_box_count = $3,
             payment_proof_filename = NULLIF($4, ''),
             payment_proof_mime_type = NULLIF($5, ''),
             payment_proof_data = NULLIF($6, ''),
             ticket_price = $7,
             total_amount = $8,
             payment_status = 'pending'
         WHERE id = $9
         RETURNING *`,
        [
          seats,
          attendeeCount,
          lunchBoxCount,
          proof.filename,
          proof.mimeType,
          proof.base64Data,
          ticketPrice,
          attendeeCount * ticketPrice,
          current.id
        ]
      );
      const registration = toCamelRow(result.rows[0]);

      return {
        success: true,
        status: registration.verificationStatus,
        registration_id: registration.id,
        registrationId: registration.registrationId,
        message: 'Payment proof uploaded.',
        next_step: 'show_confirmation',
        registration
      };
    },

    async get(id) {
      const result = await pool.query(
        `SELECT * FROM registrations WHERE id::text = $1 OR registration_id = $1 LIMIT 1`,
        [id]
      );

      return result.rows[0] ? toCamelRow(result.rows[0]) : null;
    },

    async update(id, payload) {
      const assignments = [];
      const values = [];

      Object.entries(payload).forEach(([key, value]) => {
        if (!allowedUpdates.has(key)) {
          return;
        }

        const column = columnMap[key];
        const normalized = typeof value === 'string' ? normalizeText(value) : value;
        values.push(key === 'checkedInAt' && !normalized ? null : normalized);
        assignments.push(`${column} = $${values.length}`);
      });

      if (!assignments.length) {
        return this.get(id);
      }

      values.push(id);
      const result = await pool.query(
        `UPDATE registrations
         SET ${assignments.join(', ')}
         WHERE id::text = $${values.length} OR registration_id = $${values.length}
         RETURNING *`,
        values
      );

      return result.rows[0] ? toCamelRow(result.rows[0]) : null;
    },

    async delete(id) {
      const result = await pool.query(
        `DELETE FROM registrations WHERE id::text = $1 OR registration_id = $1`,
        [id]
      );
      return result.rowCount > 0;
    },

    async getPaymentProof(filename) {
      const result = await pool.query(
        `SELECT payment_proof_filename, payment_proof_mime_type, payment_proof_data
         FROM registrations
         WHERE payment_proof_filename = $1
         LIMIT 1`,
        [filename]
      );
      const proof = result.rows[0];

      if (!proof?.payment_proof_data) {
        return null;
      }

      return {
        filename: proof.payment_proof_filename,
        mimeType: proof.payment_proof_mime_type || 'application/octet-stream',
        buffer: Buffer.from(proof.payment_proof_data, 'base64')
      };
    }
  };
}

const repository = usePostgres
  ? await createPostgresRepository()
  : await createJsonRepository();

async function handleApi(request, response, url) {
  const route = url.pathname;

  if (route === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, await repository.health());
    return;
  }

  if (route === '/api/config' && request.method === 'GET') {
    sendJson(response, 200, await repository.config());
    return;
  }

  if (route === '/api/registrations' && request.method === 'GET') {
    sendJson(response, 200, { registrations: await repository.list(url.searchParams) });
    return;
  }

  if (route === '/api/eligible-students' && request.method === 'GET') {
    sendJson(response, 200, { students: await repository.listEligibleStudents(url.searchParams) });
    return;
  }

  if (route === '/api/eligible-students' && request.method === 'POST') {
    const payload = await readJsonBody(request);
    const student = await repository.createEligibleStudent(payload);
    sendJson(response, 201, { student });
    return;
  }

  const eligibleDetailMatch = route.match(/^\/api\/eligible-students\/([^/]+)$/);
  if (eligibleDetailMatch) {
    const id = decodeURIComponent(eligibleDetailMatch[1]);

    if (request.method === 'PATCH') {
      const payload = await readJsonBody(request);
      const student = await repository.updateEligibleStudent(id, payload);

      if (!student) {
        sendJson(response, 404, { error: 'Student data not found.' });
        return;
      }

      sendJson(response, 200, { student });
      return;
    }

    if (request.method === 'DELETE') {
      const deleted = await repository.deleteEligibleStudent(id);

      if (!deleted) {
        sendJson(response, 404, { error: 'Student data not found.' });
        return;
      }

      sendNoContent(response);
      return;
    }
  }

  if (route === '/api/registrations' && request.method === 'POST') {
    const payload = await readJsonBody(request);
    const action = normalizeText(payload.action || payload.step || 'verify');

    if (action === 'payment') {
      const validationError = validatePaymentPayload(payload);

      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const result = await repository.submitPaymentProof(payload);
      sendJson(response, 200, result);
      return;
    }

    const validationError = validateRegistration(payload);

    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const result = await repository.create(payload);
    sendJson(response, 201, result);
    return;
  }

  const proofMatch = route.match(/^\/api\/payment-proofs\/([^/]+)$/);
  if (proofMatch && request.method === 'GET') {
    const filename = path.basename(decodeURIComponent(proofMatch[1]));

    if (usePostgres && repository.getPaymentProof) {
      const proof = await repository.getPaymentProof(filename);

      if (!proof) {
        sendJson(response, 404, { error: 'Payment proof not found.' });
        return;
      }

      response.writeHead(200, {
        'Content-Type': proof.mimeType,
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${proof.filename}"`
      });
      response.end(proof.buffer);
      return;
    }

    const proofPath = path.join(paymentProofDir, filename);

    try {
      const file = await readFile(proofPath);
      const extension = path.extname(filename).toLowerCase();
      response.writeHead(200, {
        'Content-Type': contentTypes[extension] || 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${filename}"`
      });
      response.end(file);
    } catch {
      sendJson(response, 404, { error: 'Payment proof not found.' });
    }
    return;
  }

  const detailMatch = route.match(/^\/api\/registrations\/([^/]+)$/);
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);

    if (request.method === 'GET') {
      const registration = await repository.get(id);

      if (!registration) {
        sendJson(response, 404, { error: 'Registration not found.' });
        return;
      }

      sendJson(response, 200, { registration });
      return;
    }

    if (request.method === 'PATCH') {
      const payload = await readJsonBody(request);

      if (payload.paymentStatus && !paymentStatuses.has(payload.paymentStatus)) {
        sendJson(response, 400, { error: 'Payment status is not valid.' });
        return;
      }

      if (payload.status && !registrationStatuses.has(payload.status)) {
        sendJson(response, 400, { error: 'Registration status is not valid.' });
        return;
      }

      const registration = await repository.update(id, payload);

      if (!registration) {
        sendJson(response, 404, { error: 'Registration not found.' });
        return;
      }

      sendJson(response, 200, { registration });
      return;
    }

    if (request.method === 'DELETE') {
      const deleted = await repository.delete(id);

      if (!deleted) {
        sendJson(response, 404, { error: 'Registration not found.' });
        return;
      }

      sendNoContent(response);
      return;
    }
  }

  sendJson(response, 404, { error: 'API route not found.' });
}

async function serveStatic(request, response, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const absolutePath = path.normalize(path.join(__dirname, requestedPath));

  if (!absolutePath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const file = await readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': contentTypes[extension] || 'application/octet-stream'
    });
    response.end(file);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(request, response, url);
  } catch (error) {
    sendJson(response, error.statusCode || 500, { error: error.message || 'Server error.' });
  }
});

server.listen(port, () => {
  const storage = usePostgres ? 'PostgreSQL' : 'JSON file';
  console.log(`Global Parenting Summit server running at http://localhost:${port}`);
  console.log(`Storage: ${storage}`);
});
