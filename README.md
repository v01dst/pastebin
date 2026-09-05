<div align="center">

# 📝 pastebin

**Self-hostable pastebin — expiring pastes, burn-after-read secrets, zero dependencies to babysit.**

[![CI](https://github.com/v01dst/pastebin/actions/workflows/ci.yml/badge.svg)](https://github.com/v01dst/pastebin/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-8A2BE2)
![Node](https://img.shields.io/badge/node-22-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/sqlite-WAL-003B57?logo=sqlite&logoColor=white)
![Tests](https://img.shields.io/badge/tests-23%20passing-brightgreen)

`share snippets` · `one-time secrets` · `self-destructing links` · `own your data`
</div>

---

## ✨ Features

- **⏳ Auto-expiry** — 1 hour, 1 day, 1 week, 30 days, or never
- **🔥 Burn-after-read** — destroyed the instant it's viewed, truly gone
- **👁️ View limits** — cap any paste at N total views
- **🌐 Web + API** — dark-themed HTML UI *and* a clean JSON/text API
- **🛡️ XSS-safe rendering** — all content escaped, always
- **🕵️ Integrity header** — `x-content-hash` (SHA-256) on raw views
- **🗄️ Embedded SQLite** — one file, WAL mode, zero external services
- **🐳 One-command deploy** — Docker with persistent volume

## 🚀 Quick Start

```bash
git clone https://github.com/v01dst/pastebin
cd pastebin
npm ci
npm start
```

Or with Docker:

```bash
docker compose up -d
```

Open `http://localhost:3000` for the web UI.

## 📡 API

| Method | Route            | Description                    |
|--------|------------------|--------------------------------|
| `POST` | `/paste`         | Create (JSON, form, raw text)  |
| `GET`  | `/:id`           | HTML view (or JSON w/ Accept)  |
| `GET`  | `/:id/raw`       | Raw text + integrity hash      |
| `GET`  | `/health`        | Liveness                       |

### Create (JSON)

```bash
curl -X POST http://localhost:3000/paste \
  -H 'content-type: application/json' \
  -d '{"content": "console.log(42)", "language": "js", "ttl": 86400}'
```

```json
{
  "id": "a1B2c3D4",
  "url": "http://localhost:3000/a1B2c3D4",
  "language": "js",
  "burnAfterRead": false,
  "maxViews": null,
  "expiresAt": "2026-09-05T02:00:00.000Z",
  "createdAt": "2026-09-04T02:00:00.000Z"
}
```

### Create a burn-after-read secret

```bash
curl -X POST http://localhost:3000/paste \
  -H 'content-type: application/json' \
  -d '{"content": "my-password-hunter2", "burnAfterRead": true}'
```

### Read raw

```bash
curl http://localhost:3000/a1B2c3D4/raw
```

### Errors

| Status | Meaning                              |
|--------|--------------------------------------|
| `400`  | Empty content / invalid ttl          |
| `404`  | Unknown or already-burned paste      |
| `410`  | Paste expired / view limit exceeded  |
| `413`  | Content too large (128 KB default)   |
| `429`  | Rate limited                         |

## ⚙️ Configuration

| Variable               | Default                 | Description            |
|------------------------|-------------------------|------------------------|
| `PORT`                 | `3000`                  | Listen port            |
| `DB_PATH`              | `./data/pastes.db`      | SQLite file            |
| `BASE_URL`             | `http://localhost:3000` | Links in responses     |
| `MAX_BODY_BYTES`       | `131072`                | Max paste size         |
| `RATE_LIMIT_MAX`       | `30`                    | Creates per window/IP  |
| `RATE_LIMIT_WINDOW_MS` | `60000`                 | Window duration (ms)   |

## 🧱 Tech Stack

| Layer     | Tech                  |
|-----------|-----------------------|
| Runtime   | Node.js 22            |
| Language  | TypeScript (strict)   |
| Framework | Fastify 5             |
| Storage   | SQLite (WAL)          |
| Testing   | Vitest 5              |
| Packaging | Docker + compose      |
| CI        | GitHub Actions        |

---

<div align="center">

Built with ⚡ by **v01dst**

[![GitHub](https://img.shields.io/badge/github-v01dst-181717?logo=github)](https://github.com/v01dst)
[![Discord](https://img.shields.io/badge/discord-9p.1-5865F2?logo=discord&logoColor=white)](https://discord.com/users/9p.1)

</div>
