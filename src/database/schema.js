// All CREATE TABLE statements. Run once at startup via db.exec().
module.exports = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id         TEXT PRIMARY KEY,
  raid_channel_id  TEXT,
  log_channel_id   TEXT,
  officer_role_id  TEXT,
  raider_role_id   TEXT,
  trial_role_id    TEXT,
  realm            TEXT,
  guild_name       TEXT,
  recruitment_needs TEXT DEFAULT '{}',
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS characters (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id     TEXT    NOT NULL,
  guild_id       TEXT    NOT NULL,
  character_name TEXT    NOT NULL,
  realm          TEXT    NOT NULL,
  class          TEXT    NOT NULL,
  spec           TEXT    NOT NULL,
  role           TEXT    NOT NULL, -- tank / healer / dps
  item_level     INTEGER DEFAULT 0,
  is_main        INTEGER DEFAULT 1,
  linked_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(discord_id, guild_id, character_name, realm)
);

CREATE TABLE IF NOT EXISTS raid_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id       TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  description    TEXT,
  raid_date      TEXT    NOT NULL, -- ISO-8601 string
  difficulty     TEXT    NOT NULL, -- LFR / Normal / Heroic / Mythic
  max_size       INTEGER NOT NULL DEFAULT 20,
  created_by     TEXT    NOT NULL, -- discord user id
  channel_id     TEXT    NOT NULL,
  message_id     TEXT,
  status         TEXT    NOT NULL DEFAULT 'open', -- open / locked / cancelled / completed
  warcraftlogs   TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raid_signups (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id       INTEGER NOT NULL REFERENCES raid_events(id) ON DELETE CASCADE,
  discord_id     TEXT    NOT NULL,
  character_name TEXT    NOT NULL,
  realm          TEXT    NOT NULL,
  class          TEXT    NOT NULL,
  spec           TEXT    NOT NULL,
  role           TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'accepted', -- accepted / declined / tentative / late / absent / benched
  note           TEXT,
  signed_up_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, discord_id)
);

CREATE TABLE IF NOT EXISTS mythicplus_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  dungeon      TEXT    NOT NULL,
  key_level    INTEGER NOT NULL,
  in_time      INTEGER NOT NULL DEFAULT 1, -- 1 = timed, 0 = depleted
  completed_at TEXT    NOT NULL,
  logged_by    TEXT    NOT NULL,
  notes        TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mythicplus_participants (
  run_id         INTEGER NOT NULL REFERENCES mythicplus_runs(id) ON DELETE CASCADE,
  discord_id     TEXT    NOT NULL,
  character_name TEXT,
  role           TEXT,
  PRIMARY KEY(run_id, discord_id)
);

CREATE TABLE IF NOT EXISTS soft_reserves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES raid_events(id) ON DELETE CASCADE,
  discord_id TEXT    NOT NULL,
  item_name  TEXT    NOT NULL,
  item_id    INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, discord_id, item_name)
);

CREATE TABLE IF NOT EXISTS loot_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id       INTEGER REFERENCES raid_events(id) ON DELETE SET NULL,
  guild_id       TEXT    NOT NULL,
  discord_id     TEXT    NOT NULL,
  character_name TEXT    NOT NULL,
  item_name      TEXT    NOT NULL,
  item_id        INTEGER,
  item_level     INTEGER,
  loot_type      TEXT    DEFAULT 'main_spec', -- main_spec / off_spec / split / greed
  awarded_by     TEXT,
  awarded_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guild_roster (
  discord_id TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  rank       TEXT NOT NULL DEFAULT 'member', -- gm / officer / raider / trial / social / alt
  notes      TEXT,
  is_trial   INTEGER DEFAULT 0,
  trial_since TEXT,
  joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(discord_id, guild_id)
);
`;
