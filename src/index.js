require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
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

// ── Deploy Slash Commands ────────────────────────────────────────────────────

async function deployCommands() {
  const body = [...client.commands.values()].map(cmd => cmd.data.toJSON());
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  const route = process.env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);

  try {
    await rest.put(route, { body });
    console.log(`✅ Deployed ${body.length} slash commands.`);
  } catch (err) {
    console.error('❌ Failed to deploy slash commands:', err);
  }
}

// ── Start ────────────────────────────────────────────────────────────────────

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set. Copy .env.example to .env and fill in your credentials.');
  process.exit(1);
}

const { startWebServer } = require('./web/server');
deployCommands().then(() => client.login(process.env.DISCORD_TOKEN));
client.once('ready', () => startWebServer(client));
