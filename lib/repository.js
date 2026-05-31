import { Pool } from 'pg';

const ticketPrice = normalizeCurrency(process.env.TICKET_PRICE || 50000);
const ticketQuota = normalizeQuota(process.env.TICKET_QUOTA || 800);

const paymentStatuses = new Set(['pending', 'verified', 'rejected', 'paid', 'confirmed', 'waiting_confirmation', 'failed', 'canceled', 'cancelled', 'expired']);
const registrationStatuses = new Set(['confirmed', 'cancelled', 'attended']);
const verificationStatuses = new Set(['verified', 'need_review', 'not_verified', 'already_registered']);
const activeDuplicatePaymentStatuses = new Set(['verified', 'paid', 'confirmed', 'waiting_confirmation']);
let verificationSchemaReady = false;

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

const eligibleParentStatuses = new Set(['existing_parent', 'waiting_list_parent']);

const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
};

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

  if (!process.env.PGHOST && !process.env.PGDATABASE) {
    throw new Error('Database connection is not configured.');
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

function getPool() {
  if (!globalThis.__gpsPool) {
    globalThis.__gpsPool = new Pool(createPoolConfig());
  }

  return globalThis.__gpsPool;
}

async function ensureVerificationSchema(pool = getPool()) {
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

function normalizeCurrency(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeQuota(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 800;
}

function normalizeCount(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRegistrationCounts(payload) {
  return {
    attendeeCount: normalizeCount(payload.attendeeCount, 1),
    lunchBoxCount: normalizeCount(payload.lunchBoxCount, 0)
  };
}

function sanitizeFilename(filename) {
  return normalizeText(filename)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

function getUploadExtension(filename, mimeType) {
  const extension = filename.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  const allowedExtensions = new Set(Object.keys(mimeTypes));

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

function parsePaymentProof(payload, registrationId) {
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
    mimeType: mimeTypes[extension],
    base64Data
  };
}

function getUsedSeatNumbers(rows) {
  return new Set(rows.flatMap(row => String(row.seatNumber || row.seat_number || '')
    .split(',')
    .map(seat => seat.trim())
    .map(seat => seat.replace(/\D/g, ''))
    .filter(Boolean)));
}

function getUsedSeatCount(rows) {
  return getUsedSeatNumbers(rows).size;
}

function createSeatNumbers(count, rows) {
  const usedSeats = getUsedSeatNumbers(rows);
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

async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') {
    return request.body;
  }

  if (typeof request.body === 'string') {
    return request.body ? JSON.parse(request.body) : {};
  }

  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000_000) {
      throw new Error('Request body is too large');
    }
  }

  return body ? JSON.parse(body) : {};
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function sendNoContent(response) {
  response.statusCode = 204;
  response.setHeader('Cache-Control', 'no-store');
  response.end();
}

function validateUpdatePayload(payload) {
  if (payload.paymentStatus && !paymentStatuses.has(payload.paymentStatus)) {
    return 'Payment status is not valid.';
  }

  if (payload.status && !registrationStatuses.has(payload.status)) {
    return 'Registration status is not valid.';
  }

  return '';
}

export async function getConfig() {
  const pool = getPool();
  const result = await pool.query('SELECT seat_number FROM registrations WHERE seat_number IS NOT NULL');
  const rows = result.rows.map(row => ({ seatNumber: row.seat_number }));
  const usedSeats = getUsedSeatCount(rows);

  return {
    ticketPrice,
    ticketQuota,
    usedSeats,
    remainingSeats: Math.max(ticketQuota - usedSeats, 0)
  };
}

export async function verifyStudentName({ studentName, parentStatus }) {
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

  const pool = getPool();
  await ensureVerificationSchema(pool);

  const result = await pool.query(
    `SELECT id, student_name, parent_status, grade
     FROM eligible_students
     WHERE parent_status = $1`,
    [parentStatus]
  );

  const exactMatch = result.rows.find(student => normalizeName(student.student_name) === normalizedInputName);

  if (exactMatch) {
    return {
      status: 'verified',
      matchedStudentId: exactMatch.id,
      notes: 'Verified by normalized student name.'
    };
  }

  let bestMatch = null;
  let bestSimilarity = 0;

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

export async function checkExistingRegistration({ matchedStudentId, studentName, parentStatus, excludeRegistrationId = null }) {
  const pool = getPool();
  await ensureVerificationSchema(pool);
  const excludedId = normalizeText(excludeRegistrationId);

  if (matchedStudentId) {
    const params = [matchedStudentId];
    const excludeClause = excludedId
      ? `AND id::text <> $${params.push(excludedId)}::text AND registration_id <> $${params.length}::text`
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
    ? `AND id::text <> $${params.push(excludedId)}::text AND registration_id <> $${params.length}::text`
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

export async function health() {
  await getPool().query('SELECT 1');
  return {
    ok: true,
    storage: 'postgres',
    ...(await getConfig())
  };
}

export async function listRegistrations(searchParams = new URLSearchParams()) {
  const pool = getPool();
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

  const result = await pool.query(
    `SELECT *
     FROM registrations
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC`,
    params
  );

  return result.rows.map(toCamelRow);
}

export async function createRegistration(payload) {
  const validationError = validateRegistration(payload);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

  const pool = getPool();
  const category = normalizeText(payload.category || payload.parentCategory);
  const parentStatus = getParentStatus(category);
  const { attendeeCount, lunchBoxCount } = normalizeRegistrationCounts(payload);
  const draftRegistrationId = normalizeText(payload.registrationId || payload.registration_id || payload.id);
  let draftRegistration = null;

  if (draftRegistrationId) {
    const draftResult = await pool.query(
      'SELECT * FROM registrations WHERE id::text = $1::text OR registration_id = $1::text LIMIT 1',
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
      'SELECT seat_number FROM registrations WHERE seat_number IS NOT NULL'
    );
    const usedSeats = getUsedSeatCount(existingSeatResult.rows);

    if (usedSeats + attendeeCount > ticketQuota) {
      const error = new Error('Ticket quota is full.');
      error.statusCode = 400;
      throw error;
    }
  }

  const nextResult = reusableDraft ? null : await pool.query(
    'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM registrations'
  );
  const registrationId = reusableDraft
    ? draftRegistration.registration_id
    : `GPS-2026-${String(Number(nextResult.rows[0].next_id)).padStart(4, '0')}`;

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
}

export async function submitPaymentProof(payload) {
  const validationError = validatePaymentPayload(payload);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

  const pool = getPool();
  await ensureVerificationSchema(pool);
  const registrationId = normalizeText(payload.registrationId || payload.registration_id || payload.id);
  const currentResult = await pool.query(
    'SELECT * FROM registrations WHERE id::text = $1::text OR registration_id = $1::text LIMIT 1',
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
      'SELECT seat_number FROM registrations WHERE id <> $1 AND seat_number IS NOT NULL',
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

  const proof = parsePaymentProof(payload, current.registration_id);
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
}

export async function getRegistration(id) {
  const result = await getPool().query(
    'SELECT * FROM registrations WHERE id::text = $1::text OR registration_id = $1::text LIMIT 1',
    [id]
  );

  return result.rows[0] ? toCamelRow(result.rows[0]) : null;
}

export async function updateRegistration(id, payload) {
  const validationError = validateUpdatePayload(payload);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

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
    return getRegistration(id);
  }

  values.push(id);
  const result = await getPool().query(
    `UPDATE registrations
     SET ${assignments.join(', ')}
     WHERE id::text = $${values.length}::text OR registration_id = $${values.length}::text
     RETURNING *`,
    values
  );

  return result.rows[0] ? toCamelRow(result.rows[0]) : null;
}

export async function deleteRegistration(id) {
  const result = await getPool().query(
    'DELETE FROM registrations WHERE id::text = $1::text OR registration_id = $1::text',
    [id]
  );
  return result.rowCount > 0;
}

export async function listEligibleStudents(searchParams = new URLSearchParams()) {
  const pool = getPool();
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
}

export async function createEligibleStudent(payload) {
  const validationError = validateEligibleStudentPayload(payload);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

  const pool = getPool();
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
}

export async function updateEligibleStudent(id, payload) {
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
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      return;
    }

    if (assignedColumns.has(column)) {
      return;
    }

    assignedColumns.add(column);
    values.push(normalizeText(payload[key]));
    assignments.push(`${column} = ${column === 'grade' ? `NULLIF($${values.length}, '')` : `$${values.length}`}`);
  });

  if (!assignments.length) {
    const result = await getPool().query(
      `SELECT id, student_name, parent_status, grade, created_at
       FROM eligible_students
       WHERE id::text = $1::text
       LIMIT 1`,
      [id]
    );
    return result.rows[0] ? toCamelEligibleStudent(result.rows[0]) : null;
  }

  const pool = getPool();
  await ensureVerificationSchema(pool);
  values.push(id);
  const result = await pool.query(
    `UPDATE eligible_students
     SET ${assignments.join(', ')}
     WHERE id::text = $${values.length}::text
     RETURNING id, student_name, parent_status, grade, created_at`,
    values
  );

  return result.rows[0] ? toCamelEligibleStudent(result.rows[0]) : null;
}

export async function deleteEligibleStudent(id) {
  const pool = getPool();
  await ensureVerificationSchema(pool);
  const result = await pool.query(
    `DELETE FROM eligible_students WHERE id::text = $1::text`,
    [id]
  );
  return result.rowCount > 0;
}

export async function getPaymentProof(filename) {
  const result = await getPool().query(
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

export async function handleError(response, error) {
  sendJson(response, error.statusCode || 500, {
    error: error.message || 'Server error.'
  });
}

export {
  readJsonBody,
  sendJson,
  sendNoContent
};
