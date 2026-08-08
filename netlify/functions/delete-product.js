const { getEnv, verifyAdminToken, jsonResponse, getAuthToken, parseJsonBody, githubRequest, base64Decode, ensureProductsArray, safeErrorMessage } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' }, {}, event);
  }

  const token = getAuthToken(event);
  const tokenSecret = getEnv('ADMIN_TOKEN_SECRET');
  if (!token || !tokenSecret || !verifyAdminToken(token, tokenSecret)) {
    return jsonResponse(401, { error: 'Unauthorized.' }, {}, event);
  }

  const body = parseJsonBody(event);
  if (!body || typeof body.id === 'undefined') {
    return jsonResponse(400, { error: 'Missing product id.' }, {}, event);
  }
  const requestedId = Number(body.id);
  if (!Number.isFinite(requestedId) || requestedId <= 0) {
    return jsonResponse(400, { error: 'Invalid product id.' }, {}, event);
  }

  const repo = getEnv('GITHUB_REPO');
  const githubToken = getEnv('GITHUB_TOKEN');
  const branch = getEnv('GITHUB_BRANCH') || 'main';
  if (!repo || !githubToken) {
    return jsonResponse(500, { error: 'GitHub integration is not configured.' }, {}, event);
  }

  try {
    const fileResponse = await githubRequest({
      token: githubToken,
      repo,
      path: '/contents/products.json',
      branch
    });
    const products = ensureProductsArray(JSON.parse(base64Decode(fileResponse.content || '')));
    const targetProduct = products.find((entry) => Number(entry.id) === requestedId);
    const filtered = products.filter((entry) => Number(entry.id) !== requestedId);
    if (!targetProduct) {
      return jsonResponse(404, { error: 'Product not found.' }, {}, event);
    }

    if (targetProduct.image && /^images\//i.test(targetProduct.image)) {
      const imagePath = `/contents/${targetProduct.image}`;
      try {
        await githubRequest({
          token: githubToken,
          repo,
          path: imagePath,
          branch,
          method: 'GET'
        });
        await githubRequest({
          token: githubToken,
          repo,
          path: imagePath,
          branch,
          method: 'DELETE',
          body: {
            message: `Admin delete image: ${targetProduct.image}`,
            sha: (await githubRequest({ token: githubToken, repo, path: imagePath, branch })).sha,
            branch
          }
        });
      } catch (error) {
        // Image may already be removed or not tracked; continue with product delete.
      }
    }

    const updatedContent = Buffer.from(JSON.stringify(filtered, null, 2)).toString('base64');
    await githubRequest({
      token: githubToken,
      repo,
      path: '/contents/products.json',
      branch,
      method: 'PUT',
      body: {
        message: `Admin delete: product ${body.id}`,
        content: updatedContent,
        sha: fileResponse.sha,
        branch
      }
    });

    return jsonResponse(200, { ok: true, message: 'Product deleted. Changes will publish in 1–2 minutes.' }, {}, event);
  } catch (error) {
    return jsonResponse(500, { error: safeErrorMessage(error.message) }, {}, event);
  }
};
