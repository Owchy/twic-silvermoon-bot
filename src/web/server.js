const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const db = require('../database/index');

const PAGES = ['dashboard', 'raids', 'roster', 'attendance', 'mplus', 'loot', 'settings'];

function createWebServer(discordClient) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    secret: process.env.SESSION_SECRET || 'silvermoon-change-me',
    resave: false,
    saveUninitialized: false,
    // Suppress MemoryStore warning — single-process bot, this is fine
    ...(process.env.NODE_ENV === 'production' ? {} : {}),
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));
  // Silence the MemoryStore production warning — intentional for this use case
  // eslint-disable-next-line no-console
  const _warn = console.warn.bind(console);
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('MemoryStore')) return;
    _warn(...args);
  };

  app.use(express.static(path.join(__dirname, 'public')));

  // ── Discord OAuth2 ─────────────────────────────────────────────────────────

  app.get('/auth/discord', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    const params = new URLSearchParams({
      client_id:     process.env.DISCORD_CLIENT_ID,
      redirect_uri:  process.env.DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope:         'identify guilds',
      state,
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  });

  app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || state !== req.session.oauthState) {
      return res.redirect('/login?error=invalid_state');
    }

    try {
      // Exchange code for access token
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     process.env.DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type:    'authorization_code',
          code,
          redirect_uri:  process.env.DISCORD_REDIRECT_URI,
        }),
      });
      if (!tokenRes.ok) throw new Error('Token exchange failed');
      const { access_token } = await tokenRes.json();

      // Fetch Discord user info
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!userRes.ok) throw new Error('Failed to get user info');
      const user = await userRes.json();

      // Verify user is in the guild and check their roles
      const guildId = process.env.DISCORD_GUILD_ID;
      let isOfficer = false;

      if (guildId) {
        const memberRes = await fetch(
          `https://discord.com/api/guilds/${guildId}/members/${user.id}`,
          { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }
        );
        if (!memberRes.ok) return res.redirect('/login?error=not_member');

        const member = await memberRes.json();
        const settings = db.getGuildSettings(guildId);

        // Officer if they have the configured officer role or server Administrator
        const adminBit = BigInt(0x8);
        const hasAdmin = member.permissions
          ? (BigInt(member.permissions) & adminBit) === adminBit
          : false;
        isOfficer = hasAdmin || (settings?.officer_role_id
          ? member.roles.includes(settings.officer_role_id)
          : false);
      }

      req.session.user = {
        id:       user.id,
        username: user.username,
        avatar:   user.avatar,
        isOfficer,
        guildId:  guildId || null,
      };
      delete req.session.oauthState;
      res.redirect('/dashboard');
    } catch (err) {
      console.error('OAuth callback error:', err);
      res.redirect('/login?error=auth_failed');
    }
  });

  app.post('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
  });

  // ── API ────────────────────────────────────────────────────────────────────

  app.use('/api', require('./routes/api')(discordClient));

  // ── Page Routes ────────────────────────────────────────────────────────────

  app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  for (const page of PAGES) {
    app.get(`/${page}`, (req, res) => {
      if (!req.session.user) return res.redirect('/login');
      res.sendFile(path.join(__dirname, 'public', `${page}.html`));
    });
  }

  return app;
}

function startWebServer(discordClient) {
  const app = createWebServer(discordClient);
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`🌐 Dashboard running on port ${port}`));
}

module.exports = { startWebServer };
