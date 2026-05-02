/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.EMAIL_FROM || 'SecureChat <noreply@w5rcp.com>';
const CLIENT_URL = process.env.CLIENT_URL || 'https://securechat.w5rcp.com';

async function send({ to, subject, html }) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping email to', to);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error('[email] Failed to send to', to, err?.message);
  }
}

export async function sendLoginNotification({ to, displayName, ip, userAgent, time }) {
  await send({
    to,
    subject: 'New sign-in to your SecureChat account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 16px">New sign-in detected</h2>
        <p>Hi ${displayName},</p>
        <p>A new sign-in to your SecureChat account was detected.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:6px 0;color:#666">Time</td><td>${time}</td></tr>
          <tr><td style="padding:6px 0;color:#666">IP Address</td><td>${ip}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Device</td><td style="word-break:break-all">${userAgent}</td></tr>
        </table>
        <p>If this was you, no action is needed.</p>
        <p>If you don't recognize this sign-in, change your password immediately at <a href="${CLIENT_URL}">${CLIENT_URL}</a>.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
        <p style="font-size:12px;color:#999">SecureChat — End-to-end encrypted messaging</p>
      </div>
    `,
  });
}

export async function sendPasswordChangedNotification({ to, displayName, time }) {
  await send({
    to,
    subject: 'Your SecureChat password was changed',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 16px">Password changed</h2>
        <p>Hi ${displayName},</p>
        <p>Your SecureChat password was successfully changed on ${time}.</p>
        <p>All other devices have been logged out.</p>
        <p>If you did not make this change, contact your administrator immediately.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
        <p style="font-size:12px;color:#999">SecureChat — End-to-end encrypted messaging</p>
      </div>
    `,
  });
}

export async function sendAccountDeletedNotification({ to, displayName }) {
  await send({
    to,
    subject: 'Your SecureChat account has been deleted',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 16px">Account deleted</h2>
        <p>Hi ${displayName},</p>
        <p>Your SecureChat account and all associated data have been permanently deleted.</p>
        <p>If you did not request this, contact your administrator immediately.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
        <p style="font-size:12px;color:#999">SecureChat — End-to-end encrypted messaging</p>
      </div>
    `,
  });
}
