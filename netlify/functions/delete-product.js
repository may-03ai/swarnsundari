const { getEnv, verifyAdminToken, jsonResponse, getAuthToken, parseJsonBody, githubRequest, base64Decode, ensureProductsArray } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const token = getAuthToken(event);
  const tokenSecret = getEnv('ADMIN_TOKEN_SECRET');
  if (!token || !tokenSecret || !verifyAdminToken(token, tokenSecret)) {
    return jsonResponse(401, { error: 'Unauthorized.' });
  }

  const body = parseJsonBody(event);
  if (!body || typeof body.id === 'undefined') {
    return jsonResponse(400, { error: 'Missing product id.' });
  }

  const repo = getEnv('GITHUB_REPO');
  const githubToken = getEnv('GITHUB_TOKEN');
  if (!repo || !githubToken) {
    return jsonResponse(500, { error: 'GitHub integration is not configured.' });
  }

  try {
    const fileResponse = await githubRequest({
      token: githubToken,
      repo,
      path: '/contents/products.json'
    });
    const products = ensureProductsArray(JSON.parse(base64Decode(fileResponse.content || '')));
    const filtered = products.filter((entry) => Number(entry.id) !== Number(body.id));
    if (filtered.length === products.length) {
      return jsonResponse(404, { error: 'Product not found.' });
    }

    const updatedContent = Buffer.from(JSON.stringify(filtered, null, 2)).toString('base64');
    await githubRequest({
      token: githubToken,
      repo,
      path: '/contents/products.json',
      method: 'PUT',
      body: {
        message: `Admin delete: product ${body.id}`,
        content: updatedContent,
        sha: fileResponse.sha
      }
    });

    return jsonResponse(200, { ok: true, message: 'Product deleted. Changes will publish in 1–2 minutes.' });
  } catch (error) {
    return jsonResponse(500, { error: error.message || 'Unable to delete the product right now.' });
  }
};
