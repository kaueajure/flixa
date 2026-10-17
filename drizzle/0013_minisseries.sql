CREATE TABLE IF NOT EXISTS minisserie_titulos (
  id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  payload json NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS minisserie_aliases (
  alias_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  title_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  INDEX minisserie_alias_title (title_id)
);
CREATE TABLE IF NOT EXISTS minisserie_cache (
  cache_key varchar(190) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  payload json NOT NULL,
  expires_at bigint NOT NULL,
  stale_until bigint NOT NULL,
  INDEX minisserie_cache_expiry (stale_until)
);
CREATE TABLE IF NOT EXISTS minisserie_controle (
  control_key varchar(190) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  owner varchar(64) NOT NULL DEFAULT '',
  expires_at bigint NOT NULL DEFAULT 0,
  units int NOT NULL DEFAULT 0,
  INDEX minisserie_control_expiry (expires_at)
);
