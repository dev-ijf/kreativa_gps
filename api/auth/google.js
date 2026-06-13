import { getRedirectUri, getGoogleAuthUrl, isGoogleOAuthConfigured } from '../../lib/auth.js';

export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }

  if (!isGoogleOAuthConfigured()) {
    response.writeHead(302, { Location: '/admin/login?error=oauth_config_missing' });
    response.end();
    return;
  }

  const redirectUri = getRedirectUri(request);
  const authUrl = getGoogleAuthUrl(redirectUri);

  response.writeHead(302, { Location: authUrl });
  response.end();
}
