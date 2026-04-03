const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/index');
const { buildCharacterEmbed } = require('../../utils/embeds');
const { WOW_CLASSES } = require('../../utils/constants');
const { getCharacterProfile: getRioProfile } = require('../../utils/raiderio');
const { getCharacterProfile: getBlizzProfile } = require('../../utils/blizzard');

const CLASS_NAMES = Object.keys(WOW_CLASSES);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('character')
    .setDescription('Manage your linked WoW character')
    .addSubcommand(sub =>
      sub.setName('link')
        .setDescription('Link your WoW character to Discord')
        .addStringOption(o =>
          o.setName('name').setDescription('Character name').setRequired(true)
        )
        .addStringOption(o =>
          o.setName('realm').setDescription('Realm name, e.g. "Area-52"').setRequired(true)
        )
        .addStringOption(o =>
          o.setName('class')
            .setDescription('Your class')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(o =>
          o.setName('spec')
            .setDescription('Your spec')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addBooleanOption(o =>
          o.setName('set_as_main').setDescription('Set as main character (default: yes)')
        )
    )
    .addSubcommand(sub =>
      sub.setName('unlink')
        .setDescription('Unlink a character')
        .addStringOption(o => o.setName('name').setDescription('Character name to remove').setRequired(true))
        .addStringOption(o => o.setName('realm').setDescription('Realm name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Show character info for yourself or another member')
        .addUserOption(o => o.setName('user').setDescription('Discord user (defaults to you)'))
        .addBooleanOption(o => o.setName('detailed').setDescription('Fetch live Raider.IO data'))
    )
    .addSubcommand(sub =>
      sub.setName('setmain')
        .setDescription('Change which character is your main')
        .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true))
        .addStringOption(o => o.setName('realm').setDescription('Realm name').setRequired(true))
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const classOption = interaction.options.getString('class');

    if (focused.name === 'class') {
      const query = focused.value.toLowerCase();
      const matches = CLASS_NAMES
        .filter(c => c.toLowerCase().includes(query))
        .slice(0, 25)
        .map(c => ({ name: c, value: c }));
      return interaction.respond(matches);
    }

    if (focused.name === 'spec' && classOption) {
      const classInfo = WOW_CLASSES[classOption];
      if (!classInfo) return interaction.respond([]);
      const query = focused.value.toLowerCase();
      const matches = classInfo.specs
        .filter(s => s.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map(s => ({ name: `${s.name} (${s.role})`, value: s.name }));
      return interaction.respond(matches);
    }

    return interaction.respond([]);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'link')    return handleLink(interaction);
    if (sub === 'unlink')  return handleUnlink(interaction);
    if (sub === 'info')    return handleInfo(interaction);
    if (sub === 'setmain') return handleSetMain(interaction);
  },
};

// ── /character link ──────────────────────────────────────────────────────────

async function handleLink(interaction) {
  const name     = interaction.options.getString('name');
  const realm    = interaction.options.getString('realm');
  const className = interaction.options.getString('class');
  const specName  = interaction.options.getString('spec');
  const setMain   = interaction.options.getBoolean('set_as_main') ?? true;

  const classInfo = WOW_CLASSES[className];
  if (!classInfo) {
    return interaction.reply({ content: `❌ Unknown class "${className}".`, ephemeral: true });
  }

  const specInfo = classInfo.specs.find(s => s.name === specName);
  if (!specInfo) {
    return interaction.reply({ content: `❌ "${specName}" is not a valid spec for ${className}.`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  // Optionally fetch item level from Blizzard API
  let itemLevel = 0;
  try {
    const blizzData = await getBlizzProfile(name, realm);
    if (blizzData?.average_item_level) itemLevel = blizzData.average_item_level;
  } catch { /* API may not be configured yet */ }

  db.upsertCharacter(interaction.user.id, interaction.guildId, {
    character_name: capitalise(name),
    realm,
    class:      className,
    spec:       specName,
    role:       specInfo.role,
    item_level: itemLevel,
    is_main:    setMain ? 1 : 0,
  });

  const char = db.getCharacter(interaction.user.id, interaction.guildId);
  const embed = buildCharacterEmbed(char);
  await interaction.editReply({
    content: `✅ **${capitalise(name)}** linked${setMain ? ' as your main character' : ''}.`,
    embeds: [embed],
  });
}

// ── /character unlink ────────────────────────────────────────────────────────

async function handleUnlink(interaction) {
  const name  = capitalise(interaction.options.getString('name'));
  const realm = interaction.options.getString('realm');

  const result = db.deleteCharacter(interaction.user.id, interaction.guildId, name, realm);
  if (!result.changes) {
    return interaction.reply({ content: `❌ No linked character named **${name}** on **${realm}** found.`, ephemeral: true });
  }
  await interaction.reply({ content: `✅ **${name}-${realm}** has been unlinked.`, ephemeral: true });
}

// ── /character info ──────────────────────────────────────────────────────────

async function handleInfo(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const detailed   = interaction.options.getBoolean('detailed') || false;

  const char = db.getCharacter(targetUser.id, interaction.guildId);
  if (!char) {
    const who = targetUser.id === interaction.user.id ? 'You have' : `${targetUser.username} has`;
    return interaction.reply({
      content: `❌ ${who} no linked character. Use \`/character link\` to add one.`,
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  let rioData = null;
  if (detailed) {
    try { rioData = await getRioProfile(char.character_name, char.realm); } catch {}
  }

  const embed = buildCharacterEmbed(char, rioData);
  embed.setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() });
  await interaction.editReply({ embeds: [embed] });
}

// ── /character setmain ───────────────────────────────────────────────────────

async function handleSetMain(interaction) {
  const name  = capitalise(interaction.options.getString('name'));
  const realm = interaction.options.getString('realm');

  const chars = db.getAllCharacters(interaction.user.id, interaction.guildId);
  const target = chars.find(c => c.character_name === name && c.realm.toLowerCase() === realm.toLowerCase());

  if (!target) {
    return interaction.reply({
      content: `❌ No linked character **${name}-${realm}**. Link it first with \`/character link\`.`,
      ephemeral: true,
    });
  }

  db.upsertCharacter(interaction.user.id, interaction.guildId, {
    character_name: target.character_name,
    realm:          target.realm,
    class:          target.class,
    spec:           target.spec,
    role:           target.role,
    item_level:     target.item_level,
    is_main:        1,
  });

  await interaction.reply({ content: `✅ **${name}** is now your main character.`, ephemeral: true });
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
