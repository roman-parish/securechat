/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */

const REQUIRED = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'MONGO_URI',
  'CLIENT_URL',
];

const OPTIONAL_WARN = [
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'RESEND_API_KEY',
];

// Refuse to start in production with these docker-compose fallback placeholders.
// If any of these reach a live deployment the app is trivially exploitable.
const INSECURE_DEFAULTS = new Set([
  'change_this_jwt_secret_in_production',
  'change_this_refresh_secret_in_production',
  'securechat_secret',
  'redis_secret',
]);

export function validateEnv(logger) {
  const missing = REQUIRED.filter(key => !process.env[key]);

  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    if (logger) logger.fatal({ missing }, msg);
    else console.error(`\n❌ FATAL: ${msg}\n`);
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    const insecure = REQUIRED.filter(key => INSECURE_DEFAULTS.has(process.env[key]));
    if (insecure.length > 0) {
      const msg = `Production startup blocked — default placeholder secrets detected: ${insecure.join(', ')}. Set real values in your .env file.`;
      if (logger) logger.fatal({ insecure }, msg);
      else console.error(`\n❌ FATAL: ${msg}\n`);
      process.exit(1);
    }
  }

  const missingOptional = OPTIONAL_WARN.filter(key => !process.env[key]);
  if (missingOptional.length > 0) {
    const msg = `Optional env vars not set (push notifications disabled): ${missingOptional.join(', ')}`;
    if (logger) logger.warn({ missingOptional }, msg);
    else console.warn(`⚠️  ${msg}`);
  }
}
