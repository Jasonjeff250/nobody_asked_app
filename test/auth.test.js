const test = require('node:test');
const assert = require('node:assert/strict');

const { generateVerificationCode, hashPassword, verifyPassword, normalizeEmail, buildVerificationEmail } = require('../auth');

test('generateVerificationCode creates a 6-digit code', () => {
  const code = generateVerificationCode();
  assert.equal(typeof code, 'string');
  assert.equal(code.length, 6);
  assert.match(code, /^\d{6}$/);
});

test('hash and verify password round trip works', async () => {
  const password = 'StrongPass!123';
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  const match = await verifyPassword(password, hash);
  assert.equal(match, true);
});

test('normalizeEmail trims and lowercases email', () => {
  assert.equal(normalizeEmail('  User@Example.com  '), 'user@example.com');
});

test('buildVerificationEmail includes confirmation content and sender', () => {
  const email = buildVerificationEmail('123456', 'etimitah@gmail.com');
  assert.match(email.subject, /Verify your FrictionMap account/i);
  assert.match(email.text, /123456/);
  assert.match(email.from, /etimitah@gmail.com/i);
});
