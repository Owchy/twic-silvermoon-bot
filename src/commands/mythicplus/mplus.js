const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/index');
const { buildMplusEmbed } = require('../../utils/embeds');
const { MPLUS_DUNGEONS, ROLE_EMOJI } = require('../../utils/constants');
const { getCharacterProfile: getRioProfile } = require('../../utils/raiderio');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mplus')
    .setDescription('Mythic+ tracking')
    .addSubcommand(sub =>
      sub.setName('log')
        .setDescription('Log a completed Mythic+ key')
        .addStringOption(o =>
          o.setName('dungeon')
            .setDescription('Dungeon name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(o =>
          o.setName('level').setDescription('Key level').setRequired(true).setMinValue(2).setMaxValue(30)
        )
        .addBooleanOption(o =>
          o.setName('timed').setDescription('Was the key timed?').setRequired(true)
        )
        .addStringOption(o =>
          o.setName('date')
            .setDescription('Date completed (defaults to today), e.g. "2026-04-10"')
        )
        .addUserOption(o => o.setName('member2').setDescription('Group member 2'))
        .addUserOption(o => o.setName('member3').setDescription('Group member 3'))
        .addUserOption(o => o.setName('member4').setDescription('Group member 4'))
        .addUserOption(o => o.setName('member5').setDescription('Group member 5'))
        .addStringOption(o => o.setName('notes').setDescription('Optional notes'))
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('Guild M+ leaderboard (highest keys)')
    )
    .addSubcommand(sub =>
      sub.setName('score')
        .setDescription('Look up a character\'s Raider.IO M+ score')
        .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true))
        .addStringOption(o => o.setName('realm').setDescription('Realm (defaults to your linked realm)'))
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('Show recent M+ runs logged by your guild')
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const matches = MPLUS_DUNGEONS
      .filter(d => d.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map(d => ({ name: d, value: d }));
    return interaction.respond(matches);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'log')         return handleLog(interaction);
    if (sub === 'leaderboard') return handleLeaderboard(interaction);
    if (sub === 'score')       return handleScore(interaction);
    if (sub === 'history')     return handleHistory(interaction);
  },
};

// ── /mplus log ───────────────────────────────────────────────────────────────

async function handleLog(interaction) {
  await interaction.deferReply();

  const dungeon = interaction.options.getString('dungeon');
  const level   = interaction.options.getInteger('level');
  const timed   = interaction.options.getBoolean('timed');
  const dateStr = interaction.options.getString('date');
  const notes   = interaction.options.getString('notes');

  const completedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

  const memberOptions = ['member2', 'member3', 'member4', 'member5'];
  const participants = [{ discord_id: interaction.user.id, role: null, character_name: null }];
  for (const opt of memberOptions) {
    const user = interaction.options.getUser(opt);
    if (user) participants.push({ discord_id: user.id, role: null, character_name: null });
  }

  // Enrich participants with linked character names
  for (const p of participants) {
    const char = db.getCharacter(p.discord_id, interaction.guildId);
    if (char) {
      p.character_name = char.character_name;
      p.role = char.role;
    }
  }

  const runId = db.createMplusRun(
    {
      guild_id:     interaction.guildId,
      dungeon,
      key_level:    level,
      in_time:      timed ? 1 : 0,
      completed_at: completedAt,
      logged_by:    interaction.user.id,
      notes:        notes || null,
    },
    participants
  );

  const mentions = participants.map(p =>
    p.character_name ? `${p.character_name} (<@${p.discord_id}>)` : `<@${p.discord_id}>`
  );

  const embed = buildMplusEmbed(
    { id: runId, dungeon, key_level: level, in_time: timed ? 1 : 0, completed_at: completedAt, notes },
    mentions
  );
  await interaction.editReply({ embeds: [embed] });
}

// ── /mplus leaderboard ───────────────────────────────────────────────────────

async function handleLeaderboard(interaction) {
  await interaction.deferReply();

  const runs = db.getGuildMplusRuns(interaction.guildId, 100);

  // Find each player's highest key
  const highestByPlayer = {};
  for (const run of runs) {
    const ids = (run.participant_ids || '').split(',').filter(Boolean);
    for (const id of ids) {
      if (!highestByPlayer[id] || run.key_level > highestByPlayer[id].key_level) {
        highestByPlayer[id] = run;
      }
    }
  }

  const entries = Object.entries(highestByPlayer)
    .sort(([, a], [, b]) => b.key_level - a.key_level)
    .slice(0, 15);

  if (!entries.length) {
    return interaction.editReply('No M+ runs logged yet. Use `/mplus log` to add one!');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = entries.map(([discordId, run], i) => {
    const medal = medals[i] || `${i + 1}.`;
    const char = db.getCharacter(discordId, interaction.guildId);
    const name = char?.character_name || `<@${discordId}>`;
    const timed = run.in_time ? '✅' : '❌';
    return `${medal} **${name}** — +${run.key_level} ${run.dungeon} ${timed}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🏆 Guild M+ Leaderboard')
    .setColor(0xFFD700)
    .setDescription(lines.join('\n'));

  await interaction.editReply({ embeds: [embed] });
}

// ── /mplus score ─────────────────────────────────────────────────────────────

async function handleScore(interaction) {
  await interaction.deferReply();

  const name  = interaction.options.getString('name');
  const realmOpt = interaction.options.getString('realm');

  // Fall back to linked character's realm
  let realm = realmOpt;
  if (!realm) {
    const char = db.getCharacter(interaction.user.id, interaction.guildId);
    realm = char?.realm;
  }
  if (!realm) {
    return interaction.editReply('❌ Please provide a realm or link a character first.');
  }

  const data = await getRioProfile(name, realm).catch(() => null);
  if (!data) {
    return interaction.editReply(`❌ Character **${name}-${realm}** not found on Raider.IO.`);
  }

  const score = data.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0;
  const recent = data.mythic_plus_recent_runs?.slice(0, 5) || [];

  const embed = new EmbedBuilder()
    .setTitle(`${data.name} — ${data.realm}`)
    .setColor(scoreColor(score))
    .setURL(data.profile_url)
    .addFields({ name: 'M+ Score', value: `**${Math.round(score)}**`, inline: true })
    .setThumbnail(data.thumbnail_url);

  if (recent.length) {
    const recentLines = recent.map(r =>
      `+${r.mythic_level} ${r.dungeon.short_name} — ${r.score.toFixed(1)} pts ${r.num_keystone_upgrades > 0 ? '✅' : '❌'}`
    );
    embed.addFields({ name: 'Recent Runs', value: recentLines.join('\n'), inline: false });
  }

  const progression = data.raid_progression;
  if (progression) {
    const progLines = Object.entries(progression)
      .map(([raid, prog]) => `**${raid}**: ${prog.summary}`)
      .join('\n');
    if (progLines) embed.addFields({ name: 'Raid Progression', value: progLines, inline: false });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ── /mplus history ───────────────────────────────────────────────────────────

async function handleHistory(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const runs = db.getGuildMplusRuns(interaction.guildId, 10);
  if (!runs.length) {
    return interaction.editReply('No M+ runs logged yet.');
  }

  const lines = runs.map(r => {
    const ts = Math.floor(new Date(r.completed_at).getTime() / 1000);
    const timed = r.in_time ? '✅' : '❌';
    return `${timed} +${r.key_level} **${r.dungeon}** — <t:${ts}:D>`;
  });

  const embed = new EmbedBuilder()
    .setTitle('📜 Recent Guild M+ Runs')
    .setColor(0x5865F2)
    .setDescription(lines.join('\n'));

  await interaction.editReply({ embeds: [embed] });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score >= 3000) return 0xFF8000; // orange - mythic tier
  if (score >= 2500) return 0xA335EE; // purple
  if (score >= 2000) return 0x0070DD; // blue
  if (score >= 1500) return 0x1EFF00; // green
  return 0x9D9D9D; // grey
}
