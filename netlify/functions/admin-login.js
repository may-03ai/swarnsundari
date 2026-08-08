const { getEnv, issueAdminToken, jsonResponse, parseJsonBody, constantTimeCompare, safeErrorMessage } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' }, {}, event);
  }

  const body = parseJsonBody(event);
  if (!body) {
    return jsonResponse(400, { error: 'Invalid JSON body.' }, {}, event);
  }

  const password = getEnv('ADMIN_PASSWORD');
  const tokenSecret = getEnv('ADMIN_TOKEN_SECRET');

  if (!password || !tokenSecret) {
    return jsonResponse(500, { error: 'Admin login is not configured yet.' }, {}, event);
  }

  const suppliedPassword = typeof body.password === 'string' ? body.password : '';
  if (!constantTimeCompare(suppliedPassword, password)) {
    return jsonResponse(401, { error: 'Incorrect password.' }, {}, event);
  }

  try {
    const issued = issueAdminToken(tokenSecret, 15 * 60 * 1000);
    return jsonResponse(200, {
      ok: true,
      token: issued.token,
      expiresAt: issued.expiresAt
    }, {}, event);
  } catch (error) {
    return jsonResponse(500, { error: safeErrorMessage(error.message) }, {}, event);
  }
};
