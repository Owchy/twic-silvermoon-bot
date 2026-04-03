// Blizzard Battle.net API helpers
// Docs: https://develop.battle.net/documentation/world-of-warcraft

const REGION = process.env.WOW_REGION || 'us';

let _token = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Blizzard API credentials not configured.');

  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`Blizzard OAuth failed: ${res.status}`);
  const data = await res.json();
  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

function realmSlug(realm) {
  return realm.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '');
}

// ── Character Profile ────────────────────────────────────────────────────────

async function getCharacterProfile(name, realm) {
  const token = await getAccessToken();
  const slug = realmSlug(realm);
  const charName = name.toLowerCase();

  const res = await fetch(
    `https://${REGION}.api.blizzard.com/profile/wow/character/${slug}/${charName}` +
    `?namespace=profile-${REGION}&locale=en_US`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Character lookup failed: ${res.status}`);
  return res.json();
}

async function getCharacterMedia(name, realm) {
  const token = await getAccessToken();
  const slug = realmSlug(realm);
  const charName = name.toLowerCase();

  const res = await fetch(
    `https://${REGION}.api.blizzard.com/profile/wow/character/${slug}/${charName}/character-media` +
    `?namespace=profile-${REGION}&locale=en_US`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.assets?.find(a => a.key === 'main')?.value || null;
}

// ── Item Search ──────────────────────────────────────────────────────────────

async function searchItem(query) {
  const token = await getAccessToken();
  const encoded = encodeURIComponent(query);
  const res = await fetch(
    `https://${REGION}.api.blizzard.com/data/wow/search/item` +
    `?namespace=static-${REGION}&locale=en_US&name.en_US=${encoded}&orderby=id&_pageSize=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

async function getItem(itemId) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const [itemRes, mediaRes] = await Promise.all([
    fetch(
      `https://${REGION}.api.blizzard.com/data/wow/item/${itemId}` +
      `?namespace=static-${REGION}&locale=en_US`,
      { headers }
    ),
    fetch(
      `https://${REGION}.api.blizzard.com/data/wow/media/item/${itemId}` +
      `?namespace=static-${REGION}&locale=en_US`,
      { headers }
    ),
  ]);

  if (!itemRes.ok) return null;
  const item = await itemRes.json();
  const media = mediaRes.ok ? await mediaRes.json() : null;
  item.icon = media?.assets?.find(a => a.key === 'icon')?.value || null;
  return item;
}

// ── WoW Token ────────────────────────────────────────────────────────────────

async function getWowTokenPrice() {
  const token = await getAccessToken();
  const res = await fetch(
    `https://${REGION}.api.blizzard.com/data/wow/token/index` +
    `?namespace=dynamic-${REGION}&locale=en_US`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Token price fetch failed: ${res.status}`);
  return res.json(); // { price: number (in copper), last_updated_timestamp: number }
}

module.exports = { getCharacterProfile, getCharacterMedia, searchItem, getItem, getWowTokenPrice };
