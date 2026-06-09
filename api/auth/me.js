import { getSessionFromRequest } from '../../lib/auth.js';

export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    response.statusCode = 401;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Not authenticated' }));
    return;
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({
    email: session.email,
    name: session.name,
    role: session.role
  }));
}
