const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

// Exchange a Supabase OAuth code server-side using the service role key.
// This route expects: GET /auth/supabase-callback?code=...&provider=google&redirect_to=...
// It will POST to SUPABASE_URL/auth/v1/token with Authorization: Bearer <SERVICE_ROLE_KEY>

router.get('/supabase-callback', async (req, res) => {
  try {
    const code = req.query.code;
    const redirect_to = req.query.redirect_to || req.query.redirect || req.query.redirectTo;
    const provider = req.query.provider || 'google';
    if (!code) return res.status(400).send('Missing code');
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_ROLE) return res.status(500).send('Supabase config missing on server');

    const tokenUrl = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token`;
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: code.toString() });
    if (redirect_to) body.append('redirect_to', redirect_to.toString());

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${SERVICE_ROLE}`
      },
      body: body.toString()
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error || tokenRes.status >= 400) {
      console.error('supabase token exchange error', tokenData);
      return res.status(400).json({ message: 'Token exchange failed', detail: tokenData });
    }

    // tokenData should contain access_token, refresh_token, expires_in, etc.
    // Optionally set a httpOnly cookie here if you want a server session.
    // Redirect to client app dashboard (or provided redirect_to)
    const CLIENT_APP = process.env.CLIENT_APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${CLIENT_APP.replace(/\/$/, '')}/dashboard.html`);
  } catch (err) {
    console.error('supabase-callback error', err);
    return res.status(500).send('Server error');
  }
});

module.exports = router;
