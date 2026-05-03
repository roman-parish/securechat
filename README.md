# SecureChat

> End-to-end encrypted messaging — built for privacy.

A self-hosted, fully encrypted messaging PWA. Messages are encrypted on your device before sending. The server only ever stores ciphertext — nobody but you and your contacts can read your messages.

## Screenshots

<p float="left">
  <img src="docs/screenshots/login.jpeg" width="180" />
  <img src="docs/screenshots/register.jpeg" width="180" />
  <img src="docs/screenshots/conversations.jpeg" width="180" />
  <img src="docs/screenshots/chat.jpeg" width="180" />
</p>

<p float="left">
  <img src="docs/screenshots/user-profile.jpeg" width="180" />
  <img src="docs/screenshots/settings-profile.jpeg" width="180" />
  <img src="docs/screenshots/settings-notifications.jpeg" width="180" />
  <img src="docs/screenshots/settings-appearance.jpeg" width="180" />
</p>

<p float="left">
  <img src="docs/screenshots/settings-security.jpeg" width="180" />
  <img src="docs/screenshots/admin.jpeg" width="180" />
</p>

## Features

### Messaging
- 🔒 **End-to-end encryption** — RSA-OAEP 2048-bit key exchange + AES-256-GCM message encryption
- 💬 **Real-time messaging** — instant delivery via Socket.IO
- 🎤 **Encrypted voice messages** — record and send voice clips, encrypted before upload
- 🖼️ **Encrypted image & file sharing** — files encrypted client-side, auth-protected downloads, full-screen lightbox
- 📋 **Paste to attach** — paste an image from clipboard directly into the chat input
- ↩️ **Replies, reactions, edit & delete** — full message management
- 📱 **Swipe to reply** — swipe right on any message on mobile
- ✅ **Delivery receipts** — sent, delivered, and read tick states
- 🔍 **Message search** — search by sender or filename with jump-to-message

### Conversations
- 👥 **Group chats** — admin controls, member management, online member count
- 📨 **Group invitations** — invite users with an accept/decline flow
- 🔕 **Conversation muting** — suppress push notifications per conversation
- 📦 **Conversation archive** — hide conversations without deleting; auto-unarchives on new message
- 🚫 **User blocking** — block users from messaging you; manage from profile settings
- 💬 **Unread jump button** — shows unread count, jumps to first unread message

### Notifications & Presence
- 🔔 **Push notifications** — desktop and iOS (16.4+)
- 📧 **Email notifications** — login alerts, password changes, account deletion (via Resend)
- 👁️ **Last seen timestamps** — shows when a contact was last online
- ⌨️ **Typing indicators** — real-time typing state per conversation

### Privacy & Account
- 🔐 **Two-factor authentication** — TOTP with recovery codes, trusted devices, and admin reset
- 🔑 **Password reset via email** — self-serve password reset link with 1-hour expiry
- 🗑️ **Account self-deletion** — permanently delete your account and all data (GDPR compliant)
- 🔑 **Password-protected key backup** — log in from any device, keys restore automatically
- 🌙 **Light/dark mode** — per-user preference saved locally

### Platform
- 📱 **PWA** — installable on iOS and Android, works offline
- 🛡️ **Admin panel** — user management, ban/suspend, reset passwords, 2FA reset, usage stats
- 📋 **Audit log** — full log of admin actions with timestamps
- 🔗 **Invite links** — time-limited single-use invite links with optional email delivery
- 🔒 **Registration control** — open or close registration from the admin panel
- 🔐 **Let's Encrypt SSL** — automatic HTTPS via setup script

## Encryption Architecture

1. On register — RSA-OAEP 2048-bit keypair generated in the browser
2. Private key wrapped with AES-256-GCM key derived from your password via PBKDF2 (100k iterations)
3. Encrypted private key stored on server — useless without your password
4. On login — encrypted key material fetched, unwrapped locally with your password
5. Messages encrypted with a per-message AES-256-GCM key, wrapped with each recipient's RSA public key
6. File attachments encrypted client-side before upload with a per-file AES-256-GCM key

**Your private key never leaves your device unencrypted. The server cannot read your messages or files.**

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Socket.IO client, Web Crypto API |
| Backend | Node.js + Express, Socket.IO, Pino logging |
| Database | MongoDB |
| Cache / Presence | Redis |
| Proxy | Nginx (HTTPS + CSP) |
| Infrastructure | Docker + Docker Compose |

## Quick Start

### Requirements
- Docker & Docker Compose
- A Linux server (Ubuntu 22.04 recommended)

### First time setup

```bash
git clone https://github.com/roman-parish/securechat.git
cd securechat
./setup.sh
```

`setup.sh` will automatically:
- Generate JWT secrets
- Generate VAPID keys for push notifications
- Obtain a Let's Encrypt SSL certificate (pass `--domain yourdomain.com`)
- Start all containers

### Deploying updates

```bash
git pull
./deploy.sh
```

Or just push to `main` — GitHub Actions auto-deploys to your server.

## Configuration

Copy `.env.example` to `.env` and fill in your values. The full reference:

```env
# ── Database ────────────────────────────────────────────────────────────────
MONGO_USER=admin
MONGO_PASSWORD=change_this_mongo_password

# ── Redis ───────────────────────────────────────────────────────────────────
REDIS_PASSWORD=change_this_redis_password

# ── JWT Secrets (generate with: openssl rand -hex 64) ───────────────────────
JWT_SECRET=change_this_jwt_secret_in_production
JWT_REFRESH_SECRET=change_this_refresh_secret_in_production

# ── Web Push / VAPID (generate with: npx web-push generate-vapid-keys) ──────
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=admin@yourdomain.com

# ── Email — Resend (https://resend.com) ─────────────────────────────────────
# Required for: login alerts, password reset, 2FA notifications, invite emails
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=SecureChat <noreply@yourdomain.com>

# ── App URL ─────────────────────────────────────────────────────────────────
# Used for CORS, push notification links, and password reset emails
CLIENT_URL=https://yourdomain.com

# ── Ports ───────────────────────────────────────────────────────────────────
HTTP_PORT=80
HTTPS_PORT=443

# ── Admin ───────────────────────────────────────────────────────────────────
# Comma-separated usernames that have access to the admin panel
# Controls both the admin button in the UI and the backend admin API
ADMIN_USERNAMES=yourusername

# ── Node environment ────────────────────────────────────────────────────────
NODE_ENV=production
```

> **Never commit your `.env` file.** All secrets should be generated fresh — never use the placeholder values in production.

### Required vs optional

| Variable | Required | Notes |
|---|---|---|
| `MONGO_PASSWORD` | Yes | Change from default before first run |
| `REDIS_PASSWORD` | Yes | Change from default before first run |
| `JWT_SECRET` | Yes | `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | Yes | `openssl rand -hex 64` |
| `CLIENT_URL` | Yes | Must match your domain for CORS and email links |
| `ADMIN_USERNAMES` | Yes | At least one username required to access admin panel |
| `VAPID_*` | Optional | Required for push notifications |
| `RESEND_API_KEY` | Optional | Required for email notifications and password reset |
| `EMAIL_FROM` | Optional | Required alongside `RESEND_API_KEY` |

## Admin Panel

Users listed in `ADMIN_USERNAMES` see an admin button in the sidebar. The variable controls both the UI button and the backend API — both frontend and backend read it from `.env`.

The admin panel provides:
- User statistics (total users, messages, active today, storage used)
- User management (view, search, suspend, delete, reset password, reset 2FA)
- 2FA status visible per user
- Registration open/close toggle
- Time-limited invite link generation with optional email delivery
- Full audit log of all admin actions

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full release history.

## License

MIT License — Copyright (c) 2026 Roman Parish

See [LICENSE](LICENSE) for full details.

---

Built with ❤️ for privacy.
