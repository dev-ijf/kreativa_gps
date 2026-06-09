import { readFile } from 'node:fs/promises';
import path from 'node:path';

const FILES = {
  index: { path: 'index.html', type: 'text/html; charset=utf-8' },
  admin: { path: 'admin.html', type: 'text/html; charset=utf-8' },
  'admin-login': { path: 'admin-login.html', type: 'text/html; charset=utf-8' },
  script: { path: 'script.js', type: 'application/javascript; charset=utf-8' },
  adminScript: { path: 'admin.js', type: 'application/javascript; charset=utf-8' },
  style: { path: 'style.css', type: 'text/css; charset=utf-8' },
  qris: { path: 'assets/qris-payment.jpg', type: 'image/jpeg' },
};

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end('Method not allowed');
    return;
  }

  const url = new URL(request.url, 'https://kreativa-gps.vercel.app');
  const key = url.searchParams.get('file') || 'index';
  const file = FILES[key];

  if (!file) {
    response.statusCode = 404;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end('Not found');
    return;
  }

  try {
    const filePath = path.join(process.cwd(), 'dist', file.path);
    const body = await readFile(filePath);

    response.statusCode = 200;
    response.setHeader('content-type', file.type);
    response.setHeader('cache-control', 'public, max-age=0, must-revalidate');
    response.end(body);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end(`Unable to load ${file.path}`);
  }
}
