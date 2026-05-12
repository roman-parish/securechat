/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Verify the account still exists and is not banned. A valid JWT is not
  // enough — admins can ban users between token issuance and expiry.
  try {
    const user = await User.findById(decoded.userId).select('banned').lean();
    if (!user || user.banned) {
      return res.status(401).json({ error: 'Account suspended' });
    }
  } catch {
    return res.status(503).json({ error: 'Service unavailable' });
  }

  req.user = decoded;
  next();
}

export function requireAdmin(req, res, next) {
  const admins = (process.env.ADMIN_USERNAMES || '')
    .split(',')
    .map(u => u.trim().toLowerCase())
    .filter(Boolean);
  if (!admins.includes(req.user?.username?.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
