export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }

  response.statusCode = 200;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify({
    app: 'kreativa-gps',
    version: '2026-05-26-vercel-page-route',
  }));
}
