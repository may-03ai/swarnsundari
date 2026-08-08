const { getEnv, verifyAdminToken, jsonResponse, getAuthToken, githubRequest, base64Decode, ensureProductsArray } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const token = getAuthToken(event);
  const tokenSecret = getEnv('ADMIN_TOKEN_SECRET') || getEnv('ADMIN_PASSWORD');
  if (!token || !tokenSecret || !verifyAdminToken(token, tokenSecret)) {
    return jsonResponse(401, { error: 'Unauthorized.' });
  }

  const repo = getEnv('GITHUB_REPO');
  const githubToken = getEnv('GITHUB_TOKEN');
  const branch = getEnv('GITHUB_BRANCH') || 'main';
  if (!repo || !githubToken) {
    return jsonResponse(500, { error: 'GitHub integration is not configured.' });
  }

  try {
    const file = await githubRequest({
      token: githubToken,
      repo,
      path: '/contents/products.json',
      branch
    });

    const raw = base64Decode(file.content || '');
    const products = ensureProductsArray(JSON.parse(raw));
    const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort();

    return jsonResponse(200, { products, categories });
  } catch (error) {
    return jsonResponse(500, { error: error.message || 'Unable to load the catalog right now.' });
  }
};
