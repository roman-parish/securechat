/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Resend } from 'resend';
import Settings from '../models/Settings.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.EMAIL_FROM || 'SecureChat <noreply@example.com>';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost';

// Returns true if this email type is permitted by both system settings and the user's own prefs.
// type: 'loginNotification' | 'passwordChanged' | 'securityAlerts'
// userPrefs: user.emailPrefs (may be undefined for older accounts — default to true)
export async function emailAllowed(type, userPrefs) {
  try {
    const settings = await Settings.findOne().lean();
    const sys = settings?.email ?? {};
    if (sys.enabled === false) return false;
    if (sys[type] === false) return false;
  } catch {
    // If DB check fails, don't block email
  }
  if (userPrefs && userPrefs[type] === false) return false;
  return true;
}

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

/* ── Shared branded shell ─────────────────────────────────────────────────── */
function emailBase({ preheader, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>SecureChat</title>
</head>
<body style="margin:0;padding:0;background:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!--[if !mso]><!-->
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#0f0f13;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </span>
  <!--<![endif]-->

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0f13;padding:40px 16px;min-width:320px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;">

          <!-- Logo header -->
          <tr>
            <td align="center" style="background:#161620;border-radius:16px 16px 0 0;padding:28px 32px 24px;border:1px solid #2a2a3a;border-bottom:none;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <div style="width:40px;height:40px;background:rgba(108,99,255,0.18);border-radius:12px;display:inline-block;text-align:center;line-height:40px;">
                      <img src="${CLIENT_URL}/icons/icon-96.png" width="26" height="26" alt="SecureChat" style="vertical-align:middle;border:0;display:inline-block;margin-top:7px;"/>
                    </div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="color:#f0f0f8;font-size:22px;font-weight:700;letter-spacing:-0.02em;">SecureChat</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Accent divider -->
          <tr>
            <td style="background:#6c63ff;height:3px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="background:#161620;padding:36px 36px 28px;border-radius:0 0 16px 16px;border:1px solid #2a2a3a;border-top:none;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 8px;">
              <p style="margin:0 0 6px;font-size:12px;color:#555568;">
                SecureChat &mdash; End-to-end encrypted messaging
              </p>
              <p style="margin:0;font-size:12px;color:#555568;">
                <a href="${CLIENT_URL}" style="color:#6c63ff;text-decoration:none;">${CLIENT_URL}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* Reusable pieces */
function greeting(name) {
  return `<p style="margin:0 0 16px;font-size:15px;color:#c8c8d8;">Hi ${name},</p>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 14px;font-size:15px;color:#c8c8d8;line-height:1.6;">${text}</p>`;
}

function ctaButton(href, label) {
  return `
  <table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
    <tr>
      <td align="center" style="background:#6c63ff;border-radius:10px;">
        <a href="${href}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.01em;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function infoTable(rows) {
  const cells = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#8888a8;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;color:#f0f0f8;word-break:break-word;">${value}</td>
    </tr>`).join('');
  return `
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f0f13;border-radius:10px;border:1px solid #2a2a3a;margin:20px 0;overflow:hidden;">
    ${cells}
  </table>`;
}

function alertBox(text, color = '#ff5757') {
  const bg = color === '#ff5757' ? 'rgba(255,87,87,0.1)' : 'rgba(108,99,255,0.1)';
  const border = color === '#ff5757' ? 'rgba(255,87,87,0.3)' : 'rgba(108,99,255,0.3)';
  return `<p style="margin:16px 0;padding:12px 16px;background:${bg};border:1px solid ${border};border-radius:10px;font-size:13px;color:${color};line-height:1.5;">${text}</p>`;
}

function divider() {
  return `<div style="height:1px;background:#2a2a3a;margin:24px 0;"></div>`;
}

function smallText(text) {
  return `<p style="margin:0 0 10px;font-size:12px;color:#8888a8;line-height:1.5;">${text}</p>`;
}

/* ── Email senders ────────────────────────────────────────────────────────── */

export async function sendLoginNotification({ to, displayName, ip, userAgent, time }) {
  await send({
    to,
    subject: 'New sign-in to your SecureChat account',
    html: emailBase({
      preheader: `A new sign-in was detected on your account at ${time}.`,
      body: `
        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#f0f0f8;">New sign-in detected</h2>
        ${greeting(displayName)}
        ${paragraph('A new sign-in to your SecureChat account was detected.')}
        ${infoTable([
          ['Time', time],
          ['IP Address', ip],
          ['Device', userAgent],
        ])}
        ${paragraph('If this was you, no action is needed.')}
        ${alertBox('If you don\'t recognize this activity, <strong>change your password immediately</strong>.')}
        ${divider()}
        ${smallText(`You can manage your account security at <a href="${CLIENT_URL}" style="color:#6c63ff;">${CLIENT_URL}</a>.`)}
      `,
    }),
  });
}

export async function sendPasswordChangedNotification({ to, displayName, time }) {
  await send({
    to,
    subject: 'Your SecureChat password was changed',
    html: emailBase({
      preheader: 'Your SecureChat password was successfully changed.',
      body: `
        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#f0f0f8;">Password changed</h2>
        ${greeting(displayName)}
        ${paragraph(`Your SecureChat password was successfully changed on ${time}.`)}
        ${paragraph('All other active sessions have been signed out.')}
        ${alertBox('If you did not make this change, contact your administrator immediately and reset your password.')}
        ${divider()}
        ${smallText(`Manage your account at <a href="${CLIENT_URL}" style="color:#6c63ff;">${CLIENT_URL}</a>.`)}
      `,
    }),
  });
}

export async function sendAccountDeletedNotification({ to, displayName }) {
  await send({
    to,
    subject: 'Your SecureChat account has been deleted',
    html: emailBase({
      preheader: 'Your SecureChat account and all associated data have been permanently deleted.',
      body: `
        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#f0f0f8;">Account deleted</h2>
        ${greeting(displayName)}
        ${paragraph('Your SecureChat account and all associated data have been permanently deleted.')}
        ${alertBox('If you did not request this deletion, contact your administrator immediately.')}
        ${divider()}
        ${smallText('This action cannot be undone.')}
      `,
    }),
  });
}

export async function sendInviteEmail({ to, inviteUrl, displayName, expiresAt }) {
  const expiry = new Date(expiresAt).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  await send({
    to,
    subject: "You've been invited to SecureChat",
    html: emailBase({
      preheader: "You've been invited to join SecureChat — end-to-end encrypted messaging.",
      body: `
        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#f0f0f8;">You're invited!</h2>
        ${displayName ? greeting(displayName) : ''}
        ${paragraph("You've been invited to join <strong>SecureChat</strong> &mdash; private, end-to-end encrypted messaging.")}
        ${ctaButton(inviteUrl, 'Accept Invitation')}
        ${divider()}
        ${smallText(`This invitation expires on <strong>${expiry}</strong> and can only be used once.`)}
        ${smallText('If you weren\'t expecting this, you can safely ignore this email.')}
      `,
    }),
  });
}

export async function sendTwoFactorDisabledNotification({ to, displayName, time }) {
  await send({
    to,
    subject: 'Two-factor authentication was disabled on your account',
    html: emailBase({
      preheader: '2FA has been disabled on your SecureChat account.',
      body: `
        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#f0f0f8;">2FA disabled</h2>
        ${greeting(displayName)}
        ${paragraph(`Two-factor authentication was disabled on your SecureChat account on ${time}.`)}
        ${paragraph('Your account is now protected by password only.')}
        ${alertBox('If you did not make this change, contact your administrator immediately and change your password.')}
        ${divider()}
        ${smallText(`Re-enable 2FA in your security settings at <a href="${CLIENT_URL}" style="color:#6c63ff;">${CLIENT_URL}</a>.`)}
      `,
    }),
  });
}

export async function sendEmailVerification({ to, displayName, verifyUrl }) {
  await send({
    to,
    subject: 'Verify your SecureChat email address',
    html: emailBase({
      preheader: 'Confirm your email address to activate your SecureChat account.',
      body: `
        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#f0f0f8;">Verify your email</h2>
        ${greeting(displayName)}
        ${paragraph('Thanks for signing up for SecureChat. Click the button below to verify your email address and activate your account.')}
        ${ctaButton(verifyUrl, 'Verify Email Address')}
        ${divider()}
        ${smallText("If you didn't create a SecureChat account, you can safely ignore this email.")}
        ${smallText('This verification link expires in 24 hours.')}
      `,
    }),
  });
}

export async function sendPasswordResetEmail({ to, displayName, resetUrl }) {
  await send({
    to,
    subject: 'Reset your SecureChat password',
    html: emailBase({
      preheader: 'We received a request to reset your SecureChat password.',
      body: `
        <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#f0f0f8;">Reset your password</h2>
        ${greeting(displayName)}
        ${paragraph('We received a request to reset your SecureChat password. Click the button below to choose a new one.')}
        ${ctaButton(resetUrl, 'Reset Password')}
        ${divider()}
        ${smallText('This link expires in <strong>1 hour</strong>.')}
        ${smallText("If you didn't request a password reset, you can safely ignore this email — your password won't change.")}
      `,
    }),
  });
}
