import {
  createRegistration,
  handleError,
  listRegistrations,
  readJsonBody,
  sendJson
} from '../../lib/repository.js';

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
      sendJson(response, 200, {
        registrations: await listRegistrations(url.searchParams)
      });
      return;
    }

    if (request.method === 'POST') {
      const payload = await readJsonBody(request);
      sendJson(response, 201, {
        registration: await createRegistration(payload)
      });
      return;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    await handleError(response, error);
  }
}
