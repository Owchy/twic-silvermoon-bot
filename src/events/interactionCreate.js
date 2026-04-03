const db = require('../database/index');
const { buildRaidEmbed, buildRaidButtons } = require('../utils/embeds');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // ── Slash Commands ───────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`Error in /${interaction.commandName}:`, err);
        const msg = err.message || 'Something went wrong.';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: `❌ ${msg}`, ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ content: `❌ ${msg}`, ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // ── Autocomplete ─────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (err) {
          console.error(`Autocomplete error in /${interaction.commandName}:`, err);
        }
      }
      return;
    }

    // ── Raid Signup Buttons ──────────────────────────────────────────────────
    if (interaction.isButton()) {
      const [action, eventIdStr] = interaction.customId.split(':');
      if (!action.startsWith('raid_')) return;

      const eventId = parseInt(eventIdStr, 10);
      const event = db.getRaidEvent(eventId);
      if (!event) {
        return interaction.reply({ content: '❌ This raid event no longer exists.', ephemeral: true });
      }
      if (event.status === 'locked' || event.status === 'cancelled') {
        return interaction.reply({ content: `❌ This raid is **${event.status}** and no longer accepting sign-ups.`, ephemeral: true });
      }

      // Require a linked character
      const char = db.getCharacter(interaction.user.id, interaction.guildId);
      if (!char) {
        return interaction.reply({
          content: '❌ You need to link a character first!\nUse `/character link` to get started.',
          ephemeral: true,
        });
      }

      const statusMap = {
        raid_accept:    'accepted',
        raid_late:      'late',
        raid_tentative: 'tentative',
        raid_decline:   'declined',
      };
      const newStatus = statusMap[action];
      if (!newStatus) return;

      const existing = db.getSignup(eventId, interaction.user.id);

      if (existing?.status === newStatus) {
        // Clicking the same button again removes the signup
        db.removeSignup(eventId, interaction.user.id);
        await interaction.reply({ content: `↩️ Removed your sign-up from **${event.title}**.`, ephemeral: true });
      } else {
        db.upsertSignup({
          event_id:       eventId,
          discord_id:     interaction.user.id,
          character_name: char.character_name,
          realm:          char.realm,
          class:          char.class,
          spec:           char.spec,
          role:           char.role,
          status:         newStatus,
          note:           null,
        });

        const statusEmoji = { accepted: '✅', late: '⏰', tentative: '❓', declined: '❌' }[newStatus];
        await interaction.reply({
          content: `${statusEmoji} **${char.character_name}** marked as **${newStatus}** for ${event.title}.`,
          ephemeral: true,
        });
      }

      // Refresh the embed
      try {
        const signups = db.getRaidSignups(eventId);
        const updatedEvent = db.getRaidEvent(eventId);
        const embed = buildRaidEmbed(updatedEvent, signups);
        const buttons = buildRaidButtons(eventId, updatedEvent.status === 'locked');
        await interaction.message.edit({ embeds: [embed], components: [buttons] });
      } catch (err) {
        console.error('Failed to update raid embed:', err);
      }
    }
  },
};
