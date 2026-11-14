const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false
  },

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(24) UNIQUE NOT NULL,
      display_name VARCHAR(60) NOT NULL,
      email VARCHAR(160) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color VARCHAR(20) NOT NULL DEFAULT '#7868e6',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      is_group BOOLEAN NOT NULL DEFAULT FALSE,
      title VARCHAR(80),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
      ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS message_receipts (
      id BIGSERIAL PRIMARY KEY,
      message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      UNIQUE (message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme VARCHAR(20) NOT NULL DEFAULT 'light',
      wallpaper VARCHAR(30) NOT NULL DEFAULT 'default',
      notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      notification_sound BOOLEAN NOT NULL DEFAULT TRUE,
      show_online_status BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
  `);

  await pool.query(`
  ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE;
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS message_deletions (
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
  );
`);

  await pool.query(`
  ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id BIGINT
  REFERENCES messages(id) ON DELETE SET NULL;
`);

  await pool.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
  `);
}

module.exports = { pool, initDb };
