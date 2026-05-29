import {
  createRegistration,
  handleError,
  listRegistrations,
  readJsonBody,
  sendJson,
  submitPaymentProof
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
      const action = String(payload.action || payload.step || 'verify');
      const result = action === 'payment'
        ? await submitPaymentProof(payload)
        : await createRegistration(payload);
      sendJson(response, action === 'payment' ? 200 : 201, result);
      return;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    await handleError(response, error);
  }
}
