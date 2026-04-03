const { SlashCommandBuilder } = require('discord.js');
const { getWowTokenPrice } = require('../../utils/blizzard');
const { buildTokenEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('token')
    .setDescription('Show the current WoW Token price'),

  async execute(interaction) {
    await interaction.deferReply();
    const data = await getWowTokenPrice().catch(err => { throw new Error(err.message); });
    await interaction.editReply({ embeds: [buildTokenEmbed(data)] });
  },
};
