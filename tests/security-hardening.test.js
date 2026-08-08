const test = require('node:test');
const assert = require('node:assert/strict');
const { constantTimeCompare, validateImagePayload, safeErrorMessage, verifyAdminToken, issueAdminToken, getLoginRateLimitStatus, recordLoginFailure, resetLoginAttempts, clearLoginRateLimitEntries } = require('../netlify/functions/_shared');

test('constantTimeCompare returns true for matching secrets and false for mismatches', () => {
  assert.equal(constantTimeCompare('secret', 'secret'), true);
  assert.equal(constantTimeCompare('secret', 'other'), false);
});

test('validateImagePayload rejects unsupported or oversized image data', () => {
  const good = validateImagePayload({ imageBase64: 'data:image/png;base64,AA==', imageName: 'photo.png', imageMime: 'image/png' });
  assert.equal(good.ok, true);
  assert.equal(good.mimeType, 'image/png');

  const badMime = validateImagePayload({ imageBase64: 'data:text/plain;base64,AA==', imageName: 'notes.txt', imageMime: 'text/plain' });
  assert.equal(badMime.ok, false);
  assert.match(badMime.error, /unsupported/i);

  const huge = validateImagePayload({ imageBase64: `data:image/png;base64,${'A'.repeat(7 * 1024 * 1024)}`, imageName: 'huge.png', imageMime: 'image/png' });
  assert.equal(huge.ok, false);
  assert.match(huge.error, /too large/i);
});

test('safeErrorMessage avoids leaking internal details', () => {
  assert.equal(safeErrorMessage('Unexpected token X in JSON at position 1'), 'Unable to process the request right now.');
  assert.equal(safeErrorMessage('GitHub rate limit reached. Please try again later.'), 'GitHub rate limit reached. Please try again later.');
});

test('verifyAdminToken rejects malformed and expired tokens', () => {
  const token = issueAdminToken('secret', 60_000).token;
  assert.ok(verifyAdminToken(token, 'secret'));
  assert.equal(verifyAdminToken('not-a-valid-token', 'secret'), null);
  assert.equal(verifyAdminToken(`${token}.tampered`, 'secret'), null);
});

test('login rate limiting blocks repeated failures per IP', () => {
  clearLoginRateLimitEntries();
  const event = { headers: { 'x-forwarded-for': '203.0.113.10' } };

  for (let index = 0; index < 4; index += 1) {
    const result = recordLoginFailure(event);
    assert.equal(result.allowed, true);
  }

  const blocked = recordLoginFailure(event);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);

  const status = getLoginRateLimitStatus(event);
  assert.equal(status.allowed, false);
  assert.ok(status.retryAfterMs > 0);

  resetLoginAttempts(event);
  assert.equal(getLoginRateLimitStatus(event).allowed, true);
});
