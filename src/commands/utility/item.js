const { SlashCommandBuilder } = require('discord.js');
const { searchItem, getItem } = require('../../utils/blizzard');
const { buildItemEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('item')
    .setDescription('Look up a World of Warcraft item')
    .addStringOption(o =>
      o.setName('name').setDescription('Item name or ID to search for').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const query = interaction.options.getString('name');

    // Check if it's a numeric ID
    const numericId = parseInt(query, 10);
    if (!isNaN(numericId) && String(numericId) === query) {
      const item = await getItem(numericId).catch(() => null);
      if (!item) return interaction.editReply(`❌ No item found with ID **${numericId}**.`);
      return interaction.editReply({ embeds: [buildItemEmbed(item)] });
    }

    // Text search
    const results = await searchItem(query).catch(() => []);
    if (!results.length) {
      return interaction.editReply(`❌ No items found matching **${query}**.`);
    }

    // Find exact name match first, then fall back to first result
    const match = results.find(r =>
      (r.data?.name?.en_US || '').toLowerCase() === query.toLowerCase()
    ) || results[0];

    const item = await getItem(match.data.id).catch(() => null);
    if (!item) return interaction.editReply(`❌ Could not fetch item details.`);

    await interaction.editReply({ embeds: [buildItemEmbed(item)] });
  },
};
