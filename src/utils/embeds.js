const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  WOW_CLASSES, DIFFICULTY_COLORS, DIFFICULTY_EMOJI,
  STATUS_EMOJI, ROLE_EMOJI, BUFF_PROVIDERS,
} = require('./constants');

// ── Raid Event Embed ─────────────────────────────────────────────────────────

function buildRaidEmbed(event, signups) {
  const accepted  = signups.filter(s => s.status === 'accepted');
  const late      = signups.filter(s => s.status === 'late');
  const tentative = signups.filter(s => s.status === 'tentative');
  const declined  = signups.filter(s => s.status === 'declined');
  const benched   = signups.filter(s => s.status === 'benched');
  const absent    = signups.filter(s => s.status === 'absent');

  const confirmedPlayers = [...accepted, ...late];
  const tanks   = confirmedPlayers.filter(s => s.role === 'tank');
  const healers = confirmedPlayers.filter(s => s.role === 'healer');
  const dps     = confirmedPlayers.filter(s => s.role === 'dps');

  const totalConfirmed = confirmedPlayers.length;
  const spotsLeft = Math.max(0, event.max_size - totalConfirmed);

  const color = event.status === 'locked'
    ? 0x5865F2
    : (DIFFICULTY_COLORS[event.difficulty] || 0x5865F2);

  const diffEmoji = DIFFICULTY_EMOJI[event.difficulty] || '⚔️';
  const statusTag = event.status === 'locked' ? ' 🔒 **LOCKED**' : '';
  const timestamp = Math.floor(new Date(event.raid_date).getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`${diffEmoji} ${event.title}${statusTag}`)
    .setColor(color)
    .setDescription(
      [
        `📅 <t:${timestamp}:F>  •  <t:${timestamp}:R>`,
        event.description ? `\n${event.description}` : '',
        event.warcraftlogs ? `\n📊 [WarcraftLogs](${event.warcraftlogs})` : '',
      ].filter(Boolean).join('\n')
    )
    .setFooter({ text: `${event.difficulty} • ${totalConfirmed}/${event.max_size} signed up${spotsLeft > 0 ? ` • ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} remaining` : ' • Full'}` });

  // Buff coverage
  const signedUpClasses = new Set(confirmedPlayers.map(s => s.class));
  const missingBuffs = Object.entries(BUFF_PROVIDERS)
    .filter(([, providers]) => !providers.some(c => signedUpClasses.has(c)))
    .map(([buff]) => buff);

  if (missingBuffs.length) {
    embed.addFields({ name: '⚠️ Missing Buffs', value: missingBuffs.join(', '), inline: false });
  }

  // Role sections
  if (tanks.length > 0 || healers.length > 0 || dps.length > 0) {
    embed.addFields(
      {
        name: `${ROLE_EMOJI.tank} Tanks (${tanks.length})`,
        value: tanks.length ? tanks.map(formatSignupLine).join('\n') : '*None*',
        inline: true,
      },
      {
        name: `${ROLE_EMOJI.healer} Healers (${healers.length})`,
        value: healers.length ? healers.map(formatSignupLine).join('\n') : '*None*',
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: true }, // spacer
      {
        name: `${ROLE_EMOJI.dps} DPS (${dps.length})`,
        value: dps.length ? dps.map(formatSignupLine).join('\n') : '*None*',
        inline: false,
      }
    );
  }

  const secondaryLines = [
    ...late.map(s => `⏰ ${formatSignupLine(s)}`),
    ...tentative.map(s => `❓ ${formatSignupLine(s)}`),
    ...benched.map(s => `🪑 ${formatSignupLine(s)}`),
    ...absent.map(s => `🔴 ${formatSignupLine(s)}`),
    ...declined.map(s => `❌ ${formatSignupLine(s)}`),
  ];

  if (secondaryLines.length) {
    embed.addFields({
      name: 'Other',
      value: secondaryLines.join('\n'),
      inline: false,
    });
  }

  return embed;
}

function formatSignupLine(s) {
  const classInfo = WOW_CLASSES[s.class];
  const emoji = classInfo?.emoji || '•';
  return `${emoji} **${s.character_name}** — ${s.spec} ${s.class}`;
}

function buildRaidButtons(eventId, locked = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid_accept:${eventId}`)
      .setLabel('Accept')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId(`raid_late:${eventId}`)
      .setLabel('Late')
      .setEmoji('⏰')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId(`raid_tentative:${eventId}`)
      .setLabel('Tentative')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId(`raid_decline:${eventId}`)
      .setLabel('Decline')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(locked),
  );
  return row;
}

// ── Character Embed ──────────────────────────────────────────────────────────

function buildCharacterEmbed(char, rioData = null, blizzardData = null) {
  const classInfo = WOW_CLASSES[char.class] || {};
  const embed = new EmbedBuilder()
    .setTitle(`${classInfo.emoji || ''} ${char.character_name} — ${char.realm}`)
    .setColor(classInfo.color || 0x5865F2)
    .addFields(
      { name: 'Class / Spec', value: `${char.spec} ${char.class}`, inline: true },
      { name: 'Role', value: char.role.charAt(0).toUpperCase() + char.role.slice(1), inline: true },
      { name: 'Item Level', value: char.item_level ? `${char.item_level}` : 'Unknown', inline: true },
    );

  if (rioData) {
    const score = rioData.mythic_plus_scores_by_season?.[0]?.scores?.all;
    const progression = rioData.raid_progression;
    if (score !== undefined) {
      embed.addFields({ name: 'M+ Score', value: `${Math.round(score)}`, inline: true });
    }
    if (progression) {
      const raids = Object.entries(progression)
        .map(([raid, prog]) => `**${raid}**: ${prog.summary}`)
        .join('\n');
      if (raids) embed.addFields({ name: 'Raid Progression', value: raids, inline: false });
    }
    embed.setURL(`https://raider.io/characters/us/${encodeURIComponent(char.realm)}/${encodeURIComponent(char.character_name)}`);
  }

  return embed;
}

// ── Item Embed ───────────────────────────────────────────────────────────────

const ITEM_QUALITY_COLORS = {
  1: 0x9D9D9D, // Poor (grey)
  2: 0xFFFFFF, // Common (white)
  3: 0x1EFF00, // Uncommon (green)
  4: 0x0070DD, // Rare (blue)
  5: 0xA335EE, // Epic (purple)
  6: 0xFF8000, // Legendary (orange)
  7: 0xE6CC80, // Artifact (gold)
};

function buildItemEmbed(item) {
  const quality = item.quality?.type || 'COMMON';
  const qualityMap = { POOR: 1, COMMON: 2, UNCOMMON: 3, RARE: 4, EPIC: 5, LEGENDARY: 6, ARTIFACT: 7 };
  const color = ITEM_QUALITY_COLORS[qualityMap[quality] || 2];

  const embed = new EmbedBuilder()
    .setTitle(item.name?.en_US || item.name || 'Unknown Item')
    .setColor(color)
    .setURL(`https://www.wowhead.com/item=${item.id}`)
    .setFooter({ text: `Item ID: ${item.id}` });

  const fields = [];
  if (item.item_subclass?.name?.en_US) fields.push({ name: 'Type', value: item.item_subclass.name.en_US, inline: true });
  if (item.level) fields.push({ name: 'Item Level', value: `${item.level}`, inline: true });
  if (item.required_level) fields.push({ name: 'Req. Level', value: `${item.required_level}`, inline: true });
  if (item.inventory_type?.name?.en_US) fields.push({ name: 'Slot', value: item.inventory_type.name.en_US, inline: true });

  if (fields.length) embed.addFields(fields);
  if (item.icon) embed.setThumbnail(item.icon);

  return embed;
}

// ── M+ Run Embed ─────────────────────────────────────────────────────────────

function buildMplusEmbed(run, participantMentions = []) {
  const timed = run.in_time === 1;
  const color = timed ? 0x1EFF00 : 0xFF4444;
  const timestamp = Math.floor(new Date(run.completed_at).getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`${timed ? '✅' : '❌'} +${run.key_level} ${run.dungeon}`)
    .setColor(color)
    .addFields(
      { name: 'Key Level', value: `+${run.key_level}`, inline: true },
      { name: 'Result', value: timed ? 'Timed' : 'Depleted', inline: true },
      { name: 'Date', value: `<t:${timestamp}:D>`, inline: true },
    );

  if (participantMentions.length) {
    embed.addFields({ name: 'Group', value: participantMentions.join(', '), inline: false });
  }
  if (run.notes) {
    embed.addFields({ name: 'Notes', value: run.notes, inline: false });
  }

  return embed;
}

// ── WoW Token Embed ──────────────────────────────────────────────────────────

function buildTokenEmbed(tokenData) {
  const gold = Math.floor(tokenData.price / 10000).toLocaleString();
  const updated = Math.floor(tokenData.last_updated_timestamp / 1000);

  return new EmbedBuilder()
    .setTitle('💰 WoW Token Price')
    .setColor(0xFFD700)
    .setDescription(`**${gold}g**`)
    .setFooter({ text: `Last updated` })
    .setTimestamp(new Date(tokenData.last_updated_timestamp));
}

module.exports = {
  buildRaidEmbed, buildRaidButtons,
  buildCharacterEmbed,
  buildItemEmbed,
  buildMplusEmbed,
  buildTokenEmbed,
};
