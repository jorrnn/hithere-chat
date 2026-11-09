# HiThere

HiThere is a responsive real-time messaging website starter built with Node.js, Express, Socket.IO and PostgreSQL. Its frontend is deliberately separated from the API so a future React Native mobile app can reuse the same authentication, conversation and messaging endpoints.

## Included in this first version

- Sign up and sign in with hashed passwords
- Private one-to-one conversations
- User search by display name or username
- Persistent message storage in PostgreSQL
- Real-time message delivery with Socket.IO
- Basic online/offline presence
- Responsive desktop and mobile layouts
- Session-based authentication and server-side authorization checks

## Requirements

- Node.js 20+
- PostgreSQL 14+
- npm

## 1. Create the database

Open pgAdmin, create a database named `hithere`, and keep your PostgreSQL username/password handy.

## 2. Configure the project

In the project folder, copy `.env.example` to `.env`, then edit `DATABASE_URL` and `SESSION_SECRET`.

Example for a local PostgreSQL installation:

`DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/hithere`

Use a long random value for `SESSION_SECRET`. Do not share `.env` or upload it to GitHub.

## 3. Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

The server creates the required application tables automatically on first startup.

## 4. Test two accounts

1. Open HiThere in a normal browser window and create account A.
2. Open an incognito/private window and create account B.
3. In either account, use the `+` button to search for the other username.
4. Start a conversation and send messages in both windows.

## Project structure

```text
hithere-chat/
├── backend/
│   ├── db.js
│   └── server.js
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Before a public launch

This is a working MVP foundation, not a production-audited messaging service. Before inviting the public, add rate limiting, email verification and password reset, CSRF protection, abuse reporting/blocking, moderation tools, automated tests, backups, logging, and security review. Add HTTPS in production. Do not store secrets in frontend files.

Attachments, voice notes, read receipts, push notifications, group chats, and voice/video calls are intentionally not included in this first messaging-only release.

## Future mobile app

A React Native app can reuse the `/api` endpoints and Socket.IO events. Keep business rules and authorization in the backend; the mobile app should be another client, not a separate backend.
