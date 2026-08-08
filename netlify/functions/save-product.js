const { getEnv, verifyAdminToken, jsonResponse, getAuthToken, parseJsonBody, githubRequest, base64Decode, ensureProductsArray, slugify } = require('./_shared');

async function uploadImageToRepo({ token, repo, imageBase64, imageName, imageMime, productName }) {
  if (!imageBase64) return '';
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/i);
  const mimeType = match ? match[1] : imageMime || 'image/png';
  const base64Data = match ? match[2] : imageBase64;
  const extension = (imageName?.split('.').pop() || mimeType.split('/').pop() || 'png').replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const safeName = slugify(productName || imageName || 'product');
  const fileName = `${Date.now()}-${safeName}.${extension}`;
  const path = `/contents/images/${fileName}`;
  const content = Buffer.from(base64Data, 'base64').toString('base64');

  await githubRequest({
    token,
    repo,
    path,
    branch: getEnv('GITHUB_BRANCH') || 'main',
    method: 'PUT',
    body: {
      message: `Admin image: ${fileName}`,
      content
    }
  });

  return `images/${fileName}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const token = getAuthToken(event);
  const tokenSecret = getEnv('ADMIN_TOKEN_SECRET') || getEnv('ADMIN_PASSWORD');
  if (!token || !tokenSecret || !verifyAdminToken(token, tokenSecret)) {
    return jsonResponse(401, { error: 'Unauthorized.' });
  }

  const body = parseJsonBody(event);
  if (!body || !body.product) {
    return jsonResponse(400, { error: 'Missing product data.' });
  }

  const repo = getEnv('GITHUB_REPO');
  const githubToken = getEnv('GITHUB_TOKEN');
  const branch = getEnv('GITHUB_BRANCH') || 'main';
  if (!repo || !githubToken) {
    return jsonResponse(500, { error: 'GitHub integration is not configured.' });
  }

  const product = body.product;
  const productName = String(product.name || '').trim();
  const price = Number(product.price);
  const discount = Number(product.discount || 0);

  if (!productName) {
    return jsonResponse(400, { error: 'Product name is required.' });
  }
  if (Number.isNaN(price) || price < 0) {
    return jsonResponse(400, { error: 'Price must be a non-negative number.' });
  }
  if (Number.isNaN(discount) || discount < 0 || discount > 100) {
    return jsonResponse(400, { error: 'Discount must be between 0 and 100.' });
  }

  try {
    const fileResponse = await githubRequest({
      token: githubToken,
      repo,
      path: '/contents/products.json',
      branch
    });
    const products = ensureProductsArray(JSON.parse(base64Decode(fileResponse.content || '')));
    const existingProduct = products.find((entry) => entry.id === Number(product.id));
    const duplicateName = products.find((entry) => entry.id !== Number(product.id) && String(entry.name || '').trim().toLowerCase() === productName.toLowerCase());

    if (duplicateName) {
      return jsonResponse(409, { error: 'A product with that name already exists.' });
    }

    const nextId = products.reduce((max, entry) => Math.max(max, Number(entry.id || 0)), 0) + 1;
    const newProduct = {
      ...product,
      id: existingProduct ? existingProduct.id : nextId,
      name: productName,
      category: String(product.category || '').trim() || 'Uncategorized',
      desc: String(product.desc || '').trim(),
      price,
      discount,
      premium: Boolean(product.premium),
      image: existingProduct?.image || product.image || ''
    };

    if (body.imageBase64 && body.imageName) {
      newProduct.image = await uploadImageToRepo({
        token: githubToken,
        repo,
        imageBase64: body.imageBase64,
        imageName: body.imageName,
        imageMime: body.imageMime,
        productName: productName
      });
    }

    const mergedProducts = existingProduct
      ? products.map((entry) => (entry.id === existingProduct.id ? newProduct : entry))
      : [...products, newProduct];

    const updatedContent = Buffer.from(JSON.stringify(mergedProducts, null, 2)).toString('base64');
    await githubRequest({
      token: githubToken,
      repo,
      path: '/contents/products.json',
      branch,
      method: 'PUT',
      body: {
        message: existingProduct ? `Admin edit: ${productName}` : `Admin add: ${productName}`,
        content: updatedContent,
        sha: fileResponse.sha,
        branch
      }
    });

    return jsonResponse(200, {
      ok: true,
      message: existingProduct ? 'Product updated successfully. Changes will publish in 1–2 minutes.' : 'Product added successfully. Changes will publish in 1–2 minutes.'
    });
  } catch (error) {
    return jsonResponse(500, { error: error.message || 'Unable to save the product right now.' });
  }
};
