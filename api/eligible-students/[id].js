import {
  deleteEligibleStudent,
  handleError,
  readJsonBody,
  sendJson,
  sendNoContent,
  updateEligibleStudent
} from '../../lib/repository.js';
import { requireAuth } from '../../lib/auth.js';

export default async function handler(request, response) {
  const session = requireAuth(request, response);
  if (!session) return;

  const id = request.query?.id;

  try {
    if (request.method === 'PATCH') {
      const payload = await readJsonBody(request);
      const student = await updateEligibleStudent(id, payload);

      if (!student) {
        sendJson(response, 404, { error: 'Student data not found.' });
        return;
      }

      sendJson(response, 200, { student });
      return;
    }

    if (request.method === 'DELETE') {
      const deleted = await deleteEligibleStudent(id);

      if (!deleted) {
        sendJson(response, 404, { error: 'Student data not found.' });
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
