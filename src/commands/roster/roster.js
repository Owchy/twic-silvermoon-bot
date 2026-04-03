const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/index');
const { requireOfficer } = require('../../utils/permissions');
const { WOW_CLASSES, RANK_LABEL, ROLE_EMOJI } = require('../../utils/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roster')
    .setDescription('Guild roster management')
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View the guild roster')
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a member to the roster (officer only)')
        .addUserOption(o => o.setName('player').setDescription('Discord user').setRequired(true))
        .addStringOption(o =>
          o.setName('rank')
            .setDescription('Guild rank')
            .setRequired(true)
            .addChoices(
              { name: 'Guild Master', value: 'gm'      },
              { name: 'Officer',      value: 'officer'  },
              { name: 'Raider',       value: 'raider'   },
              { name: 'Trial',        value: 'trial'    },
              { name: 'Social',       value: 'social'   },
              { name: 'Alt',          value: 'alt'      },
            )
        )
        .addStringOption(o => o.setName('notes').setDescription('Optional notes about this member'))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a member from the roster (officer only)')
        .addUserOption(o => o.setName('player').setDescription('Discord user').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('promote')
        .setDescription('Change a member\'s rank (officer only)')
        .addUserOption(o => o.setName('player').setDescription('Discord user').setRequired(true))
        .addStringOption(o =>
          o.setName('rank')
            .setDescription('New rank')
            .setRequired(true)
            .addChoices(
              { name: 'Guild Master', value: 'gm'      },
              { name: 'Officer',      value: 'officer'  },
              { name: 'Raider',       value: 'raider'   },
              { name: 'Trial',        value: 'trial'    },
              { name: 'Social',       value: 'social'   },
              { name: 'Alt',          value: 'alt'      },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('attendance')
        .setDescription('View attendance for yourself or another member')
        .addUserOption(o => o.setName('player').setDescription('Discord user (defaults to you)'))
    )
    .addSubcommand(sub =>
      sub.setName('attendance_all')
        .setDescription('View attendance summary for all raiders (officer only)')
        .addStringOption(o =>
          o.setName('since')
            .setDescription('Only count raids since this date (e.g. 2026-01-01). Defaults to 90 days ago.')
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'view')           return handleView(interaction);
    if (sub === 'add')            return handleAdd(interaction);
    if (sub === 'remove')         return handleRemove(interaction);
    if (sub === 'promote')        return handlePromote(interaction);
    if (sub === 'attendance')     return handleAttendance(interaction);
    if (sub === 'attendance_all') return handleAttendanceAll(interaction);
  },
};

// ── /roster view ─────────────────────────────────────────────────────────────

async function handleView(interaction) {
  await interaction.deferReply();

  const members = db.getFullRoster(interaction.guildId);
  if (!members.length) {
    return interaction.editReply('No roster entries found. Officers can add members with `/roster add`.');
  }

  // Group by rank
  const grouped = {};
  for (const m of members) {
    if (!grouped[m.rank]) grouped[m.rank] = [];
    grouped[m.rank].push(m);
  }

  const rankOrder = ['gm', 'officer', 'raider', 'trial', 'social', 'alt'];
  const embed = new EmbedBuilder()
    .setTitle('📋 Guild Roster')
    .setColor(0x5865F2)
    .setFooter({ text: `${members.length} total members` });

  for (const rank of rankOrder) {
    const group = grouped[rank];
    if (!group?.length) continue;

    const lines = group.map(m => {
      const classInfo = WOW_CLASSES[m.class];
      const roleEmoji = ROLE_EMOJI[m.role] || '';
      const classEmoji = classInfo?.emoji || '';
      const name = m.character_name || `<@${m.discord_id}>`;
      const ilvl = m.item_level ? ` — ${m.item_level} ilvl` : '';
      const spec = m.spec && m.class ? ` ${m.spec} ${m.class}` : '';
      return `${classEmoji}${roleEmoji} **${name}**${spec}${ilvl}`;
    });

    embed.addFields({
      name: RANK_LABEL[rank] || rank,
      value: lines.join('\n'),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ── /roster add ──────────────────────────────────────────────────────────────

async function handleAdd(interaction) {
  requireOfficer(interaction.member, interaction.guildId);

  const player = interaction.options.getUser('player');
  const rank   = interaction.options.getString('rank');
  const notes  = interaction.options.getString('notes');

  db.upsertRosterEntry(player.id, interaction.guildId, {
    rank,
    notes:       notes || null,
    is_trial:    rank === 'trial' ? 1 : 0,
    trial_since: rank === 'trial' ? new Date().toISOString() : null,
  });

  await interaction.reply({
    content: `✅ **${player.username}** added to the roster as **${RANK_LABEL[rank] || rank}**.`,
    ephemeral: true,
  });
}

// ── /roster remove ───────────────────────────────────────────────────────────

async function handleRemove(interaction) {
  requireOfficer(interaction.member, interaction.guildId);

  const player = interaction.options.getUser('player');
  const result = db.removeFromRoster(player.id, interaction.guildId);

  if (!result.changes) {
    return interaction.reply({ content: `❌ ${player.username} is not on the roster.`, ephemeral: true });
  }
  await interaction.reply({ content: `✅ **${player.username}** removed from the roster.`, ephemeral: true });
}

// ── /roster promote ──────────────────────────────────────────────────────────

async function handlePromote(interaction) {
  requireOfficer(interaction.member, interaction.guildId);

  const player = interaction.options.getUser('player');
  const rank   = interaction.options.getString('rank');
  const entry  = db.getRosterEntry(player.id, interaction.guildId);

  if (!entry) {
    return interaction.reply({ content: `❌ ${player.username} is not on the roster. Use \`/roster add\` first.`, ephemeral: true });
  }

  const updates = { rank, is_trial: rank === 'trial' ? 1 : 0 };
  if (rank === 'trial' && !entry.trial_since) updates.trial_since = new Date().toISOString();
  if (rank !== 'trial') { updates.is_trial = 0; updates.trial_since = null; }

  db.upsertRosterEntry(player.id, interaction.guildId, updates);
  await interaction.reply({
    content: `✅ **${player.username}** is now **${RANK_LABEL[rank] || rank}**.`,
    ephemeral: true,
  });
}

// ── /roster attendance ───────────────────────────────────────────────────────

async function handleAttendance(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser('player') || interaction.user;
  const history    = db.getAttendance(targetUser.id, interaction.guildId, 20);

  if (!history.length) {
    return interaction.editReply(`No raid history found for **${targetUser.username}**.`);
  }

  const attended = history.filter(r => ['accepted', 'late'].includes(r.status)).length;
  const pct = Math.round((attended / history.length) * 100);

  const lines = history.map(r => {
    const ts = Math.floor(new Date(r.raid_date).getTime() / 1000);
    const emoji = { accepted: '✅', late: '⏰', tentative: '❓', declined: '❌', benched: '🪑', absent: '🔴' }[r.status] || '•';
    return `${emoji} <t:${ts}:D> — ${r.difficulty} ${r.title}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`📊 Attendance — ${targetUser.username}`)
    .setColor(pct >= 75 ? 0x1EFF00 : pct >= 50 ? 0xFFD700 : 0xFF4444)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${attended}/${history.length} attended (${pct}%)` });

  await interaction.editReply({ embeds: [embed] });
}

// ── /roster attendance_all ───────────────────────────────────────────────────

async function handleAttendanceAll(interaction) {
  requireOfficer(interaction.member, interaction.guildId);
  await interaction.deferReply({ ephemeral: true });

  const sinceOpt = interaction.options.getString('since');
  const since    = sinceOpt ? new Date(sinceOpt).toISOString() : new Date(Date.now() - 90 * 86400000).toISOString();

  const summary = db.getRaidAttendanceSummary(interaction.guildId, since);
  if (!summary.length) {
    return interaction.editReply('No attendance data found for the given period.');
  }

  const lines = summary.slice(0, 20).map((row, i) => {
    const char = db.getCharacter(row.discord_id, interaction.guildId);
    const name = char?.character_name || `<@${row.discord_id}>`;
    const pct  = Math.round((row.attended / row.total) * 100);
    const bench = row.benched > 0 ? ` 🪑×${row.benched}` : '';
    return `${i + 1}. **${name}** — ${row.attended}/${row.total} (${pct}%)${bench}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('📊 Raid Attendance Summary')
    .setColor(0x5865F2)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Since ${new Date(since).toLocaleDateString()}` });

  await interaction.editReply({ embeds: [embed] });
}
