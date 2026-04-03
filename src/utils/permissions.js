const db = require('../database/index');

/**
 * Returns true if the member has the officer role configured for this guild,
 * is a server admin, or is the guild owner.
 */
function isOfficer(member, guildId) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const settings = db.getGuildSettings(guildId);
  if (!settings?.officer_role_id) return false;
  return member.roles.cache.has(settings.officer_role_id);
}

/**
 * Throws a user-visible error if the member is not an officer.
 */
function requireOfficer(member, guildId) {
  if (!isOfficer(member, guildId)) {
    throw new Error('You need the officer role (or Administrator permission) to use this command.');
  }
}

module.exports = { isOfficer, requireOfficer };
