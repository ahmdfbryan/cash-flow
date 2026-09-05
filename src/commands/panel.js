const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { baseEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post panel tombol catat transaksi (biar gak perlu ngetik /catat)'),

  async execute(interaction) {
    const embed = baseEmbed().setTitle('💰 Panel Catat Cepat')
      .setDescription('Klik salah satu tombol di bawah buat catat transaksi lewat form, tanpa perlu ngetik command.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_masuk').setLabel('Catat Masuk').setEmoji('📥').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel_keluar').setLabel('Catat Keluar').setEmoji('📤').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel_transfer').setLabel('Transfer').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    );

    return interaction.reply({ embeds: [embed], components: [row] });
  },
};
