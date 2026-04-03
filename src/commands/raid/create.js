const { SlashCommandBuilder, ChannelType } = require('discord.js');
const db = require('../../database/index');
const { buildRaidEmbed, buildRaidButtons } = require('../../utils/embeds');
const { requireOfficer } = require('../../utils/permissions');
const { DIFFICULTY_COLORS } = require('../../utils/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Raid event commands')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new raid sign-up event')
        .addStringOption(o => o.setName('title').setDescription('Raid title, e.g. "Heroic Amirdrassil"').setRequired(true))
        .addStringOption(o =>
          o.setName('difficulty')
            .setDescription('Raid difficulty')
            .setRequired(true)
            .addChoices(
              { name: 'LFR',     value: 'LFR'     },
              { name: 'Normal',  value: 'Normal'  },
              { name: 'Heroic',  value: 'Heroic'  },
              { name: 'Mythic',  value: 'Mythic'  },
            )
        )
        .addStringOption(o =>
          o.setName('date')
            .setDescription('Date in any clear format, e.g. "2026-04-10" or "April 10 2026"')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('time')
            .setDescription('Time with timezone, e.g. "8:00 PM EST"')
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName('max_size')
            .setDescription('Maximum roster size (default: 20)')
            .setMinValue(1).setMaxValue(40)
        )
        .addStringOption(o => o.setName('description').setDescription('Optional description or notes'))
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Channel to post the event in (defaults to guild raid channel or current channel)')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a raid event (officer only)')
        .addIntegerOption(o => o.setName('event_id').setDescription('Event ID to delete').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List upcoming raid events')
    )
    .addSubcommand(sub =>
      sub.setName('lock')
        .setDescription('Lock/unlock the raid roster (officer only)')
        .addIntegerOption(o => o.setName('event_id').setDescription('Event ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('bench')
        .setDescription('Bench or un-bench a player (officer only)')
        .addIntegerOption(o => o.setName('event_id').setDescription('Event ID').setRequired(true))
        .addUserOption(o => o.setName('player').setDescription('Discord user to bench').setRequired(true))
        .addStringOption(o => o.setName('note').setDescription('Optional reason'))
    )
    .addSubcommand(sub =>
      sub.setName('absent')
        .setDescription('Mark a player as absent (officer only)')
        .addIntegerOption(o => o.setName('event_id').setDescription('Event ID').setRequired(true))
        .addUserOption(o => o.setName('player').setDescription('Discord user').setRequired(true))
        .addStringOption(o => o.setName('note').setDescription('Optional reason'))
    )
    .addSubcommand(sub =>
      sub.setName('logs')
        .setDescription('Attach a WarcraftLogs URL to a raid event')
        .addIntegerOption(o => o.setName('event_id').setDescription('Event ID').setRequired(true))
        .addStringOption(o => o.setName('url').setDescription('WarcraftLogs report URL').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('complete')
        .setDescription('Mark a raid event as completed (officer only)')
        .addIntegerOption(o => o.setName('event_id').setDescription('Event ID').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') return handleCreate(interaction);
    if (sub === 'delete') return handleDelete(interaction);
    if (sub === 'list')   return handleList(interaction);
    if (sub === 'lock')   return handleLock(interaction);
    if (sub === 'bench')  return handleBenchAbsent(interaction, 'benched');
    if (sub === 'absent') return handleBenchAbsent(interaction, 'absent');
    if (sub === 'logs')   return handleLogs(interaction);
    if (sub === 'complete') return handleComplete(interaction);
  },
};

// ── /raid create ─────────────────────────────────────────────────────────────

async function handleCreate(interaction) {
  requireOfficer(interaction.member, interaction.guildId);
  await interaction.deferReply({ ephemeral: true });

  const title       = interaction.options.getString('title');
  const difficulty  = interaction.options.getString('difficulty');
  const dateStr     = interaction.options.getString('date');
  const timeStr     = interaction.options.getString('time');
  const maxSize     = interaction.options.getInteger('max_size') || 20;
  const description = interaction.options.getString('description');
  const channelOpt  = interaction.options.getChannel('channel');

  // Parse the date + time into an ISO timestamp
  const raidDate = parseRaidDateTime(dateStr, timeStr);
  if (!raidDate) {
    return interaction.editReply('❌ Could not parse the date/time. Try a format like `2026-04-10` and `8:00 PM EST`.');
  }

  // Determine target channel
  const settings = db.getGuildSettings(interaction.guildId);
  const targetChannel = channelOpt
    || (settings?.raid_channel_id ? interaction.guild.channels.cache.get(settings.raid_channel_id) : null)
    || interaction.channel;

  const eventId = db.createRaidEvent({
    guild_id:    interaction.guildId,
    title,
    description: description || null,
    raid_date:   raidDate.toISOString(),
    difficulty,
    max_size:    maxSize,
    created_by:  interaction.user.id,
    channel_id:  targetChannel.id,
  });

  const event   = db.getRaidEvent(eventId);
  const signups = db.getRaidSignups(eventId);
  const embed   = buildRaidEmbed(event, signups);
  const buttons = buildRaidButtons(eventId);

  const msg = await targetChannel.send({ embeds: [embed], components: [buttons] });

  db.updateRaidEvent(eventId, { message_id: msg.id });
  await interaction.editReply(`✅ Raid event **${title}** created in ${targetChannel} (ID: \`${eventId}\`).`);
}

// ── /raid delete ─────────────────────────────────────────────────────────────

async function handleDelete(interaction) {
  requireOfficer(interaction.member, interaction.guildId);
  const eventId = interaction.options.getInteger('event_id');
  const event = db.getRaidEvent(eventId);
  if (!event || event.guild_id !== interaction.guildId) {
    return interaction.reply({ content: '❌ Event not found.', ephemeral: true });
  }

  // Try to delete the Discord message
  if (event.message_id) {
    try {
      const ch = interaction.guild.channels.cache.get(event.channel_id);
      const msg = await ch?.messages.fetch(event.message_id);
      await msg?.delete();
    } catch {}
  }

  db.deleteRaidEvent(eventId);
  await interaction.reply({ content: `🗑️ Raid event **${event.title}** (ID: ${eventId}) deleted.`, ephemeral: true });
}

// ── /raid list ───────────────────────────────────────────────────────────────

async function handleList(interaction) {
  const events = db.getUpcomingRaidEvents(interaction.guildId);
  if (!events.length) {
    return interaction.reply({ content: 'No upcoming raid events.', ephemeral: true });
  }

  const lines = events.map(e => {
    const ts = Math.floor(new Date(e.raid_date).getTime() / 1000);
    const signups = db.getRaidSignups(e.id);
    const confirmed = signups.filter(s => ['accepted', 'late'].includes(s.status)).length;
    return `\`${e.id}\` **${e.title}** — <t:${ts}:F> — ${confirmed}/${e.max_size} signed up (${e.status})`;
  });

  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

// ── /raid lock ───────────────────────────────────────────────────────────────

async function handleLock(interaction) {
  requireOfficer(interaction.member, interaction.guildId);
  const eventId = interaction.options.getInteger('event_id');
  const event = db.getRaidEvent(eventId);
  if (!event || event.guild_id !== interaction.guildId) {
    return interaction.reply({ content: '❌ Event not found.', ephemeral: true });
  }

  const newStatus = event.status === 'locked' ? 'open' : 'locked';
  db.updateRaidEvent(eventId, { status: newStatus });

  // Update the embed
  await refreshRaidMessage(interaction, event, eventId, newStatus);
  await interaction.reply({ content: `🔒 Raid **${event.title}** is now **${newStatus}**.`, ephemeral: true });
}

// ── /raid bench & absent ─────────────────────────────────────────────────────

async function handleBenchAbsent(interaction, status) {
  requireOfficer(interaction.member, interaction.guildId);
  const eventId = interaction.options.getInteger('event_id');
  const player  = interaction.options.getUser('player');
  const note    = interaction.options.getString('note');
  const event   = db.getRaidEvent(eventId);

  if (!event || event.guild_id !== interaction.guildId) {
    return interaction.reply({ content: '❌ Event not found.', ephemeral: true });
  }

  const existing = db.getSignup(eventId, player.id);
  if (!existing) {
    return interaction.reply({ content: `❌ ${player.username} has no sign-up for this event.`, ephemeral: true });
  }

  db.upsertSignup({ ...existing, status, note: note || existing.note });
  await refreshRaidMessage(interaction, event, eventId, event.status);

  const emoji = status === 'benched' ? '🪑' : '🔴';
  await interaction.reply({
    content: `${emoji} **${existing.character_name}** marked as **${status}** for ${event.title}.`,
    ephemeral: true,
  });
}

// ── /raid logs ───────────────────────────────────────────────────────────────

async function handleLogs(interaction) {
  requireOfficer(interaction.member, interaction.guildId);
  const eventId = interaction.options.getInteger('event_id');
  const url = interaction.options.getString('url');
  const event = db.getRaidEvent(eventId);

  if (!event || event.guild_id !== interaction.guildId) {
    return interaction.reply({ content: '❌ Event not found.', ephemeral: true });
  }

  db.updateRaidEvent(eventId, { warcraftlogs: url });
  await refreshRaidMessage(interaction, event, eventId, event.status);
  await interaction.reply({ content: `📊 WarcraftLogs attached to **${event.title}**.`, ephemeral: true });
}

// ── /raid complete ────────────────────────────────────────────────────────────

async function handleComplete(interaction) {
  requireOfficer(interaction.member, interaction.guildId);
  const eventId = interaction.options.getInteger('event_id');
  const event = db.getRaidEvent(eventId);

  if (!event || event.guild_id !== interaction.guildId) {
    return interaction.reply({ content: '❌ Event not found.', ephemeral: true });
  }

  db.updateRaidEvent(eventId, { status: 'completed' });
  await interaction.reply({ content: `✅ **${event.title}** marked as completed.`, ephemeral: true });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function refreshRaidMessage(interaction, originalEvent, eventId, newStatus) {
  const updatedEvent = db.getRaidEvent(eventId);
  const signups = db.getRaidSignups(eventId);
  const embed = buildRaidEmbed(updatedEvent, signups);
  const buttons = buildRaidButtons(eventId, newStatus === 'locked');

  try {
    const ch = interaction.guild.channels.cache.get(originalEvent.channel_id);
    const msg = await ch?.messages.fetch(originalEvent.message_id);
    if (msg) await msg.edit({ embeds: [embed], components: [buttons] });
  } catch {}
}

function parseRaidDateTime(dateStr, timeStr) {
  // Combine and try native parsing
  const combined = `${dateStr} ${timeStr}`;
  let d = new Date(combined);
  if (!isNaN(d)) return d;

  // Try stripping timezone abbreviations for parsing (EST, CST, PST, etc.)
  const withoutTz = combined.replace(/\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/gi, '').trim();
  d = new Date(withoutTz);
  if (!isNaN(d)) return d;

  return null;
}
