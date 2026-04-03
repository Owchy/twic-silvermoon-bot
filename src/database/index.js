const Database = require('better-sqlite3');
const path = require('path');
const schema = require('./schema');

// On Railway, set DATABASE_PATH=/data/silvermoon.db (on a mounted volume).
// Locally it defaults to the project root.
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'silvermoon.db');

let _db;

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.exec(schema);
  }
  return _db;
}

// ── Guild settings ───────────────────────────────────────────────────────────

function getGuildSettings(guildId) {
  return getDb().prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
}

function upsertGuildSettings(guildId, fields) {
  const existing = getGuildSettings(guildId);
  if (existing) {
    const sets = Object.keys(fields).map(k => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE guild_settings SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE guild_id = @guild_id`)
      .run({ guild_id: guildId, ...fields });
  } else {
    const cols = ['guild_id', ...Object.keys(fields)].join(', ');
    const vals = ['@guild_id', ...Object.keys(fields).map(k => `@${k}`)].join(', ');
    getDb().prepare(`INSERT INTO guild_settings (${cols}) VALUES (${vals})`)
      .run({ guild_id: guildId, ...fields });
  }
}

// ── Characters ───────────────────────────────────────────────────────────────

function getCharacter(discordId, guildId) {
  return getDb().prepare(
    'SELECT * FROM characters WHERE discord_id = ? AND guild_id = ? AND is_main = 1 LIMIT 1'
  ).get(discordId, guildId);
}

function getAllCharacters(discordId, guildId) {
  return getDb().prepare(
    'SELECT * FROM characters WHERE discord_id = ? AND guild_id = ? ORDER BY is_main DESC'
  ).all(discordId, guildId);
}

function upsertCharacter(discordId, guildId, data) {
  const db = getDb();
  // If setting a new main, demote old mains
  if (data.is_main) {
    db.prepare('UPDATE characters SET is_main = 0 WHERE discord_id = ? AND guild_id = ?')
      .run(discordId, guildId);
  }
  db.prepare(`
    INSERT INTO characters (discord_id, guild_id, character_name, realm, class, spec, role, item_level, is_main)
    VALUES (@discord_id, @guild_id, @character_name, @realm, @class, @spec, @role, @item_level, @is_main)
    ON CONFLICT(discord_id, guild_id, character_name, realm) DO UPDATE SET
      class = excluded.class, spec = excluded.spec, role = excluded.role,
      item_level = excluded.item_level, is_main = excluded.is_main,
      updated_at = CURRENT_TIMESTAMP
  `).run({ discord_id: discordId, guild_id: guildId, ...data });
}

function deleteCharacter(discordId, guildId, characterName, realm) {
  return getDb().prepare(
    'DELETE FROM characters WHERE discord_id = ? AND guild_id = ? AND character_name = ? AND realm = ?'
  ).run(discordId, guildId, characterName, realm);
}

// ── Raid Events ──────────────────────────────────────────────────────────────

function createRaidEvent(data) {
  const result = getDb().prepare(`
    INSERT INTO raid_events (guild_id, title, description, raid_date, difficulty, max_size, created_by, channel_id)
    VALUES (@guild_id, @title, @description, @raid_date, @difficulty, @max_size, @created_by, @channel_id)
  `).run(data);
  return result.lastInsertRowid;
}

function getRaidEvent(eventId) {
  return getDb().prepare('SELECT * FROM raid_events WHERE id = ?').get(eventId);
}

function getUpcomingRaidEvents(guildId, limit = 10) {
  return getDb().prepare(`
    SELECT * FROM raid_events
    WHERE guild_id = ? AND status != 'cancelled' AND status != 'completed'
    ORDER BY raid_date ASC LIMIT ?
  `).all(guildId, limit);
}

function updateRaidEvent(eventId, fields) {
  const sets = Object.keys(fields).map(k => `${k} = @${k}`).join(', ');
  return getDb().prepare(`UPDATE raid_events SET ${sets} WHERE id = @id`)
    .run({ id: eventId, ...fields });
}

function deleteRaidEvent(eventId) {
  return getDb().prepare('DELETE FROM raid_events WHERE id = ?').run(eventId);
}

// ── Raid Signups ─────────────────────────────────────────────────────────────

function getRaidSignups(eventId) {
  return getDb().prepare('SELECT * FROM raid_signups WHERE event_id = ? ORDER BY signed_up_at ASC')
    .all(eventId);
}

function getSignup(eventId, discordId) {
  return getDb().prepare('SELECT * FROM raid_signups WHERE event_id = ? AND discord_id = ?')
    .get(eventId, discordId);
}

function upsertSignup(data) {
  return getDb().prepare(`
    INSERT INTO raid_signups (event_id, discord_id, character_name, realm, class, spec, role, status, note)
    VALUES (@event_id, @discord_id, @character_name, @realm, @class, @spec, @role, @status, @note)
    ON CONFLICT(event_id, discord_id) DO UPDATE SET
      character_name = excluded.character_name, realm = excluded.realm,
      class = excluded.class, spec = excluded.spec, role = excluded.role,
      status = excluded.status, note = excluded.note,
      updated_at = CURRENT_TIMESTAMP
  `).run(data);
}

function removeSignup(eventId, discordId) {
  return getDb().prepare('DELETE FROM raid_signups WHERE event_id = ? AND discord_id = ?')
    .run(eventId, discordId);
}

// ── Mythic+ ──────────────────────────────────────────────────────────────────

function createMplusRun(runData, participants) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO mythicplus_runs (guild_id, dungeon, key_level, in_time, completed_at, logged_by, notes)
    VALUES (@guild_id, @dungeon, @key_level, @in_time, @completed_at, @logged_by, @notes)
  `).run(runData);
  const runId = result.lastInsertRowid;
  const insertParticipant = db.prepare(`
    INSERT OR IGNORE INTO mythicplus_participants (run_id, discord_id, character_name, role)
    VALUES (@run_id, @discord_id, @character_name, @role)
  `);
  for (const p of participants) insertParticipant.run({ run_id: runId, ...p });
  return runId;
}

function getGuildMplusRuns(guildId, limit = 50) {
  return getDb().prepare(`
    SELECT r.*, GROUP_CONCAT(p.discord_id) as participant_ids
    FROM mythicplus_runs r
    LEFT JOIN mythicplus_participants p ON r.id = p.run_id
    WHERE r.guild_id = ? GROUP BY r.id ORDER BY r.completed_at DESC LIMIT ?
  `).all(guildId, limit);
}

function getPlayerMplusRuns(discordId, guildId, limit = 20) {
  return getDb().prepare(`
    SELECT r.* FROM mythicplus_runs r
    JOIN mythicplus_participants p ON r.id = p.run_id
    WHERE p.discord_id = ? AND r.guild_id = ?
    ORDER BY r.completed_at DESC LIMIT ?
  `).all(discordId, guildId, limit);
}

// ── Soft Reserves ────────────────────────────────────────────────────────────

function addSoftReserve(eventId, discordId, itemName, itemId) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO soft_reserves (event_id, discord_id, item_name, item_id)
    VALUES (?, ?, ?, ?)
  `).run(eventId, discordId, itemName, itemId);
}

function getSoftReserves(eventId) {
  return getDb().prepare('SELECT * FROM soft_reserves WHERE event_id = ? ORDER BY created_at ASC')
    .all(eventId);
}

function getPlayerReserves(eventId, discordId) {
  return getDb().prepare('SELECT * FROM soft_reserves WHERE event_id = ? AND discord_id = ?')
    .all(eventId, discordId);
}

function removeSoftReserve(eventId, discordId, itemName) {
  return getDb().prepare('DELETE FROM soft_reserves WHERE event_id = ? AND discord_id = ? AND item_name = ?')
    .run(eventId, discordId, itemName);
}

// ── Loot History ─────────────────────────────────────────────────────────────

function awardLoot(data) {
  return getDb().prepare(`
    INSERT INTO loot_history (event_id, guild_id, discord_id, character_name, item_name, item_id, item_level, loot_type, awarded_by)
    VALUES (@event_id, @guild_id, @discord_id, @character_name, @item_name, @item_id, @item_level, @loot_type, @awarded_by)
  `).run(data);
}

function getLootHistory(guildId, discordId, limit = 20) {
  const query = discordId
    ? 'SELECT * FROM loot_history WHERE guild_id = ? AND discord_id = ? ORDER BY awarded_at DESC LIMIT ?'
    : 'SELECT * FROM loot_history WHERE guild_id = ? ORDER BY awarded_at DESC LIMIT ?';
  return discordId
    ? getDb().prepare(query).all(guildId, discordId, limit)
    : getDb().prepare(query).all(guildId, limit);
}

// ── Guild Roster ─────────────────────────────────────────────────────────────

function getRosterEntry(discordId, guildId) {
  return getDb().prepare('SELECT * FROM guild_roster WHERE discord_id = ? AND guild_id = ?')
    .get(discordId, guildId);
}

function getFullRoster(guildId) {
  return getDb().prepare(`
    SELECT r.*, c.character_name, c.class, c.spec, c.role, c.item_level
    FROM guild_roster r
    LEFT JOIN characters c ON c.discord_id = r.discord_id AND c.guild_id = r.guild_id AND c.is_main = 1
    WHERE r.guild_id = ? ORDER BY r.rank ASC, c.character_name ASC
  `).all(guildId);
}

function upsertRosterEntry(discordId, guildId, fields) {
  const existing = getRosterEntry(discordId, guildId);
  if (existing) {
    const sets = Object.keys(fields).map(k => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE guild_roster SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE discord_id = @discord_id AND guild_id = @guild_id`)
      .run({ discord_id: discordId, guild_id: guildId, ...fields });
  } else {
    const cols = ['discord_id', 'guild_id', ...Object.keys(fields)].join(', ');
    const vals = ['@discord_id', '@guild_id', ...Object.keys(fields).map(k => `@${k}`)].join(', ');
    getDb().prepare(`INSERT INTO guild_roster (${cols}) VALUES (${vals})`)
      .run({ discord_id: discordId, guild_id: guildId, ...fields });
  }
}

function removeFromRoster(discordId, guildId) {
  return getDb().prepare('DELETE FROM guild_roster WHERE discord_id = ? AND guild_id = ?')
    .run(discordId, guildId);
}

// ── Attendance ───────────────────────────────────────────────────────────────

function getAttendance(discordId, guildId, limit = 30) {
  return getDb().prepare(`
    SELECT e.title, e.raid_date, e.difficulty, s.status
    FROM raid_signups s
    JOIN raid_events e ON s.event_id = e.id
    WHERE s.discord_id = ? AND e.guild_id = ?
    ORDER BY e.raid_date DESC LIMIT ?
  `).all(discordId, guildId, limit);
}

function getRaidAttendanceSummary(guildId, sinceDate) {
  return getDb().prepare(`
    SELECT s.discord_id, COUNT(*) as total,
      SUM(CASE WHEN s.status IN ('accepted','late') THEN 1 ELSE 0 END) as attended,
      SUM(CASE WHEN s.status = 'benched' THEN 1 ELSE 0 END) as benched
    FROM raid_signups s
    JOIN raid_events e ON s.event_id = e.id
    WHERE e.guild_id = ? AND e.raid_date >= ?
    GROUP BY s.discord_id ORDER BY attended DESC
  `).all(guildId, sinceDate);
}

module.exports = {
  getDb,
  getGuildSettings, upsertGuildSettings,
  getCharacter, getAllCharacters, upsertCharacter, deleteCharacter,
  createRaidEvent, getRaidEvent, getUpcomingRaidEvents, updateRaidEvent, deleteRaidEvent,
  getRaidSignups, getSignup, upsertSignup, removeSignup,
  createMplusRun, getGuildMplusRuns, getPlayerMplusRuns,
  addSoftReserve, getSoftReserves, getPlayerReserves, removeSoftReserve,
  awardLoot, getLootHistory,
  getRosterEntry, getFullRoster, upsertRosterEntry, removeFromRoster,
  getAttendance, getRaidAttendanceSummary,
};
