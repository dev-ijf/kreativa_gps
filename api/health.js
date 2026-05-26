import { handleError, health, sendJson } from '../lib/repository.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    sendJson(response, 200, await health());
  } catch (error) {
    await handleError(response, error);
  }
}
