const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const sheets = require('./services/sheetsService');
const scheduler = require('./services/reportScheduler');
const notifier = require('./services/notifier');
const { errorEmbed, baseEmbed } = require('./utils/embeds');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  console.log(`✅ Bot login sebagai ${client.user.tag}`);
  notifier.attachClient(client);
  await sheets.init();
  scheduler.start(client);

  notifier.notifySystem({ embeds: [baseEmbed(0x57F287).setTitle('🟢 Bot Online').setDescription(`${client.user.tag} siap dipakai.\nSync Sheets: ${sheets.isReady() ? '✅ aktif' : '⚠️ nonaktif'}`)] });
});

client.on('interactionCreate', async (interaction) => {
  // Bot single-user: hanya owner yang boleh pakai (kalau OWNER_ID diisi)
  if (config.ownerId && interaction.user.id !== config.ownerId) {
    if (interaction.isChatInputCommand()) {
      return interaction.reply({ embeds: [errorEmbed('Akses Ditolak', 'Bot ini khusus untuk pemilik.')], ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try { await command.autocomplete(interaction); } catch (err) { console.error(err); }
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error di command ${interaction.commandName}:`, err);
      const payload = { embeds: [errorEmbed('Terjadi Kesalahan', 'Ada error saat memproses command. Coba lagi atau cek log.')], ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
      notifier.notifySystem({ embeds: [errorEmbed('Bot Error', `Command: \`/${interaction.commandName}\`\n\`\`\`${String(err.message).slice(0, 500)}\`\`\``)] });
    }
  }
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  notifier.notifySystem({ embeds: [errorEmbed('Unhandled Rejection', `\`\`\`${String(err?.message || err).slice(0, 500)}\`\`\``)] });
});

client.login(config.token);
