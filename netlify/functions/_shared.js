const crypto = require('crypto');
const zlib = require('zlib');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const LOGIN_RATE_LIMIT_MAX_FAILURES = 5;
const LOGIN_RATE_LIMIT_LOCKOUT_MS = 10 * 60 * 1000;
const loginAttempts = new Map();

function getEnv(name) {
  return process.env[name] || '';
}

function constantTimeCompare(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  try {
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
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

function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const direct = headers[name];
  const lowered = headers[name.toLowerCase()];
  return typeof direct === 'string' ? direct : typeof lowered === 'string' ? lowered : '';
}

function getClientIp(event) {
  const headers = event && event.headers ? event.headers : {};
  const candidates = [
    getHeader(headers, 'CF-Connecting-IP'),
    getHeader(headers, 'X-Forwarded-For'),
    getHeader(headers, 'X-Real-IP'),
    getHeader(headers, 'Client-IP'),
    getHeader(headers, 'X-NF-Client-Connection-IP')
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.split(',')[0].trim();
    }
  }
  return 'unknown';
}

function getLoginRateLimitStatus(event) {
  const ip = getClientIp(event);
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return { allowed: true, retryAfterMs: 0 };
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }
  if (entry.lockedUntil && entry.lockedUntil <= now) {
    loginAttempts.delete(ip);
  }
  return { allowed: true, retryAfterMs: 0 };
}

function recordLoginFailure(event) {
  const ip = getClientIp(event);
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }
  entry.count += 1;
  if (entry.count >= LOGIN_RATE_LIMIT_MAX_FAILURES) {
    entry.lockedUntil = now + LOGIN_RATE_LIMIT_LOCKOUT_MS;
  }
  loginAttempts.set(ip, entry);
  return {
    allowed: entry.count < LOGIN_RATE_LIMIT_MAX_FAILURES,
    retryAfterMs: entry.lockedUntil ? entry.lockedUntil - now : 0
  };
}

function resetLoginAttempts(event) {
  const ip = getClientIp(event);
  loginAttempts.delete(ip);
  return true;
}

function clearLoginRateLimitEntries() {
  loginAttempts.clear();
}

function appendVaryHeader(currentValue, value) {
  const values = [currentValue, value].filter(Boolean).join(',').split(',').map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(values)).join(', ');
}

function safeErrorMessage(message) {
  if (typeof message !== 'string') return 'Unable to process the request right now.';
  if (/rate limit/i.test(message)) return message;
  if (/unauthorized|forbidden|invalid|missing|not configured|not found/i.test(message)) return message;
  return 'Unable to process the request right now.';
}

function normalizeImageMime(value) {
  if (!value || typeof value !== 'string') return '';
  const mime = value.toLowerCase().trim();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

function validateImagePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Image payload is invalid.' };
  }

  const imageBase64 = typeof payload.imageBase64 === 'string' ? payload.imageBase64 : '';
  if (!imageBase64) {
    return { ok: true, mimeType: '', extension: '' };
  }

  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    return { ok: false, error: 'Image data must be a base64 data URL.' };
  }

  const mimeType = normalizeImageMime(match[1]);
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return { ok: false, error: 'Unsupported image type. Only PNG, JPEG, WEBP, and GIF images are supported.' };
  }

  const imageMime = normalizeImageMime(payload.imageMime);
  if (imageMime && imageMime !== mimeType) {
    return { ok: false, error: 'The provided image MIME type does not match the image data.' };
  }

  const base64Data = match[2];
  const normalizedBase64 = base64Data + '='.repeat((4 - (base64Data.length % 4)) % 4);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
    return { ok: false, error: 'Image data is not valid base64.' };
  }

  const imageBytes = Buffer.from(normalizedBase64, 'base64');
  if (!imageBytes.length) {
    return { ok: false, error: 'Image data is empty.' };
  }
  if (imageBytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image file is too large. Maximum size is 5MB.' };
  }

  const imageName = typeof payload.imageName === 'string' ? payload.imageName : '';
  const extension = (imageName.split('.').pop() || mimeType.split('/').pop() || 'png').replace(/[^a-z0-9]+/gi, '').toLowerCase();
  if (!extension) {
    return { ok: false, error: 'Image file name is invalid.' };
  }

  return { ok: true, mimeType, extension, bytes: imageBytes };
}

function pickCompressionEncoding(headers) {
  const acceptEncoding = getHeader(headers, 'Accept-Encoding') || '';
  if (!acceptEncoding) return '';
  const normalized = acceptEncoding.toLowerCase();
  if (normalized.includes('br')) return 'br';
  if (normalized.includes('gzip')) return 'gzip';
  return '';
}

function jsonResponse(statusCode, body, headers = {}, event = null) {
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
  const responseHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  };

  const contentType = responseHeaders['Content-Type'] || responseHeaders['content-type'] || 'application/json';
  const existingEncoding = responseHeaders['Content-Encoding'] || responseHeaders['content-encoding'];
  const negotiatedEncoding = existingEncoding ? '' : pickCompressionEncoding(event && event.headers ? event.headers : {});
  const shouldCompress = !existingEncoding && typeof bodyText === 'string' && Buffer.byteLength(bodyText, 'utf8') > 512 && /json|text|javascript|xml|svg/i.test(contentType) && (negotiatedEncoding === 'gzip' || negotiatedEncoding === 'br');

  if (shouldCompress) {
    const compressed = negotiatedEncoding === 'br'
      ? zlib.brotliCompressSync(Buffer.from(bodyText, 'utf8'))
      : zlib.gzipSync(Buffer.from(bodyText, 'utf8'));

    responseHeaders['Content-Encoding'] = negotiatedEncoding;
    responseHeaders['Vary'] = appendVaryHeader(responseHeaders['Vary'] || responseHeaders['vary'], 'Accept-Encoding');

    return {
      statusCode,
      headers: responseHeaders,
      body: compressed.toString('base64'),
      isBase64Encoded: true
    };
  }

  return {
    statusCode,
    headers: responseHeaders,
    body: bodyText
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

async function githubRequest({ token, repo, path, branch = getEnv('GITHUB_BRANCH') || 'main', method = 'GET', body = null }) {
  const url = new URL(`https://api.github.com/repos/${repo}${path}`);
  if (branch && path.startsWith('/contents/')) {
    url.searchParams.set('ref', branch);
  }

  const headers = buildGitHubHeaders(token);
  const requestBody = body ? { ...body } : null;
  if (requestBody && branch && path.startsWith('/contents/')) {
    requestBody.branch = branch;
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: requestBody ? JSON.stringify(requestBody) : undefined
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
    const message = data && (data.message || data.error) ? String(data.message || data.error) : 'GitHub request failed.';
    throw new Error(message.includes('rate limit') ? 'GitHub rate limit reached. Please try again later.' : message);
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
  constantTimeCompare,
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
  ensureProductsArray,
  safeErrorMessage,
  validateImagePayload,
  getClientIp,
  getLoginRateLimitStatus,
  recordLoginFailure,
  resetLoginAttempts,
  clearLoginRateLimitEntries
};
