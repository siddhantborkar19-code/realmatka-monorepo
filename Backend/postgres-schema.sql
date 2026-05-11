CREATE TABLE users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  google_sub TEXT,
  google_linked_at TIMESTAMPTZ,
  auth_provider TEXT NOT NULL DEFAULT 'password',
  password_hash TEXT NOT NULL,
  mpin_hash TEXT NOT NULL,
  mpin_configured BOOLEAN NOT NULL DEFAULT FALSE,
  name TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL,
  referral_code TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  approval_status TEXT NOT NULL DEFAULT 'Approved',
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  status_note TEXT,
  signup_bonus_granted BOOLEAN NOT NULL DEFAULT FALSE,
  first_deposit_bonus_granted BOOLEAN NOT NULL DEFAULT FALSE,
  referred_by_user_id TEXT REFERENCES users(id)
);

CREATE TABLE admin_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  two_factor_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  two_factor_secret TEXT,
  blocked_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE otp_challenges (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE wallet_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  before_balance NUMERIC(12,2) NOT NULL,
  after_balance NUMERIC(12,2) NOT NULL,
  reference_id TEXT,
  proof_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE bids (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  market TEXT NOT NULL,
  board_label TEXT NOT NULL,
  game_type TEXT,
  session_type TEXT NOT NULL,
  digit TEXT NOT NULL,
  points NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL,
  payout NUMERIC(12,2) NOT NULL DEFAULT 0,
  settled_at TIMESTAMPTZ,
  settled_result TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE bank_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  account_number TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE markets (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  result TEXT NOT NULL,
  status TEXT NOT NULL,
  action TEXT NOT NULL,
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  category TEXT NOT NULL,
  result_locked_at TIMESTAMPTZ,
  result_locked_by_user_id TEXT REFERENCES users(id)
);

CREATE TABLE charts (
  market_slug TEXT NOT NULL REFERENCES markets(slug),
  chart_type TEXT NOT NULL,
  rows_json JSONB NOT NULL,
  PRIMARY KEY (market_slug, chart_type)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE notification_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, token)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  checkout_token TEXT,
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  gateway_signature TEXT,
  verified_at TIMESTAMPTZ,
  redirect_url TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  sender_user_id TEXT,
  text TEXT NOT NULL,
  read_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role_approval_joined_at
  ON users (role, approval_status, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_accounts_phone
  ON admin_accounts (phone);

CREATE INDEX IF NOT EXISTS idx_admins_phone
  ON admins (phone);

CREATE INDEX IF NOT EXISTS idx_users_status_flags
  ON users (blocked_at, deactivated_at);

CREATE INDEX IF NOT EXISTS idx_sessions_user_created_at
  ON sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_created_at
  ON admin_sessions (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone_purpose_created_at
  ON otp_challenges (phone, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone_purpose_expires_at
  ON otp_challenges (phone, purpose, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_entries_user_created_at
  ON wallet_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_entries_type_status_created_at
  ON wallet_entries (type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_entries_user_type_created_at
  ON wallet_entries (user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_entries_user_reference_id
  ON wallet_entries (user_id, reference_id);

CREATE INDEX IF NOT EXISTS idx_bids_user_created_at
  ON bids (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bids_market_created_at
  ON bids (market, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bids_market_status_created_at
  ON bids (market, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bids_user_status_created_at
  ON bids (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_created_at
  ON bank_accounts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created_at
  ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created_at
  ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_devices_user_enabled_updated_at
  ON notification_devices (user_id, enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created_at
  ON notifications (user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created_at
  ON payment_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_orders_status_created_at
  ON payment_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_updated_at
  ON chat_conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_status_last_message_at
  ON chat_conversations (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created_at
  ON chat_messages (conversation_id, created_at DESC);
