/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

// Receive client-side error reports — no auth required (errors can occur pre-login)
router.post('/', (req, res) => {
  const { type, message, stack, componentStack, url, line, col, userAgent } = req.body;

  // Ignore noise: browser extension errors and empty messages
  if (!message || message.includes('extension://') || message.includes('chrome-extension')) {
    return res.json({ ok: true });
  }

  logger.error({
    source: 'client',
    type: type || 'uncaught',
    message,
    stack,
    componentStack,
    url,
    line,
    col,
    userAgent,
    ip: req.ip,
  }, 'Client error reported');

  res.json({ ok: true });
});

export default router;
