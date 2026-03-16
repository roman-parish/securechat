# SecureChat

> End-to-end encrypted messaging — built for privacy.

A self-hosted, fully encrypted messaging PWA. Messages are encrypted on your device before sending. The server only ever stores ciphertext — nobody but you and your contacts can read your messages.

## Features

- 🔒 **End-to-end encryption** — RSA-OAEP 2048-bit key exchange + AES-256-GCM message encryption
- 💬 **Real-time messaging** — instant delivery via Socket.IO
- 👥 **Group chats** — with admin controls, member management
- 📱 **PWA** — installable on iOS and desktop, works offline
- 🔔 **Push notifications** — desktop and iOS (16.4+)
- 🌙 **Light/dark mode** — per-user preference saved locally
- 🖼️ **Image & file sharing** — with full-screen lightbox viewer
- ↩️ **Message reactions, replies, edit, delete** — full message management
- ✅ **Read receipts** — double tick when message is read
- 🛡️ **Admin panel** — user management, ban/suspend, reset passwords
- 🔑 **Password-protected key backup** — log in from any device, keys restore automatically

## Encryption Architecture

1. On register — RSA-OAEP 2048-bit keypair generated in the browser
2. Private key wrapped with AES-256-GCM key derived from your password via PBKDF2 (100k iterations)
3. Encrypted private key stored on server — useless without your password
4. On login — encrypted key material fetched, unwrapped locally with your password
5. Messages encrypted with a per-message AES-256-GCM key, wrapped with each recipient's RSA public key

**Your private key never leaves your device unencrypted. The server cannot read your messages.**

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Socket.IO client, Web Crypto API |
| Backend | Node.js + Express, Socket.IO |
| Database | MongoDB |
| Cache / Presence | Redis |
| Proxy | Nginx (HTTPS termination) |
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
- Create a self-signed SSL certificate
- Start all containers

### Deploying updates

```bash
git pull
./deploy.sh
```

Or just push to `main` — GitHub Actions auto-deploys to your server.

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# Admin users (comma-separated usernames)
ADMIN_USERNAMES=yourname

# VAPID email for push notifications
VAPID_EMAIL=admin@yourdomain.com
```

**Never commit your `.env` file.**

## Admin Panel

Users listed in `ADMIN_USERNAMES` see an admin button in the sidebar. The admin panel provides:
- User statistics (total users, messages, active today)
- User management (view, search, suspend, delete)
- Password reset for any user

## License

MIT License — Copyright (c) 2026 Roman Parish

See [LICENSE](LICENSE) for full details.

---

Built with ❤️ for privacy.
