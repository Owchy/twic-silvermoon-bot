const { Router } = require('express');
const db = require('../../database/index');
const { buildRaidEmbed, buildRaidButtons } = require('../../utils/embeds');

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
function requireOfficer(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.session.user.isOfficer) return res.status(403).json({ error: 'Officer access required' });
  next();
}

module.exports = function apiRouter(discordClient) {
  const router = Router();

  // ── Current User ───────────────────────────────────────────────────────────

  router.get('/me', requireAuth, (req, res) => {
    const { id, username, avatar, isOfficer, guildId } = req.session.user;
    const char = db.getCharacter(id, guildId);
    const entry = db.getRosterEntry(id, guildId);
    res.json({ id, username, avatar, isOfficer, guildId, character: char, rank: entry?.rank || null });
  });

  // ── Dashboard Stats ────────────────────────────────────────────────────────

  router.get('/stats', requireAuth, (req, res) => {
    const { guildId } = req.session.user;
    const roster   = db.getFullRoster(guildId);
    const raids    = db.getUpcomingRaidEvents(guildId, 5);
    const runs     = db.getGuildMplusRuns(guildId, 10);
    const since    = new Date(Date.now() - 30 * 86400000).toISOString();
    const summary  = db.getRaidAttendanceSummary(guildId, since);

    const activeRaiders  = roster.filter(m => ['raider', 'trial'].includes(m.rank)).length;
    const avgAttendance  = summary.length
      ? Math.round(summary.reduce((s, r) => s + r.attended / r.total, 0) / summary.length * 100)
      : 0;

    const upcomingList = raids.slice(0, 3).map(e => {
      const signups = db.getRaidSignups(e.id);
      const confirmed = signups.filter(s => ['accepted', 'late'].includes(s.status)).length;
      return { id: e.id, title: e.title, difficulty: e.difficulty, date: e.raid_date, confirmed, maxSize: e.max_size };
    });

    res.json({
      activeRaiders,
      upcomingRaids:    raids.length,
      recentMplusRuns:  runs.length,
      avgAttendance,
      upcomingList,
      recentRuns: runs.slice(0, 5),
    });
  });

  // ── Raids ──────────────────────────────────────────────────────────────────

  router.get('/raids', requireAuth, (req, res) => {
    const { guildId } = req.session.user;
    const events = db.getUpcomingRaidEvents(guildId, 20);
    const result = events.map(e => {
      const signups   = db.getRaidSignups(e.id);
      const confirmed = signups.filter(s => ['accepted', 'late'].includes(s.status));
      return {
        ...e,
        signups,
        counts: {
          tanks:   confirmed.filter(s => s.role === 'tank').length,
          healers: confirmed.filter(s => s.role === 'healer').length,
          dps:     confirmed.filter(s => s.role === 'dps').length,
          total:   confirmed.length,
        },
      };
    });
    res.json(result);
  });

  router.get('/raids/:id', requireAuth, (req, res) => {
    const { guildId } = req.session.user;
    const event = db.getRaidEvent(parseInt(req.params.id));
    if (!event || event.guild_id !== guildId) return res.status(404).json({ error: 'Not found' });
    res.json({ ...event, signups: db.getRaidSignups(event.id) });
  });

  router.post('/raids', requireOfficer, async (req, res) => {
    const { guildId, id: userId } = req.session.user;
    const { title, difficulty, date, time, max_size, description } = req.body;

    const raidDate = new Date(`${date}T${time}`);
    if (isNaN(raidDate)) return res.status(400).json({ error: 'Invalid date/time' });

    const settings   = db.getGuildSettings(guildId);
    const channelId  = settings?.raid_channel_id || null;

    const eventId = db.createRaidEvent({
      guild_id:    guildId,
      title,
      description: description || null,
      raid_date:   raidDate.toISOString(),
      difficulty,
      max_size:    parseInt(max_size) || 20,
      created_by:  userId,
      channel_id:  channelId || 'web',
    });

    // Post embed to Discord if a raid channel is configured
    if (channelId && discordClient) {
      try {
        const guild   = discordClient.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(channelId);
        if (channel) {
          const event   = db.getRaidEvent(eventId);
          const embed   = buildRaidEmbed(event, []);
          const buttons = buildRaidButtons(eventId);
          const msg     = await channel.send({ embeds: [embed], components: [buttons] });
          db.updateRaidEvent(eventId, { message_id: msg.id });
        }
      } catch (err) {
        console.error('Failed to post raid embed from web:', err);
      }
    }

    res.json({ id: eventId });
  });

  router.patch('/raids/:id', requireOfficer, (req, res) => {
    const { guildId } = req.session.user;
    const event = db.getRaidEvent(parseInt(req.params.id));
    if (!event || event.guild_id !== guildId) return res.status(404).json({ error: 'Not found' });

    const allowed = ['title', 'description', 'status', 'warcraftlogs', 'max_size'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length) db.updateRaidEvent(event.id, updates);
    res.json({ success: true });
  });

  router.delete('/raids/:id', requireOfficer, (req, res) => {
    const { guildId } = req.session.user;
    const event = db.getRaidEvent(parseInt(req.params.id));
    if (!event || event.guild_id !== guildId) return res.status(404).json({ error: 'Not found' });
    db.deleteRaidEvent(event.id);
    res.json({ success: true });
  });

  // ── Roster ─────────────────────────────────────────────────────────────────

  router.get('/roster', requireAuth, (req, res) => {
    res.json(db.getFullRoster(req.session.user.guildId));
  });

  router.patch('/roster/:discordId', requireOfficer, (req, res) => {
    const { guildId } = req.session.user;
    const { rank, notes } = req.body;
    const updates = {};
    if (rank  !== undefined) {
      updates.rank     = rank;
      updates.is_trial = rank === 'trial' ? 1 : 0;
      if (rank === 'trial') updates.trial_since = new Date().toISOString();
      else                  updates.trial_since = null;
    }
    if (notes !== undefined) updates.notes = notes;
    db.upsertRosterEntry(req.params.discordId, guildId, updates);
    res.json({ success: true });
  });

  router.delete('/roster/:discordId', requireOfficer, (req, res) => {
    db.removeFromRoster(req.params.discordId, req.session.user.guildId);
    res.json({ success: true });
  });

  // ── Attendance ─────────────────────────────────────────────────────────────

  router.get('/attendance', requireAuth, (req, res) => {
    const { guildId } = req.session.user;
    const since   = new Date(Date.now() - 90 * 86400000).toISOString();
    const summary = db.getRaidAttendanceSummary(guildId, since);
    const enriched = summary.map(row => {
      const char = db.getCharacter(row.discord_id, guildId);
      return { ...row, characterName: char?.character_name || null, class: char?.class || null };
    });
    res.json(enriched);
  });

  router.get('/attendance/:discordId', requireAuth, (req, res) => {
    const history = db.getAttendance(req.params.discordId, req.session.user.guildId, 30);
    res.json(history);
  });

  // ── Mythic+ ────────────────────────────────────────────────────────────────

  router.get('/mplus', requireAuth, (req, res) => {
    const { guildId } = req.session.user;
    const runs = db.getGuildMplusRuns(guildId, 50);

    const highestByPlayer = {};
    for (const run of runs) {
      for (const id of (run.participant_ids || '').split(',').filter(Boolean)) {
        if (!highestByPlayer[id] || run.key_level > highestByPlayer[id].key_level) {
          highestByPlayer[id] = run;
        }
      }
    }

    const leaderboard = Object.entries(highestByPlayer)
      .sort(([, a], [, b]) => b.key_level - a.key_level)
      .map(([discordId, run]) => {
        const char = db.getCharacter(discordId, guildId);
        return {
          discordId,
          characterName: char?.character_name || 'Unknown',
          class:         char?.class || null,
          keyLevel:      run.key_level,
          dungeon:       run.dungeon,
          inTime:        run.in_time,
        };
      });

    res.json({ runs: runs.slice(0, 20), leaderboard });
  });

  // ── Loot ───────────────────────────────────────────────────────────────────

  router.get('/loot', requireAuth, (req, res) => {
    res.json(db.getLootHistory(req.session.user.guildId, null, 50));
  });

  router.post('/loot', requireOfficer, (req, res) => {
    const { guildId, id: awardedBy } = req.session.user;
    const { discordId, itemName, lootType, eventId, ilvl } = req.body;
    if (!discordId || !itemName) return res.status(400).json({ error: 'discordId and itemName required' });

    const char = db.getCharacter(discordId, guildId);
    db.awardLoot({
      event_id:       eventId || null,
      guild_id:       guildId,
      discord_id:     discordId,
      character_name: char?.character_name || 'Unknown',
      item_name:      itemName,
      item_id:        null,
      item_level:     ilvl || null,
      loot_type:      lootType || 'main_spec',
      awarded_by:     awardedBy,
    });
    res.json({ success: true });
  });

  // ── Settings ───────────────────────────────────────────────────────────────

  router.get('/settings', requireOfficer, (req, res) => {
    const s = db.getGuildSettings(req.session.user.guildId);
    res.json(s || {});
  });

  router.patch('/settings', requireOfficer, (req, res) => {
    const { guildId } = req.session.user;
    const allowed = ['guild_name', 'realm', 'raid_channel_id', 'officer_role_id', 'raider_role_id', 'trial_role_id', 'log_channel_id'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.recruitment_needs !== undefined) {
      updates.recruitment_needs = typeof req.body.recruitment_needs === 'string'
        ? req.body.recruitment_needs
        : JSON.stringify(req.body.recruitment_needs);
    }
    if (Object.keys(updates).length) db.upsertGuildSettings(guildId, updates);
    res.json({ success: true });
  });

  // ── Roster members for dropdowns ───────────────────────────────────────────

  router.get('/members', requireAuth, (req, res) => {
    const { guildId } = req.session.user;
    const roster = db.getFullRoster(guildId);
    res.json(roster.map(m => ({
      discordId:     m.discord_id,
      characterName: m.character_name || m.discord_id,
      class:         m.class,
      rank:          m.rank,
    })));
  });

  return router;
};
