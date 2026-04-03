// Raider.IO public API helpers — no auth required
// Docs: https://raider.io/api

const BASE = 'https://raider.io/api/v1';

async function getCharacterProfile(name, realm, region = 'us') {
  const fields = [
    'mythic_plus_scores_by_season:current',
    'mythic_plus_recent_runs',
    'mythic_plus_best_runs',
    'raid_progression',
    'gear',
  ].join(',');

  const url = `${BASE}/characters/profile?region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=${fields}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Raider.IO request failed: ${res.status}`);
  return res.json();
}

async function getGuildProfile(name, realm, region = 'us') {
  const fields = 'raid_progression,raid_rankings';
  const url = `${BASE}/guilds/profile?region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=${fields}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Raider.IO guild request failed: ${res.status}`);
  return res.json();
}

module.exports = { getCharacterProfile, getGuildProfile };
