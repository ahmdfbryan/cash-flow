const { SlashCommandBuilder } = require('discord.js');
const stickyPanel = require('../services/stickyPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Pasang panel tombol catat transaksi yang selalu nempel di bawah channel ini'),

  async execute(interaction) {
    await stickyPanel.postPanel(interaction.channel);
    return interaction.reply({ content: '✅ Panel dipasang — bakal otomatis geser ke bawah tiap ada pesan baru di channel ini.', ephemeral: true });
  },
};
