import { Pool } from 'pg';

const ticketPrice = normalizeCurrency(process.env.TICKET_PRICE || 50000);
const ticketQuota = normalizeQuota(process.env.TICKET_QUOTA || 800);

const paymentStatuses = new Set(['pending', 'verified', 'rejected']);
const registrationStatuses = new Set(['confirmed', 'cancelled', 'attended']);

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

const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
};

function getPool() {
  if (!globalThis.__gpsPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured.');
    }

    globalThis.__gpsPool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }

  return globalThis.__gpsPool;
}

function normalizeText(value) {
  return String(value || '').trim();
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
  const paymentProofFilename = normalizeText(payload.paymentProofFilename);
  const paymentProofData = normalizeText(payload.paymentProofData);
  const { attendeeCount, lunchBoxCount } = normalizeRegistrationCounts(payload);

  if (!['existing', 'waitlist'].includes(category)) {
    return 'Parent category is required.';
  }

  if (!studentLevel || !studentName || !parentName || !phone || !email) {
    return 'Student level, student name, parent name, phone, and email are required.';
  }

  if (!email.includes('@')) {
    return 'Email address is not valid.';
  }

  if (!paymentProofFilename || !paymentProofData) {
    return 'Payment proof is required.';
  }

  if (attendeeCount < 1 || attendeeCount > 2) {
    return 'Number of attendees must be 1 or 2.';
  }

  if (lunchBoxCount !== attendeeCount) {
    return 'Lunch box reservation must match number of attendees.';
  }

  return '';
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
    status: row.status,
    notes: row.notes || '',
    checkedInAt: row.checked_in_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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
  const result = await pool.query('SELECT seat_number FROM registrations');
  const rows = result.rows.map(row => ({ seatNumber: row.seat_number }));
  const usedSeats = getUsedSeatCount(rows);

  return {
    ticketPrice,
    ticketQuota,
    usedSeats,
    remainingSeats: Math.max(ticketQuota - usedSeats, 0)
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
  const { attendeeCount, lunchBoxCount } = normalizeRegistrationCounts(payload);

  const nextResult = await pool.query(
    'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM registrations'
  );
  const existingSeatResult = await pool.query('SELECT seat_number FROM registrations');
  const existingSeats = existingSeatResult.rows.map(row => ({ seatNumber: row.seat_number }));
  const usedSeats = getUsedSeatCount(existingSeats);

  if (usedSeats + attendeeCount > ticketQuota) {
    const error = new Error('Ticket quota is full.');
    error.statusCode = 400;
    throw error;
  }

  const registrationId = `GPS-2026-${String(Number(nextResult.rows[0].next_id)).padStart(4, '0')}`;
  const seats = createSeatNumbers(attendeeCount, existingSeats);
  const proof = parsePaymentProof(payload, registrationId);

  const values = [
    registrationId,
    category,
    normalizeText(payload.waitingListStatus),
    normalizeText(payload.studentLevel),
    normalizeText(payload.studentName),
    normalizeText(payload.parentName),
    normalizeText(payload.phone),
    normalizeText(payload.email),
    attendeeCount,
    lunchBoxCount,
    seats,
    proof.filename,
    proof.mimeType,
    proof.base64Data,
    ticketPrice,
    attendeeCount * ticketPrice
  ];

  const result = await pool.query(
    `INSERT INTO registrations (
      registration_id,
      parent_category,
      waiting_list_status,
      student_level,
      student_name,
      parent_name,
      phone,
      email,
      attendee_count,
      lunch_box_count,
      seat_number,
      payment_proof_filename,
      payment_proof_mime_type,
      payment_proof_data,
      ticket_price,
      total_amount
    ) VALUES (
      $1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8, $9, $10, $11,
      NULLIF($12, ''), NULLIF($13, ''), NULLIF($14, ''), $15, $16
    )
    RETURNING *`,
    values
  );

  return toCamelRow(result.rows[0]);
}

export async function getRegistration(id) {
  const result = await getPool().query(
    'SELECT * FROM registrations WHERE id::text = $1 OR registration_id = $1 LIMIT 1',
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
     WHERE id::text = $${values.length} OR registration_id = $${values.length}
     RETURNING *`,
    values
  );

  return result.rows[0] ? toCamelRow(result.rows[0]) : null;
}

export async function deleteRegistration(id) {
  const result = await getPool().query(
    'DELETE FROM registrations WHERE id::text = $1 OR registration_id = $1',
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
