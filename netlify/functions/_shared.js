const crypto = require('crypto');

function getEnv(name) {
  return process.env[name] || '';
}

function createSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const base64 = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return Buffer.from(base64, 'base64');
}

function issueAdminToken(secret, ttlMs = 15 * 60 * 1000) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ttlMs;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = {
    v: 1,
    issuedAt,
    expiresAt,
    nonce,
    role: 'admin'
  };
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signature = createSignature(payloadPart, secret);
  return {
    token: `${payloadPart}.${signature}`,
    expiresAt
  };
}

function verifyAdminToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadPart, signature] = parts;
  const expected = createSignature(payloadPart, secret);
  if (signature.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(fromBase64Url(payloadPart).toString('utf8'));
    if (!payload || payload.v !== 1) return null;
    if (payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function getAuthToken(event) {
  const header = event.headers && (event.headers.authorization || event.headers.Authorization || '');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function parseJsonBody(event) {
  if (!event.body) return {};
  try {
    return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return null;
  }
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';
}

function buildGitHubHeaders(token) {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'swarnasundari-admin'
  };
}

async function githubRequest({ token, repo, path, method = 'GET', body = null }) {
  const url = `https://api.github.com/repos/${repo}${path}`;
  const headers = buildGitHubHeaders(token);
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!response.ok) {
    throw new Error(data && (data.message || data.error) ? String(data.message || data.error) : 'GitHub request failed.');
  }
  return data;
}

function base64Decode(value) {
  return Buffer.from(value, 'base64').toString('utf8');
}

function ensureProductsArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.products)) return raw.products;
  return [];
}

module.exports = {
  getEnv,
  createSignature,
  toBase64Url,
  fromBase64Url,
  issueAdminToken,
  verifyAdminToken,
  jsonResponse,
  getAuthToken,
  parseJsonBody,
  slugify,
  githubRequest,
  base64Decode,
  ensureProductsArray
};
