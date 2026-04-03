# Silvermoon — WoW Guild Discord Bot

A Discord bot built for World of Warcraft raiding and Mythic+ guilds. Handles raid sign-ups, roster management, loot tracking, M+ logging, and more.

---

## Features

- **Raid Events** — Officers post raids with a single command. Members sign up themselves by clicking buttons. Supports Accept, Late, Tentative, and Decline statuses. Officers can bench or mark players absent, lock the roster, and attach WarcraftLogs links.
- **Buff Coverage** — Raid embeds automatically flag missing raid buffs (Bloodlust, Battle Res, etc.) based on who has signed up.
- **Character Linking** — Members link their WoW character with class and spec autocomplete. Supports multiple alts with one designated main.
- **Mythic+** — Log completed keys, view a guild leaderboard of highest keys, and look up any character's Raider.IO score.
- **Soft Reserves** — Members reserve up to 3 items per raid event. Officers see a ranked list of contested items.
- **Loot History** — Officers record loot awards (main spec, off spec, split, greed). Full history per player or guild-wide.
- **Roster & Attendance** — Guild roster grouped by rank. Per-player attendance percentage and guild-wide attendance summaries.
- **Item Lookup** — `/item` command fetches item stats from the Blizzard API. Typing `[Item Name]` or pasting a Wowhead URL in chat auto-expands to an item embed.
- **WoW Token** — `/token` shows the current token price in gold.
- **Recruitment Board** — Officers set per-spec recruitment status (Open / Reviewing / Closed). Anyone can view openings.

---

## Commands

| Command | Access | Description |
|---|---|---|
| `/raid create` | Officer | Create a raid event and post the sign-up embed |
| `/raid delete` | Officer | Delete a raid event |
| `/raid list` | Everyone | List upcoming raids |
| `/raid lock` | Officer | Toggle roster lock (disables sign-up buttons) |
| `/raid bench` | Officer | Bench a player on a specific event |
| `/raid absent` | Officer | Mark a player as absent |
| `/raid logs` | Officer | Attach a WarcraftLogs URL to an event |
| `/raid complete` | Officer | Mark an event as completed |
| `/character link` | Everyone | Link a WoW character with class/spec autocomplete |
| `/character unlink` | Everyone | Remove a linked character |
| `/character info` | Everyone | View character info, optionally with live Raider.IO data |
| `/character setmain` | Everyone | Change your main character |
| `/mplus log` | Everyone | Log a completed Mythic+ key |
| `/mplus leaderboard` | Everyone | Guild leaderboard of highest keys |
| `/mplus score` | Everyone | Look up a character's Raider.IO M+ score |
| `/mplus history` | Everyone | Recent guild M+ runs |
| `/loot reserve` | Everyone | Soft reserve an item for a raid (max 3) |
| `/loot unreserve` | Everyone | Remove a soft reserve |
| `/loot reserves` | Everyone | View all reserves for a raid |
| `/loot award` | Officer | Record loot given to a player |
| `/loot history` | Everyone | View loot history (per player or guild-wide) |
| `/roster view` | Everyone | View the guild roster grouped by rank |
| `/roster add` | Officer | Add a member to the roster |
| `/roster remove` | Officer | Remove a member from the roster |
| `/roster promote` | Officer | Change a member's rank |
| `/roster attendance` | Everyone | View attendance for yourself or another player |
| `/roster attendance_all` | Officer | Guild-wide attendance summary |
| `/item` | Everyone | Look up an item by name or ID |
| `/token` | Everyone | Current WoW Token price |
| `/recruitment view` | Everyone | View recruitment openings |
| `/recruitment set` | Officer | Set recruitment status for a class/spec |
| `/recruitment clear` | Officer | Clear the recruitment board |
| `/setup view` | Officer | View current bot configuration |
| `/setup configure` | Officer | Set raid channel, roles, realm, etc. |

---

## Setup

### Requirements

- [Node.js](https://nodejs.org) v18 or higher
- A [Discord application and bot token](https://discord.com/developers/applications)
- A [Blizzard Battle.net API client](https://develop.battle.net) (for item lookups, character data, and WoW Token price)

### Discord Bot Permissions

When inviting the bot, it needs the following:
- Scopes: `bot`, `applications.commands`
- Permissions: `Send Messages`, `Embed Links`, `Read Message History`, `View Channels`
- Enable **Message Content Intent** under Bot → Privileged Gateway Intents

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/Owchy/twic-silvermoon-bot.git
cd twic-silvermoon-bot

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Fill in your credentials in .env

# 4. Register slash commands with Discord
npm run deploy

# 5. Start the bot
npm start
```

### Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Your application's client ID |
| `DISCORD_GUILD_ID` | Guild ID for fast command deployment during development |
| `BLIZZARD_CLIENT_ID` | Blizzard API client ID |
| `BLIZZARD_CLIENT_SECRET` | Blizzard API client secret |
| `WOW_REGION` | WoW region — `us`, `eu`, `kr`, or `tw` (default: `us`) |
| `DATABASE_PATH` | Path to the SQLite database file (default: project root) |

### First-Time Bot Configuration

Once the bot is running, use `/setup configure` in your Discord server to set:
- The default channel for raid posts
- Officer, Raider, and Trial roles
- Your guild name and realm

---

## Hosting on Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add all environment variables in the Railway **Variables** tab
4. Go to **Volumes** → Add Volume → mount path `/data`
5. Set `DATABASE_PATH` to `/data/silvermoon.db`

Railway will auto-deploy on every push to `main`.

---

## Tech Stack

- [Discord.js v14](https://discord.js.org)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [Blizzard Battle.net API](https://develop.battle.net/documentation/world-of-warcraft)
- [Raider.IO API](https://raider.io/api)
