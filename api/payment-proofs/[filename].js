import { getPaymentProof, handleError, sendJson } from '../../lib/repository.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const proof = await getPaymentProof(request.query?.filename);

    if (!proof) {
      sendJson(response, 404, { error: 'Payment proof not found.' });
      return;
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', proof.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader('Content-Disposition', `inline; filename="${proof.filename}"`);
    response.end(proof.buffer);
  } catch (error) {
    await handleError(response, error);
  }
}
