const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'replace_with_secret';

function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Not authenticated' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
  }
}

module.exports = authMiddleware;
