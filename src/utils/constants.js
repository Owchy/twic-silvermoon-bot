// ── WoW Classes & Specs ──────────────────────────────────────────────────────

const WOW_CLASSES = {
  'Death Knight': {
    color: 0xC41E3A,
    emoji: '💀',
    specs: [
      { name: 'Blood',  role: 'tank' },
      { name: 'Frost',  role: 'dps'  },
      { name: 'Unholy', role: 'dps'  },
    ],
  },
  'Demon Hunter': {
    color: 0xA330C9,
    emoji: '🔱',
    specs: [
      { name: 'Havoc',      role: 'dps'  },
      { name: 'Vengeance',  role: 'tank' },
    ],
  },
  'Druid': {
    color: 0xFF7C0A,
    emoji: '🌿',
    specs: [
      { name: 'Balance',      role: 'dps'    },
      { name: 'Feral',        role: 'dps'    },
      { name: 'Guardian',     role: 'tank'   },
      { name: 'Restoration',  role: 'healer' },
    ],
  },
  'Evoker': {
    color: 0x33937F,
    emoji: '🐉',
    specs: [
      { name: 'Augmentation', role: 'dps'    },
      { name: 'Devastation',  role: 'dps'    },
      { name: 'Preservation', role: 'healer' },
    ],
  },
  'Hunter': {
    color: 0xAAD372,
    emoji: '🏹',
    specs: [
      { name: 'Beast Mastery',  role: 'dps' },
      { name: 'Marksmanship',   role: 'dps' },
      { name: 'Survival',       role: 'dps' },
    ],
  },
  'Mage': {
    color: 0x3FC7EB,
    emoji: '🔮',
    specs: [
      { name: 'Arcane', role: 'dps' },
      { name: 'Fire',   role: 'dps' },
      { name: 'Frost',  role: 'dps' },
    ],
  },
  'Monk': {
    color: 0x00FF98,
    emoji: '🥋',
    specs: [
      { name: 'Brewmaster',  role: 'tank'   },
      { name: 'Mistweaver',  role: 'healer' },
      { name: 'Windwalker',  role: 'dps'    },
    ],
  },
  'Paladin': {
    color: 0xF48CBA,
    emoji: '🛡️',
    specs: [
      { name: 'Holy',         role: 'healer' },
      { name: 'Protection',   role: 'tank'   },
      { name: 'Retribution',  role: 'dps'    },
    ],
  },
  'Priest': {
    color: 0xFFFFFF,
    emoji: '✨',
    specs: [
      { name: 'Discipline', role: 'healer' },
      { name: 'Holy',       role: 'healer' },
      { name: 'Shadow',     role: 'dps'    },
    ],
  },
  'Rogue': {
    color: 0xFFF468,
    emoji: '🗡️',
    specs: [
      { name: 'Assassination', role: 'dps' },
      { name: 'Outlaw',        role: 'dps' },
      { name: 'Subtlety',      role: 'dps' },
    ],
  },
  'Shaman': {
    color: 0x0070DD,
    emoji: '⚡',
    specs: [
      { name: 'Elemental',    role: 'dps'    },
      { name: 'Enhancement',  role: 'dps'    },
      { name: 'Restoration',  role: 'healer' },
    ],
  },
  'Warlock': {
    color: 0x8788EE,
    emoji: '👁️',
    specs: [
      { name: 'Affliction',   role: 'dps' },
      { name: 'Demonology',   role: 'dps' },
      { name: 'Destruction',  role: 'dps' },
    ],
  },
  'Warrior': {
    color: 0xC69B3A,
    emoji: '⚔️',
    specs: [
      { name: 'Arms',        role: 'dps'  },
      { name: 'Fury',        role: 'dps'  },
      { name: 'Protection',  role: 'tank' },
    ],
  },
};

// ── Difficulty ───────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS = {
  LFR:     0x1EFF00, // green
  Normal:  0x0070DD, // blue
  Heroic:  0xA335EE, // purple
  Mythic:  0xFF8000, // orange
};

const DIFFICULTY_EMOJI = {
  LFR:    '🟢',
  Normal: '🔵',
  Heroic: '🟣',
  Mythic: '🟠',
};

// ── Signup Status ────────────────────────────────────────────────────────────

const STATUS_EMOJI = {
  accepted:  '✅',
  late:      '⏰',
  tentative: '❓',
  declined:  '❌',
  benched:   '🪑',
  absent:    '🔴',
};

const STATUS_LABEL = {
  accepted:  'Accepted',
  late:      'Late',
  tentative: 'Tentative',
  declined:  'Declined',
  benched:   'Benched',
  absent:    'Absent',
};

// ── Role Display ─────────────────────────────────────────────────────────────

const ROLE_EMOJI = {
  tank:   '🛡️',
  healer: '💚',
  dps:    '⚔️',
};

// ── M+ Dungeons (The War Within Season 2 + classics) ────────────────────────

const MPLUS_DUNGEONS = [
  'Ara-Kara, City of Echoes',
  'City of Threads',
  'Grim Batol',
  'Mists of Tirna Scithe',
  'Priory of the Sacred Flame',
  'The Dawnbreaker',
  'The Necrotic Wake',
  'The Stonevault',
  'Darkflame Cleft',
  'Operation: Floodgate',
  'Mechagon Workshop',
  'Siege of Boralus',
];

// ── Roster Ranks ─────────────────────────────────────────────────────────────

const ROSTER_RANKS = ['gm', 'officer', 'raider', 'trial', 'social', 'alt'];

const RANK_LABEL = {
  gm:       '👑 Guild Master',
  officer:  '⭐ Officer',
  raider:   '🗡️ Raider',
  trial:    '🔰 Trial',
  social:   '😊 Social',
  alt:      '🔄 Alt',
};

// ── Buff / Utility coverage helpers ─────────────────────────────────────────

const BUFF_PROVIDERS = {
  'Bloodlust/Heroism':    ['Shaman', 'Mage', 'Hunter', 'Evoker'],
  'Battle Res':           ['Druid', 'Death Knight', 'Warlock', 'Hunter'],
  'Power Infusion':       ['Priest'],
  'Blessing of the Seasons': ['Druid'],
  'Augmentation Evoker':  ['Evoker'],
};

module.exports = {
  WOW_CLASSES,
  DIFFICULTY_COLORS,
  DIFFICULTY_EMOJI,
  STATUS_EMOJI,
  STATUS_LABEL,
  ROLE_EMOJI,
  MPLUS_DUNGEONS,
  ROSTER_RANKS,
  RANK_LABEL,
  BUFF_PROVIDERS,
};
