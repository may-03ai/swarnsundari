const { getEnv, issueAdminToken, jsonResponse, parseJsonBody } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const body = parseJsonBody(event);
  if (!body) {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const password = getEnv('ADMIN_PASSWORD');
  const tokenSecret = getEnv('ADMIN_TOKEN_SECRET') || getEnv('ADMIN_PASSWORD');

  if (!password || !tokenSecret) {
    return jsonResponse(500, { error: 'Admin login is not configured yet.' });
  }

  if (body.password !== password) {
    return jsonResponse(401, { error: 'Incorrect password.' });
  }

  const issued = issueAdminToken(tokenSecret, 15 * 60 * 1000);
  return jsonResponse(200, {
    ok: true,
    token: issued.token,
    expiresAt: issued.expiresAt
  });
};
