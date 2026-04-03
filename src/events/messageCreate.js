// Auto-expand Wowhead item links and [Item Name] WoW-style links in chat.
const { buildItemEmbed } = require('../utils/embeds');
const { searchItem, getItem } = require('../utils/blizzard');

// Match [Item Name] style links (1-60 chars, no brackets inside)
const ITEM_LINK_REGEX = /\[([^\[\]]{1,60})\]/g;
// Match wowhead.com/item/ID or wowhead.com/item=ID URLs
const WOWHEAD_URL_REGEX = /wowhead\.com\/(?:item[=/])(\d+)/gi;

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content;
    const foundIds = new Set();

    // Extract item IDs from wowhead URLs
    let urlMatch;
    while ((urlMatch = WOWHEAD_URL_REGEX.exec(content)) !== null) {
      foundIds.add(parseInt(urlMatch[1], 10));
    }

    // Extract [Item Name] links and search for them
    const nameMatches = [...content.matchAll(ITEM_LINK_REGEX)].map(m => m[1]);

    // Look up by name (limit to 2 per message to avoid spam)
    for (const name of nameMatches.slice(0, 2)) {
      try {
        const results = await searchItem(name);
        if (results.length > 0) {
          // Pick the closest match by name
          const match = results.find(r =>
            (r.data?.name?.en_US || '').toLowerCase() === name.toLowerCase()
          ) || results[0];
          foundIds.add(match.data.id);
        }
      } catch {
        // Blizzard API might not be configured — silently skip
      }
    }

    if (foundIds.size === 0) return;

    for (const itemId of [...foundIds].slice(0, 3)) {
      try {
        const item = await getItem(itemId);
        if (!item) continue;
        await message.channel.send({ embeds: [buildItemEmbed(item)] });
      } catch {
        // Skip silently — API may be unconfigured
      }
    }
  },
};
