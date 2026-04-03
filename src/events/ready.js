module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Silvermoon is online as ${client.user.tag}`);
    client.user.setActivity('World of Warcraft', { type: 0 }); // "Playing World of Warcraft"
  },
};
