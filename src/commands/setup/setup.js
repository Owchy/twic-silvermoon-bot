const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const db = require('../../database/index');
const { requireOfficer } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Silvermoon for this server (officer only)')
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('Show current bot configuration')
    )
    .addSubcommand(sub =>
      sub.setName('configure')
        .setDescription('Set bot configuration options')
        .addChannelOption(o =>
          o.setName('raid_channel')
            .setDescription('Default channel for raid event posts')
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption(o =>
          o.setName('log_channel')
            .setDescription('Channel for bot activity logs')
            .addChannelTypes(ChannelType.GuildText)
        )
        .addRoleOption(o => o.setName('officer_role').setDescription('Role that has officer permissions in Silvermoon'))
        .addRoleOption(o => o.setName('raider_role').setDescription('Raider role'))
        .addRoleOption(o => o.setName('trial_role').setDescription('Trial raider role'))
        .addStringOption(o => o.setName('guild_name').setDescription('In-game guild name'))
        .addStringOption(o => o.setName('realm').setDescription('Primary realm, e.g. "Area-52"'))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'view')      return handleView(interaction);
    if (sub === 'configure') return handleConfigure(interaction);
  },
};

async function handleView(interaction) {
  requireOfficer(interaction.member, interaction.guildId);

  const s = db.getGuildSettings(interaction.guildId);
  const mention = (id) => id ? `<#${id}>` : '*Not set*';
  const roleM   = (id) => id ? `<@&${id}>` : '*Not set*';

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Silvermoon Configuration')
    .setColor(0x5865F2)
    .addFields(
      { name: 'Guild Name',    value: s?.guild_name || '*Not set*',     inline: true },
      { name: 'Realm',         value: s?.realm || '*Not set*',          inline: true },
      { name: '\u200B',        value: '\u200B',                         inline: true },
      { name: 'Raid Channel',  value: mention(s?.raid_channel_id),      inline: true },
      { name: 'Log Channel',   value: mention(s?.log_channel_id),       inline: true },
      { name: '\u200B',        value: '\u200B',                         inline: true },
      { name: 'Officer Role',  value: roleM(s?.officer_role_id),        inline: true },
      { name: 'Raider Role',   value: roleM(s?.raider_role_id),         inline: true },
      { name: 'Trial Role',    value: roleM(s?.trial_role_id),          inline: true },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleConfigure(interaction) {
  requireOfficer(interaction.member, interaction.guildId);

  const fields = {};
  const raidCh   = interaction.options.getChannel('raid_channel');
  const logCh    = interaction.options.getChannel('log_channel');
  const officer  = interaction.options.getRole('officer_role');
  const raider   = interaction.options.getRole('raider_role');
  const trial    = interaction.options.getRole('trial_role');
  const name     = interaction.options.getString('guild_name');
  const realm    = interaction.options.getString('realm');

  if (raidCh)  fields.raid_channel_id  = raidCh.id;
  if (logCh)   fields.log_channel_id   = logCh.id;
  if (officer) fields.officer_role_id  = officer.id;
  if (raider)  fields.raider_role_id   = raider.id;
  if (trial)   fields.trial_role_id    = trial.id;
  if (name)    fields.guild_name       = name;
  if (realm)   fields.realm            = realm;

  if (!Object.keys(fields).length) {
    return interaction.reply({ content: '❌ No changes provided.', ephemeral: true });
  }

  db.upsertGuildSettings(interaction.guildId, fields);

  const changed = Object.keys(fields).map(k => `• ${k.replace(/_/g, ' ')}`).join('\n');
  await interaction.reply({ content: `✅ Configuration updated:\n${changed}`, ephemeral: true });
}
