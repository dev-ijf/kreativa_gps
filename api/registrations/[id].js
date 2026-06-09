import {
  deleteRegistration,
  getRegistration,
  handleError,
  readJsonBody,
  sendJson,
  sendNoContent,
  updateRegistration
} from '../../lib/repository.js';
import { requireAuth } from '../../lib/auth.js';

export default async function handler(request, response) {
  const id = request.query?.id;

  if (request.method === 'PATCH' || request.method === 'DELETE') {
    const session = requireAuth(request, response);
    if (!session) return;
  }

  try {
    if (request.method === 'GET') {
      const registration = await getRegistration(id);

      if (!registration) {
        sendJson(response, 404, { error: 'Registration not found.' });
        return;
      }

      sendJson(response, 200, { registration });
      return;
    }

    if (request.method === 'PATCH') {
      const payload = await readJsonBody(request);
      const registration = await updateRegistration(id, payload);

      if (!registration) {
        sendJson(response, 404, { error: 'Registration not found.' });
        return;
      }

      sendJson(response, 200, { registration });
      return;
    }

    if (request.method === 'DELETE') {
      const deleted = await deleteRegistration(id);

      if (!deleted) {
        sendJson(response, 404, { error: 'Registration not found.' });
        return;
      }

      sendNoContent(response);
      return;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    await handleError(response, error);
  }
}
