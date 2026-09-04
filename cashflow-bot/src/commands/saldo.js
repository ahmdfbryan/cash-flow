const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const { balanceEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('saldo').setDescription('Cek saldo semua dompet'),
  async execute(interaction) {
    const wallets = db.prepare('SELECT * FROM wallets ORDER BY id').all();
    const total = wallets.reduce((s, w) => s + w.balance, 0);
    return interaction.reply({ embeds: [balanceEmbed(wallets, total)] });
  },
};
