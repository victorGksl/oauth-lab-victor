-- Esquema que já existia no D1 (criado pelo console antes das migrações).
-- IF NOT EXISTS: no D1 remoto as tabelas já existem; a migração só passa a ficar registrada.
CREATE TABLE IF NOT EXISTS oauth_transactions (
  id_hash       TEXT PRIMARY KEY,
  provider      TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  state_hash    TEXT NOT NULL,
  nonce         TEXT,          -- o GitHub (OAuth sem OIDC) não tem nonce
  code_verifier TEXT NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_transactions_expiry ON oauth_transactions (expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash      TEXT PRIMARY KEY,
  issuer       TEXT NOT NULL,
  subject      TEXT NOT NULL,
  email        TEXT,
  display_name TEXT,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions (expires_at);
