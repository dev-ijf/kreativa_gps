import {
  createEligibleStudent,
  handleError,
  listEligibleStudents,
  readJsonBody,
  sendJson
} from '../../lib/repository.js';

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
      sendJson(response, 200, {
        students: await listEligibleStudents(url.searchParams)
      });
      return;
    }

    if (request.method === 'POST') {
      const payload = await readJsonBody(request);
      const student = await createEligibleStudent(payload);
      sendJson(response, 201, { student });
      return;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    await handleError(response, error);
  }
}
