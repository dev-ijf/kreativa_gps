import { clearSessionCookie } from '../../lib/auth.js';

export default function handler(request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }

  clearSessionCookie(response);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ ok: true }));
}
