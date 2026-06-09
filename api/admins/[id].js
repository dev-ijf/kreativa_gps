import { requireAuth, getAdmin, updateAdmin, deleteAdmin } from '../../lib/auth.js';

export default async function handler(request, response) {
  const session = requireAuth(request, response);
  if (!session) return;

  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const id = url.pathname.split('/').pop();

  try {
    if (request.method === 'GET') {
      const admin = await getAdmin(id);
      if (!admin) {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ error: 'Admin not found.' }));
        return;
      }
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(admin));
      return;
    }

    if (request.method === 'PATCH') {
      const body = await readJsonBody(request);
      const admin = await updateAdmin(id, body);
      if (!admin) {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ error: 'Admin not found.' }));
        return;
      }
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(admin));
      return;
    }

    if (request.method === 'DELETE') {
      const deleted = await deleteAdmin(id);
      if (!deleted) {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ error: 'Admin not found.' }));
        return;
      }
      response.statusCode = 204;
      response.end();
      return;
    }

    response.statusCode = 405;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (error) {
    console.error('Admin API error:', error);
    const status = error.code === '23505' ? 409 : 500;
    const msg = error.code === '23505' ? 'Username or email already exists.' : (error.message || 'Server error.');
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: msg }));
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', c => chunks.push(c));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    request.on('error', reject);
  });
}
