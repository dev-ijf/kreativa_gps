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
  process.env.DATABASE_URL || process.env.PGHOST || process.env.PGDATABASE
);

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

const paymentStatuses = new Set(['pending', 'verified', 'rejected']);
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

  if (!email.includes('@')) {
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
    status: row.status,
    notes: row.notes || '',
    checkedInAt: row.checked_in_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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

    async create(payload) {
      const store = await readStore();
      const { attendeeCount } = normalizeRegistrationCounts(payload);
      const usedSeats = getUsedSeatCount(store.registrations);

      if (usedSeats + attendeeCount > ticketQuota) {
        throw new Error('Ticket quota is full.');
      }

      const registration = toRegistration(payload, store.registrations);
      registration.paymentProofFilename = await storePaymentProof(payload, registration.registrationId);
      store.registrations.push(registration);
      await writeStore(store);
      return registration;
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

  const pool = new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT || 5432),
          database: process.env.PGDATABASE,
          user: process.env.PGUSER,
          password: String(process.env.PGPASSWORD || '')
        }
  );

  return {
    async health() {
      await pool.query('SELECT 1');
      const config = await this.config();
      return { ok: true, storage: 'postgres', ...config };
    },

    async config() {
      const result = await pool.query('SELECT seat_number FROM registrations');
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

    async create(payload) {
      const category = normalizeText(payload.category || payload.parentCategory);
      const { attendeeCount, lunchBoxCount } = normalizeRegistrationCounts(payload);
      const nextResult = await pool.query(
        `SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM registrations`
      );
      const existingSeatResult = await pool.query(
        `SELECT seat_number FROM registrations`
      );
      const nextId = Number(nextResult.rows[0].next_id);
      const registrationId = `GPS-2026-${String(nextId).padStart(4, '0')}`;
      const usedSeats = getUsedSeatCount(
        existingSeatResult.rows.map(row => ({ seatNumber: row.seat_number }))
      );

      if (usedSeats + attendeeCount > ticketQuota) {
        throw new Error('Ticket quota is full.');
      }

      const seats = createSeatNumbers(
        attendeeCount,
        existingSeatResult.rows.map(row => ({ seatNumber: row.seat_number }))
      );
      const proof = parsePaymentProofForDatabase(payload, registrationId);

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

  if (route === '/api/registrations' && request.method === 'POST') {
    const payload = await readJsonBody(request);
    const validationError = validateRegistration(payload);

    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    sendJson(response, 201, { registration: await repository.create(payload) });
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
    sendJson(response, 500, { error: error.message || 'Server error.' });
  }
});

server.listen(port, () => {
  const storage = usePostgres ? 'PostgreSQL' : 'JSON file';
  console.log(`Global Parenting Summit server running at http://localhost:${port}`);
  console.log(`Storage: ${storage}`);
});
