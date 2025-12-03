const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const nodemailer = require('nodemailer');
const User = require('../models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'replace_with_secret';
const COOKIE_NAME = process.env.COOKIE_NAME || 'token';
const COOKIE_MAX_AGE = parseInt(process.env.COOKIE_MAX_AGE || '604800000', 10); // 7 days
const BASE_URL = process.env.BASE_URL || `http://localhost:4000`;
const BACKEND_URL = process.env.BACKEND_URL || BASE_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:3000`;
const EMAIL_EXPIRES_IN = process.env.EMAIL_EXPIRES_IN || '15m';

function signToken(user) {
  return jwt.sign({ id: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

async function createVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendVerificationEmail(user, token) {
  const frontendVerify = `${FRONTEND_URL.replace(/\/$/,'')}/verify-email.html?token=${encodeURIComponent(token)}`;
  const backendVerify = `${BACKEND_URL.replace(/\/$/,'')}/auth/verify-email?token=${encodeURIComponent(token)}`;

  const linkToSend = (process.env.VERIFY_USING_BACKEND === 'true') ? backendVerify : frontendVerify;

  // If SMTP is configured, try to send an email. Otherwise log link for dev.
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || 'no-reply@example.com',
        to: user.email,
        subject: 'Verify your email',
        text: `Click to verify your email: ${linkToSend}`,
        html: `<p>Click to verify your email:</p><p><a href="${linkToSend}">${linkToSend}</a></p>`
      });
      console.log('Verification email sent:', info.messageId);
      return true;
    } catch (err) {
      console.error('Failed to send verification email:', err);
      return false;
    }
  }

  // No SMTP configured — log and return the link for dev
  console.warn('SMTP not configured — verification link: ', linkToSend);
  return linkToSend;
}

async function register(req, res) {
  try {
    const { fullName, email, password } = req.body;
    if (!email || !password || !fullName) return res.status(400).json({ message: 'Missing fields' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const verificationToken = await createVerificationToken();
    const verificationExpires = new Date(Date.now() + (parseDurationMs(EMAIL_EXPIRES_IN)));

    const user = await User.create({ fullName, email, password: hashed, createdAt: new Date(), verificationToken, verificationExpires, emailVerified: false });

    const sendResult = await sendVerificationEmail(user, verificationToken);

    const response = { id: user._id, fullName: user.fullName, email: user.email };
    if (process.env.NODE_ENV !== 'production') response.devLink = sendResult;
    return res.status(201).json({ message: 'Registered. Check your email to verify your account.', ...response });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

function parseDurationMs(str) {
  // supports formats like '15m', '1h', or milliseconds number
  if (!str) return 15 * 60 * 1000;
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const m = str.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return 15 * 60 * 1000;
  const val = parseInt(m[1], 10);
  switch (m[2]) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}

async function verifyEmail(req, res) {
  try {
    const token = req.query.token;
    if (!token) return res.redirect(`${FRONTEND_URL.replace(/\/$/,'')}/verify-email.html?status=invalid`);
    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      // If the request expects JSON, return json
      if ((req.headers['accept'] || '').includes('application/json') || req.query.api === '1') {
        return res.status(400).json({ status: 'invalid', message: 'Invalid or missing token' });
      }
      return res.redirect(`${FRONTEND_URL.replace(/\/$/,'')}/verify-email.html?status=invalid`);
    }
    if (!user.verificationExpires || user.verificationExpires < new Date()) {
      // clear expired token
      user.verificationToken = undefined;
      user.verificationExpires = undefined;
      await user.save();
      if ((req.headers['accept'] || '').includes('application/json') || req.query.api === '1') {
        return res.status(400).json({ status: 'expired', message: 'Token expired' });
      }
      return res.redirect(`${FRONTEND_URL.replace(/\/$/,'')}/verify-email.html?status=expired`);
    }
    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save();

    // Optionally sign them in by setting cookie
    const tokenJwt = signToken(user);
    res.cookie(COOKIE_NAME, tokenJwt, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: COOKIE_MAX_AGE, sameSite: 'lax' });

    if ((req.headers['accept'] || '').includes('application/json') || req.query.api === '1') {
      return res.json({ status: 'success', message: 'Email verified' });
    }
    return res.redirect(`${FRONTEND_URL.replace(/\/$/,'')}/verify-email.html?status=success`);
  } catch (err) {
    console.error('verifyEmail error', err);
    if ((req.headers['accept'] || '').includes('application/json') || req.query.api === '1') {
      return res.status(500).json({ status: 'error', message: 'Server error' });
    }
    return res.redirect(`${FRONTEND_URL.replace(/\/$/,'')}/verify-email.html?status=error`);
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
    const user = await User.findOne({ email });
    if (!user || !user.password) return res.status(400).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });
    // Optionally require email verification
    if (!user.emailVerified) return res.status(403).json({ message: 'Email not verified. Please check your inbox.' });
    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: COOKIE_MAX_AGE, sameSite: 'lax' });
    return res.json({ id: user._id, fullName: user.fullName, email: user.email });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function logout(req, res) {
  res.clearCookie(COOKIE_NAME);
  return res.json({ ok: true });
}

async function me(req, res) {
  try {
    const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Not authenticated' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id).select('-password -__v');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

async function resendVerification(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Missing email' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailVerified) return res.status(400).json({ message: 'Email already verified' });

    const verificationToken = await createVerificationToken();
    const verificationExpires = new Date(Date.now() + (parseDurationMs(EMAIL_EXPIRES_IN)));
    user.verificationToken = verificationToken;
    user.verificationExpires = verificationExpires;
    await user.save();

    const sendResult = await sendVerificationEmail(user, verificationToken);
    const response = { message: 'Verification email sent' };
    if (process.env.NODE_ENV !== 'production') response.devLink = sendResult;
    return res.json(response);
  } catch (err) {
    console.error('resendVerification error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Google OAuth: redirect user to Google consent screen
function googleAuth(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${BASE_URL}/auth/google/callback`;
  const scope = encodeURIComponent('openid email profile');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&access_type=offline&prompt=consent`;
  return res.redirect(url);
}

// Google callback: exchange code -> tokens -> userinfo
async function googleCallback(req, res) {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${BASE_URL}/auth/google/callback`,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error('token exchange error', tokenData);
      return res.status(400).json({ message: 'Token exchange failed', error: tokenData });
    }

    // get userinfo
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await userinfoRes.json();
    if (!profile || !profile.id) return res.status(400).json({ message: 'Failed to fetch profile' });

    // find or create user by googleId
    let user = await User.findOne({ googleId: profile.id });
    if (!user) {
      // create new user; store googleId and email/fullName; mark emailVerified true
      user = await User.create({ googleId: profile.id, email: profile.email, fullName: profile.name, createdAt: new Date(), emailVerified: true });
    }

    // sign JWT and set cookie
    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: COOKIE_MAX_AGE, sameSite: 'lax' });

    // redirect to client dashboard
    return res.redirect(`${process.env.CLIENT_APP_URL || FRONTEND_URL}/dashboard.html`);
  } catch (err) {
    console.error('google callback error', err);
    return res.status(500).send('OAuth callback error');
  }
}

module.exports = { register, login, logout, me, googleAuth, googleCallback, verifyEmail, resendVerification };
