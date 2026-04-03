const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/index');
const { requireOfficer } = require('../../utils/permissions');
const { searchItem } = require('../../utils/blizzard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loot')
    .setDescription('Loot tracking and soft reserves')
    .addSubcommand(sub =>
      sub.setName('reserve')
        .setDescription('Add a soft reserve for an upcoming raid')
        .addIntegerOption(o => o.setName('event_id').setDescription('Raid event ID').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('unreserve')
        .setDescription('Remove a soft reserve')
        .addIntegerOption(o => o.setName('event_id').setDescription('Raid event ID').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Item name to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reserves')
        .setDescription('View all soft reserves for a raid')
        .addIntegerOption(o => o.setName('event_id').setDescription('Raid event ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('award')
        .setDescription('Record loot awarded to a player (officer only)')
        .addUserOption(o => o.setName('player').setDescription('Player who received loot').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true))
        .addStringOption(o =>
          o.setName('type')
            .setDescription('Loot type')
            .addChoices(
              { name: 'Main Spec',  value: 'main_spec' },
              { name: 'Off Spec',   value: 'off_spec'  },
              { name: 'Split Run',  value: 'split'     },
              { name: 'Greed',      value: 'greed'     },
            )
        )
        .addIntegerOption(o => o.setName('event_id').setDescription('Raid event ID (optional)'))
        .addIntegerOption(o => o.setName('ilvl').setDescription('Item level'))
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('View loot history')
        .addUserOption(o => o.setName('player').setDescription('View a specific player\'s history (defaults to all)'))
        .addIntegerOption(o => o.setName('limit').setDescription('Number of entries (default 20)').setMinValue(1).setMaxValue(50))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'reserve')   return handleReserve(interaction);
    if (sub === 'unreserve') return handleUnreserve(interaction);
    if (sub === 'reserves')  return handleViewReserves(interaction);
    if (sub === 'award')     return handleAward(interaction);
    if (sub === 'history')   return handleHistory(interaction);
  },
};

// ── /loot reserve ────────────────────────────────────────────────────────────

async function handleReserve(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const eventId  = interaction.options.getInteger('event_id');
  const itemName = interaction.options.getString('item');
  const event    = db.getRaidEvent(eventId);

  if (!event || event.guild_id !== interaction.guildId) {
    return interaction.editReply('❌ Event not found.');
  }
  if (event.status === 'locked' || event.status === 'completed') {
    return interaction.editReply('❌ This raid is locked — reserves are closed.');
  }

  // Check existing reserve count (limit to 3 per player per raid)
  const existing = db.getPlayerReserves(eventId, interaction.user.id);
  if (existing.length >= 3) {
    return interaction.editReply('❌ You already have 3 soft reserves for this raid (maximum).');
  }
  if (existing.some(r => r.item_name.toLowerCase() === itemName.toLowerCase())) {
    return interaction.editReply(`❌ You already have **${itemName}** reserved.`);
  }

  // Try to find the item ID via Blizzard API
  let itemId = null;
  try {
    const results = await searchItem(itemName);
    const match = results.find(r =>
      (r.data?.name?.en_US || '').toLowerCase() === itemName.toLowerCase()
    ) || results[0];
    if (match) itemId = match.data?.id;
  } catch { /* API not configured */ }

  db.addSoftReserve(eventId, interaction.user.id, itemName, itemId);

  const updatedReserves = db.getPlayerReserves(eventId, interaction.user.id);
  const list = updatedReserves.map(r => `• ${r.item_name}${r.item_id ? ` ([Wowhead](https://www.wowhead.com/item=${r.item_id}))` : ''}`).join('\n');

  await interaction.editReply({
    content: `✅ **${itemName}** added to your reserves for **${event.title}**.\n\nYour reserves (${updatedReserves.length}/3):\n${list}`,
  });
}

// ── /loot unreserve ──────────────────────────────────────────────────────────

async function handleUnreserve(interaction) {
  const eventId  = interaction.options.getInteger('event_id');
  const itemName = interaction.options.getString('item');
  const event    = db.getRaidEvent(eventId);

  if (!event || event.guild_id !== interaction.guildId) {
    return interaction.reply({ content: '❌ Event not found.', ephemeral: true });
  }

  const result = db.removeSoftReserve(eventId, interaction.user.id, itemName);
  if (!result.changes) {
    return interaction.reply({ content: `❌ No reserve for **${itemName}** found.`, ephemeral: true });
  }
  await interaction.reply({ content: `✅ Reserve for **${itemName}** removed.`, ephemeral: true });
}

// ── /loot reserves ───────────────────────────────────────────────────────────

async function handleViewReserves(interaction) {
  await interaction.deferReply();

  const eventId = interaction.options.getInteger('event_id');
  const event   = db.getRaidEvent(eventId);

  if (!event || event.guild_id !== interaction.guildId) {
    return interaction.editReply('❌ Event not found.');
  }

  const reserves = db.getSoftReserves(eventId);
  if (!reserves.length) {
    return interaction.editReply(`No soft reserves for **${event.title}** yet.`);
  }

  // Group by item name and count
  const itemCounts = {};
  for (const r of reserves) {
    const key = r.item_name.toLowerCase();
    if (!itemCounts[key]) itemCounts[key] = { name: r.item_name, id: r.item_id, count: 0, players: [] };
    itemCounts[key].count++;
    itemCounts[key].players.push(r.discord_id);
  }

  const sorted = Object.values(itemCounts).sort((a, b) => b.count - a.count);
  const lines = sorted.map(item => {
    const link = item.id ? `[${item.name}](https://www.wowhead.com/item=${item.id})` : `**${item.name}**`;
    return `${link} — ${item.count} reserve${item.count !== 1 ? 's' : ''}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`🎁 Soft Reserves — ${event.title}`)
    .setColor(0xFFD700)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${reserves.length} total reserve${reserves.length !== 1 ? 's' : ''} from ${sorted.length} unique item${sorted.length !== 1 ? 's' : ''}` });

  await interaction.editReply({ embeds: [embed] });
}

// ── /loot award ──────────────────────────────────────────────────────────────

async function handleAward(interaction) {
  requireOfficer(interaction.member, interaction.guildId);
  await interaction.deferReply({ ephemeral: true });

  const player   = interaction.options.getUser('player');
  const itemName = interaction.options.getString('item');
  const lootType = interaction.options.getString('type') || 'main_spec';
  const eventId  = interaction.options.getInteger('event_id');
  const ilvl     = interaction.options.getInteger('ilvl');

  const char = db.getCharacter(player.id, interaction.guildId);
  const charName = char?.character_name || player.username;

  let itemId = null;
  try {
    const results = await searchItem(itemName);
    const match = results.find(r =>
      (r.data?.name?.en_US || '').toLowerCase() === itemName.toLowerCase()
    ) || results[0];
    if (match) itemId = match.data?.id;
  } catch {}

  db.awardLoot({
    event_id:       eventId || null,
    guild_id:       interaction.guildId,
    discord_id:     player.id,
    character_name: charName,
    item_name:      itemName,
    item_id:        itemId || null,
    item_level:     ilvl || null,
    loot_type:      lootType,
    awarded_by:     interaction.user.id,
  });

  const typeLabel = { main_spec: 'Main Spec', off_spec: 'Off Spec', split: 'Split', greed: 'Greed' }[lootType];
  await interaction.editReply(
    `✅ Recorded: **${charName}** received **${itemName}** (${typeLabel}${ilvl ? `, ilvl ${ilvl}` : ''}).`
  );
}

// ── /loot history ────────────────────────────────────────────────────────────

async function handleHistory(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const playerOpt = interaction.options.getUser('player');
  const limit     = interaction.options.getInteger('limit') || 20;
  const targetId  = playerOpt?.id || null;

  const history = db.getLootHistory(interaction.guildId, targetId, limit);
  if (!history.length) {
    return interaction.editReply('No loot history found.');
  }

  const lines = history.map(entry => {
    const ts = Math.floor(new Date(entry.awarded_at).getTime() / 1000);
    const link = entry.item_id
      ? `[${entry.item_name}](https://www.wowhead.com/item=${entry.item_id})`
      : `**${entry.item_name}**`;
    const ilvl = entry.item_level ? ` (${entry.item_level})` : '';
    return `<t:${ts}:D> **${entry.character_name}** — ${link}${ilvl} [${entry.loot_type.replace('_', ' ')}]`;
  });

  const title = playerOpt ? `Loot History — ${playerOpt.username}` : 'Guild Loot History';
  const embed = new EmbedBuilder()
    .setTitle(`🎁 ${title}`)
    .setColor(0xFFD700)
    .setDescription(lines.join('\n'));

  await interaction.editReply({ embeds: [embed] });
}
