# SecureChat

> End-to-end encrypted messaging — self-hosted, built for privacy.

SecureChat is a self-hosted messaging app where every message and file is encrypted on your device before it ever leaves. The server stores only ciphertext — nobody but you and your contacts can read your conversations, not even the server operator.

Run it on your own server in minutes with Docker. Invite friends via time-limited links, manage users from the admin panel, and install it as a PWA on any device.

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
- 📱 **PWA** — installable on iOS (Safari → Share → Add to Home Screen) and Android (Chrome → Install App); works offline
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
- A Linux server (Ubuntu 22.04+ recommended)
- A domain name pointing at your server (optional, but required for Let's Encrypt SSL and push notifications on iOS)

### 1. Clone and run setup

```bash
git clone https://github.com/roman-parish/securechat.git
cd securechat
./setup.sh
```

For a real domain with automatic Let's Encrypt SSL:

```bash
./setup.sh --domain=yourdomain.com
```

`setup.sh` will automatically:
- Generate secure JWT secrets, MongoDB password, and Redis password
- Generate VAPID keys for push notifications
- Create a TLS certificate (Let's Encrypt if `--domain` is set, self-signed otherwise)
- Build and start all containers

> Without `--domain`, your browser will show a certificate warning. Click **Advanced → Proceed** to continue. Re-run with `--domain` when you have a domain pointed at the server.

### 2. First login — set up your admin account

After setup, open the app in your browser and **register your account**. Then:

1. Open `.env` on the server and set `ADMIN_USERNAMES=yourusername`
2. Restart the backend to pick up the change:
   ```bash
   docker compose up -d backend
   ```
3. Reload the app — you'll see an **Admin** button in the sidebar

### 3. Optional — configure email and push notifications

These are optional but unlock password reset, login alerts, and push notifications:

**Email (via [Resend](https://resend.com)):**
```env
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=SecureChat <noreply@yourdomain.com>
```
Required for: password reset emails, login alerts, 2FA disable notifications, invite link delivery.

**Push notifications:**
```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=admin@yourdomain.com
```
`setup.sh` generates VAPID keys automatically. Push notifications require HTTPS with a real domain (not a self-signed cert) to work on iOS.

After updating `.env`, restart the backend: `docker compose up -d backend`

### Deploying updates

```bash
git pull && ./deploy.sh
```

### Automated deploys with GitHub Actions

The included workflow (`.github/workflows/deploy.yml`) runs tests and deploys to your server on every push to `main`. To enable it, add these secrets to your GitHub repository (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|---|---|
| `SERVER_HOST` | Your server's IP or domain |
| `SERVER_USER` | SSH username (e.g. `root` or `ubuntu`) |
| `SERVER_SSH_KEY` | Private SSH key with access to the server |

The server must have the repo cloned at `~/securechat` and a valid `.env` file in place before the first deploy runs.

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
