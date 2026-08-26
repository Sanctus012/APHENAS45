import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const messagingSchema = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL DEFAULT 'DIRECT',
    title VARCHAR(120),
    created_by INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_members (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    last_read_at TIMESTAMPTZ,
    muted BOOLEAN NOT NULL DEFAULT FALSE,
    pinned_at TIMESTAMPTZ,
    UNIQUE (conversation_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'TEXT',
    client_id VARCHAR(120),
    reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS message_receipts (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    UNIQUE (message_id, recipient_id)
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_clears (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS call_sessions (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    initiator_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    call_type VARCHAR(20) NOT NULL DEFAULT 'AUDIO',
    status VARCHAR(20) NOT NULL DEFAULT 'RINGING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS chat_settings (
    user_id INTEGER PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
    pin_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_unlocks (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    unlocked_until TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sitreps (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS command_broadcasts (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL DEFAULT 'Command broadcast',
    body TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    escalation_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS command_broadcast_acknowledgments (
    broadcast_id INTEGER NOT NULL REFERENCES command_broadcasts(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    acknowledged_at TIMESTAMPTZ,
    PRIMARY KEY (broadcast_id, recipient_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    device_id_hash VARCHAR(64) NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_expires_at TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    revoked_reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    actor_user_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    target_user_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    target_type VARCHAR(80),
    target_id VARCHAR(120),
    ip_address INET,
    device_id_hash VARCHAR(64),
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title VARCHAR(120)`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES auth_user(id) ON DELETE SET NULL`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'MEMBER'`,
  `ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ`,
  `ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ`,
  `ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id VARCHAR(120)`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_sender_client_key ON messages (conversation_id, sender_id, client_id) WHERE client_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS conversation_clears_user_conversation_idx ON conversation_clears (user_id, conversation_id)`,
  `CREATE INDEX IF NOT EXISTS conversation_unlocks_expiry_idx ON conversation_unlocks (user_id, conversation_id, unlocked_until)`,
  `CREATE INDEX IF NOT EXISTS sitreps_sender_created_idx ON sitreps (sender_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS broadcast_ack_recipient_idx ON command_broadcast_acknowledgments (recipient_id, acknowledged_at)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions (user_id, revoked_at, refresh_expires_at)`,
  `CREATE INDEX IF NOT EXISTS audit_log_event_created_idx ON audit_log (event_type, created_at DESC)`,
];

export async function ensureMessagingSchema() {
  for (const statement of messagingSchema) {
    await pool.query(statement);
  }
}

export async function connectDatabase() {
  let client;

  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() AS current_time');
    await ensureMessagingSchema();

    console.log('PostgreSQL connected successfully');
    console.log('Database time:', result.rows[0].current_time);
    console.log('Messaging schema ready');
  } catch (error) {
    console.error('PostgreSQL connection failed:', error.message);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export default pool;
