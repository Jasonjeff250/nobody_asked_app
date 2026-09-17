const crypto = require('crypto');
const nodemailer = require('nodemailer');
const {
  normalizeEmail,
  generateVerificationCode,
  hashPassword,
  verifyPassword,
  buildVerificationEmail
} = require('../auth');

const users = global.__appUsers || (global.__appUsers = new Map());
const verificationCodes = global.__verificationCodes || (global.__verificationCodes = new Map());
const sessions = global.__appSessions || (global.__appSessions = new Map());
const senderEmail = process.env.SENDER_EMAIL || process.env.SMTP_USER || 'etimitah@gmail.com';

function getCookie(request, name) {
  const cookies = String(request.headers.cookie || '').split(';');
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : '';
}

function setSession(response, email) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, email);
  response.headers['Set-Cookie'] = `frictionmap_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`;
}

function currentUser(request) {
  const email = sessions.get(getCookie(request, 'frictionmap_session'));
  return email ? users.get(email) : null;
}

async function sendVerificationEmail(email, code) {
  const smtpPass = process.env.SMTP_PASS || '';
  if (!smtpPass) throw new Error('SMTP_PASS is not configured in Netlify environment variables.');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER || senderEmail,
      pass: smtpPass
    }
  });

  const message = buildVerificationEmail(code, senderEmail);
  return transporter.sendMail({ ...message, to: email });
}

module.exports = async function handler(request, response) {
  const route = String(request.path || '').replace(/^\/api\/auth\/?/, '').replace(/^\/?auth\/?/, '');
  const email = normalizeEmail(request.body?.email || '');

  if (request.method === 'POST' && route === 'signup') {
    const password = String(request.body?.password || '');
    if (!email || !email.includes('@') || password.length < 8) {
      return response.status(400).json({ ok: false, error: 'Provide a valid email and a password with at least 8 characters.' });
    }
    if (users.has(email)) return response.status(409).json({ ok: false, error: 'An account with that email already exists.' });

    const code = generateVerificationCode();
    users.set(email, { email, passwordHash: await hashPassword(password), verified: false });
    verificationCodes.set(email, { code, createdAt: Date.now() });
    try {
      await sendVerificationEmail(email, code);
      return response.status(201).json({ ok: true, message: 'Confirmation code sent. Check your email to verify your account.' });
    } catch (error) {
      users.delete(email);
      verificationCodes.delete(email);
      console.error('[auth] Confirmation email failed:', error.message);
      return response.status(503).json({ ok: false, error: 'Unable to send confirmation email. Check the Netlify SMTP environment variables.' });
    }
  }

  if (request.method === 'POST' && route === 'verify') {
    const record = verificationCodes.get(email);
    if (!record || record.code !== String(request.body?.code || '')) return response.status(400).json({ ok: false, error: 'Invalid or expired verification code.' });
    const user = users.get(email);
    if (!user) return response.status(404).json({ ok: false, error: 'Account not found.' });
    user.verified = true;
    verificationCodes.delete(email);
    setSession(response, email);
    return response.json({ ok: true, message: 'Email verified successfully.', user: { email } });
  }

  if (request.method === 'POST' && route === 'login') {
    const user = users.get(email);
    if (!user) return response.status(401).json({ ok: false, error: 'User not found.' });
    if (!user.verified) return response.status(403).json({ ok: false, error: 'Please verify your email before signing in.' });
    if (!await verifyPassword(String(request.body?.password || ''), user.passwordHash)) return response.status(401).json({ ok: false, error: 'Incorrect password.' });
    setSession(response, email);
    return response.json({ ok: true, message: 'Login successful.', user: { email } });
  }

  if (request.method === 'POST' && route === 'logout') {
    sessions.delete(getCookie(request, 'frictionmap_session'));
    response.headers['Set-Cookie'] = 'frictionmap_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
    return response.json({ ok: true, message: 'Logged out.' });
  }

  if (request.method === 'GET' && route === 'me') {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ ok: false, error: 'Authentication required.' });
    return response.json({ ok: true, user: { email: user.email, verified: user.verified } });
  }

  return response.status(404).json({ ok: false, error: 'Auth endpoint not found.' });
};