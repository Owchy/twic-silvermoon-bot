require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// Initialize database (creates tables if needed)
require('./database/index').getDb();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// ── Load Commands ────────────────────────────────────────────────────────────

function loadCommands(dir) {
  for (const item of fs.readdirSync(dir)) {
    const itemPath = path.join(dir, item);
    if (fs.statSync(itemPath).isDirectory()) {
      loadCommands(itemPath);
    } else if (item.endsWith('.js')) {
      const cmd = require(itemPath);
      if (cmd.data && cmd.execute) {
        client.commands.set(cmd.data.name, cmd);
        console.log(`  ✓ Loaded command: /${cmd.data.name}`);
      }
    }
  }
}
loadCommands(path.join(__dirname, 'commands'));

// ── Load Events ──────────────────────────────────────────────────────────────

const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`  ✓ Registered event: ${event.name}`);
}

// ── Start ────────────────────────────────────────────────────────────────────

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set. Copy .env.example to .env and fill in your credentials.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
