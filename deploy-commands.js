require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];

function loadCommands(dir) {
  for (const item of fs.readdirSync(dir)) {
    const itemPath = path.join(dir, item);
    if (fs.statSync(itemPath).isDirectory()) {
      loadCommands(itemPath);
    } else if (item.endsWith('.js')) {
      const cmd = require(itemPath);
      if (cmd.data) commands.push(cmd.data.toJSON());
    }
  }
}
loadCommands(path.join(__dirname, 'src', 'commands'));

const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const isGlobal = process.argv.includes('--global');
const route = isGlobal
  ? Routes.applicationCommands(process.env.DISCORD_CLIENT_ID)
  : Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID);

(async () => {
  try {
    console.log(`Deploying ${commands.length} commands ${isGlobal ? 'globally' : 'to guild'}...`);
    await rest.put(route, { body: commands });
    console.log('Done.');
  } catch (err) {
    console.error(err);
  }
})();
