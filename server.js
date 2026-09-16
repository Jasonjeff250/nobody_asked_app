const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { normalizeEmail, generateVerificationCode, hashPassword, verifyPassword, buildVerificationEmail, createSessionToken } = require('./auth');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.SMTP_USER || 'etimitah@gmail.com';

const users = new Map();
const verificationCodes = new Map();

global.__appUsers = users;
global.__verificationCodes = verificationCodes;

const sessionStore = session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sessionStore);
app.use(express.static(__dirname));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'frictionmap', mode: 'auth-enabled' });
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ ok: false, error: 'Authentication required.' });
  }
  next();
}

async function sendVerificationEmail(email, code) {
  const smtpUser = process.env.SMTP_USER || SENDER_EMAIL;
  const smtpPass = process.env.SMTP_PASS || '';
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT || 587);

  if (!smtpPass) {
    console.log(`[auth-dev] Confirmation code for ${email}: ${code}`);
    console.log(`[auth-dev] Set SMTP_USER and SMTP_PASS in your .env file to send the email from ${SENDER_EMAIL}.`);
    return { devMode: true, message: 'SMTP not configured; code logged to server console.' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const message = buildVerificationEmail(code, SENDER_EMAIL);
  return transporter.sendMail({
    from: message.from,
    to: email,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
}

app.post('/api/auth/signup', async (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  const password = String(req.body?.password || '');

  if (!email || !email.includes('@') || password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Provide a valid email and a password with at least 8 characters.' });
  }

  if (users.has(email)) {
    return res.status(409).json({ ok: false, error: 'An account with that email already exists.' });
  }

  const code = generateVerificationCode();
  const passwordHash = await hashPassword(password);

  users.set(email, {
    email,
    passwordHash,
    verified: false,
    createdAt: new Date().toISOString()
  });

  verificationCodes.set(email, { code, createdAt: Date.now() });

  try {
    await sendVerificationEmail(email, code);
    return res.status(201).json({ ok: true, message: 'Confirmation code sent. Check your email to verify your account.' });
  } catch (error) {
    console.error('[auth] Confirmation email failed:', {
      message: error.message,
      code: error.code,
      responseCode: error.responseCode,
      command: error.command
    });
    verificationCodes.delete(email);
    users.delete(email);
    return res.status(500).json({ ok: false, error: 'Unable to send confirmation email. Please try again later.' });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  const code = String(req.body?.code || '');

  const record = verificationCodes.get(email);
  if (!record || record.code !== code) {
    return res.status(400).json({ ok: false, error: 'Invalid or expired verification code.' });
  }

  const user = users.get(email);
  if (!user) {
    return res.status(404).json({ ok: false, error: 'Account not found.' });
  }

  user.verified = true;
  verificationCodes.delete(email);
  req.session.userId = email;
  const token = createSessionToken();
  req.session.token = token;

  return res.json({ ok: true, message: 'Email verified successfully.', user: { email: user.email } });
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  const password = String(req.body?.password || '');

  const user = users.get(email);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'User not found.' });
  }

  if (!user.verified) {
    return res.status(403).json({ ok: false, error: 'Please verify your email before signing in.' });
  }

  const match = await verifyPassword(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ ok: false, error: 'Incorrect password.' });
  }

  const token = createSessionToken();
  req.session.userId = email;
  req.session.token = token;

  return res.json({ ok: true, message: 'Login successful.', user: { email: user.email } });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true, message: 'Logged out.' });
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const email = req.session.userId;
  const user = users.get(email);
  res.json({ ok: true, user: user ? { email: user.email, verified: user.verified } : null });
});

app.get('/api/app', requireAuth, (req, res) => {
  res.json({ ok: true, message: 'Authenticated access granted to the FrictionMap app.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`FrictionMap server running on http://${HOST}:${PORT}`);
});
