const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function buildVerificationEmail(code, senderEmail = 'etimitah@gmail.com') {
  return {
    from: `FrictionMap <${senderEmail}>`,
    subject: 'Verify your FrictionMap account',
    text: `Welcome to FrictionMap.\n\nYour confirmation code is: ${code}\n\nEnter this code to verify your email and continue to your dashboard.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="margin-bottom: 12px;">Welcome to FrictionMap</h2>
        <p style="margin-bottom: 18px;">Use the code below to verify your email and continue to your workspace.</p>
        <div style="background: #f3f4ff; border: 1px solid #d7d9ff; border-radius: 10px; padding: 24px; text-align: center;">
          <div style="font-size: 12px; letter-spacing: 0.12em; color: #5d5d73; text-transform: uppercase;">Your confirmation code</div>
          <div style="font-size: 30px; font-weight: 700; letter-spacing: 8px; margin-top: 12px; color: #1f2937;">${code}</div>
        </div>
        <p style="margin-top: 18px; color: #4b5563;">This code expires soon, so use it promptly.</p>
      </div>
    `
  };
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  normalizeEmail,
  generateVerificationCode,
  hashPassword,
  verifyPassword,
  buildVerificationEmail,
  createSessionToken
};
