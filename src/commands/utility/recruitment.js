const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/index');
const { requireOfficer } = require('../../utils/permissions');
const { WOW_CLASSES, ROLE_EMOJI } = require('../../utils/constants');

const STATUSES = ['open', 'closed', 'reviewing'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recruitment')
    .setDescription('Manage guild recruitment needs')
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('Show current recruitment openings')
    )
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set recruitment status for a class/spec (officer only)')
        .addStringOption(o =>
          o.setName('class')
            .setDescription('Class name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(o =>
          o.setName('spec')
            .setDescription('Spec name (or "All" for the whole class)')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(o =>
          o.setName('status')
            .setDescription('Recruitment status')
            .setRequired(true)
            .addChoices(
              { name: '🟢 Open',       value: 'open'      },
              { name: '🔴 Closed',     value: 'closed'    },
              { name: '🟡 Reviewing',  value: 'reviewing' },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Clear all recruitment entries (officer only)')
    ),

  async autocomplete(interaction) {
    const focused     = interaction.options.getFocused(true);
    const classOption = interaction.options.getString('class');

    if (focused.name === 'class') {
      const query = focused.value.toLowerCase();
      return interaction.respond(
        Object.keys(WOW_CLASSES)
          .filter(c => c.toLowerCase().includes(query))
          .slice(0, 25)
          .map(c => ({ name: c, value: c }))
      );
    }

    if (focused.name === 'spec' && classOption) {
      const classInfo = WOW_CLASSES[classOption];
      if (!classInfo) return interaction.respond([{ name: 'All', value: 'All' }]);
      const query = focused.value.toLowerCase();
      const specs = [{ name: 'All Specs', value: 'All' }, ...classInfo.specs.map(s => ({ name: s.name, value: s.name }))];
      return interaction.respond(specs.filter(s => s.name.toLowerCase().includes(query)).slice(0, 25));
    }

    return interaction.respond([]);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'view')  return handleView(interaction);
    if (sub === 'set')   return handleSet(interaction);
    if (sub === 'clear') return handleClear(interaction);
  },
};

async function handleView(interaction) {
  const settings = db.getGuildSettings(interaction.guildId);
  const raw = settings?.recruitment_needs;
  const needs = raw ? JSON.parse(raw) : {};

  const entries = Object.entries(needs);
  if (!entries.length) {
    return interaction.reply({ content: 'No recruitment status set. Officers can use `/recruitment set` to add entries.', ephemeral: true });
  }

  const groupedByStatus = { open: [], reviewing: [], closed: [] };
  for (const [key, status] of entries) {
    groupedByStatus[status]?.push(key);
  }

  const fields = [];
  if (groupedByStatus.open.length) {
    fields.push({ name: '🟢 Open', value: groupedByStatus.open.join('\n'), inline: true });
  }
  if (groupedByStatus.reviewing.length) {
    fields.push({ name: '🟡 Reviewing', value: groupedByStatus.reviewing.join('\n'), inline: true });
  }
  if (groupedByStatus.closed.length) {
    fields.push({ name: '🔴 Closed', value: groupedByStatus.closed.join('\n'), inline: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('📢 Guild Recruitment')
    .setColor(0x5865F2)
    .addFields(fields);

  await interaction.reply({ embeds: [embed] });
}

async function handleSet(interaction) {
  requireOfficer(interaction.member, interaction.guildId);

  const className = interaction.options.getString('class');
  const spec      = interaction.options.getString('spec');
  const status    = interaction.options.getString('status');
  const key       = spec === 'All' ? className : `${spec} ${className}`;

  const settings = db.getGuildSettings(interaction.guildId);
  const needs = settings?.recruitment_needs ? JSON.parse(settings.recruitment_needs) : {};
  needs[key] = status;

  db.upsertGuildSettings(interaction.guildId, { recruitment_needs: JSON.stringify(needs) });

  const emoji = { open: '🟢', reviewing: '🟡', closed: '🔴' }[status];
  await interaction.reply({ content: `${emoji} **${key}** recruitment is now **${status}**.`, ephemeral: true });
}

async function handleClear(interaction) {
  requireOfficer(interaction.member, interaction.guildId);
  db.upsertGuildSettings(interaction.guildId, { recruitment_needs: '{}' });
  await interaction.reply({ content: '✅ Recruitment board cleared.', ephemeral: true });
}
