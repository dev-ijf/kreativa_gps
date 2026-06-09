import {
  getRedirectUri,
  exchangeGoogleCode,
  findAdminByEmail,
  signAdminJwt,
  setSessionCookie
} from '../../lib/auth.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }

  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const code = url.searchParams.get('code');

  if (!code) {
    response.writeHead(302, { Location: '/admin/login?error=oauth_failed' });
    response.end();
    return;
  }

  try {
    const redirectUri = getRedirectUri(request);
    const googleUser = await exchangeGoogleCode(code, redirectUri);

    if (!googleUser?.email) {
      response.writeHead(302, { Location: '/admin/login?error=oauth_failed' });
      response.end();
      return;
    }

    const admin = await findAdminByEmail(googleUser.email);

    if (!admin) {
      response.writeHead(302, { Location: '/admin/login?error=not_registered' });
      response.end();
      return;
    }

    if (!admin.is_active) {
      response.writeHead(302, { Location: '/admin/login?error=inactive' });
      response.end();
      return;
    }

    const token = signAdminJwt({
      adminId: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role
    });

    setSessionCookie(response, token);
    response.writeHead(302, { Location: '/admin' });
    response.end();
  } catch (err) {
    console.error('OAuth callback error:', err);
    response.writeHead(302, { Location: '/admin/login?error=oauth_failed' });
    response.end();
  }
}
