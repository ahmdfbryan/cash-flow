const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const { successEmbed, errorEmbed, baseEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kategori')
    .setDescription('Kelola kategori transaksi')
    .addSubcommand(sub => sub.setName('buat').setDescription('Buat kategori baru')
      .addStringOption(o => o.setName('nama').setDescription('Nama kategori').setRequired(true))
      .addStringOption(o => o.setName('tipe').setDescription('Tipe kategori').setRequired(true)
        .addChoices({ name: 'Pemasukan', value: 'income' }, { name: 'Pengeluaran', value: 'expense' }))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji (default 📌)')))
    .addSubcommand(sub => sub.setName('list').setDescription('Lihat semua kategori'))
    .addSubcommand(sub => sub.setName('hapus').setDescription('Hapus kategori')
      .addStringOption(o => o.setName('nama').setDescription('Nama kategori').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const cats = db.prepare('SELECT name FROM categories').all();
    const filtered = cats.filter(c => c.name.toLowerCase().includes(focused.toLowerCase()));
    return interaction.respond(filtered.slice(0, 25).map(c => ({ name: c.name, value: c.name })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'buat') {
      const nama = interaction.options.getString('nama');
      const tipe = interaction.options.getString('tipe');
      const emoji = interaction.options.getString('emoji') || '📌';

      const exists = db.prepare('SELECT id FROM categories WHERE name = ?').get(nama);
      if (exists) return interaction.reply({ embeds: [errorEmbed('Sudah Ada', `Kategori "${nama}" sudah ada.`)], ephemeral: true });

      db.prepare('INSERT INTO categories (name, type, emoji) VALUES (?, ?, ?)').run(nama, tipe, emoji);
      return interaction.reply({ embeds: [successEmbed('Kategori Dibuat', `${emoji} **${nama}** (${tipe === 'income' ? 'Pemasukan' : 'Pengeluaran'}) berhasil dibuat.`)] });
    }

    if (sub === 'list') {
      const income = db.prepare("SELECT * FROM categories WHERE type = 'income'").all();
      const expense = db.prepare("SELECT * FROM categories WHERE type = 'expense'").all();
      const embed = baseEmbed().setTitle('📋 Daftar Kategori')
        .addFields(
          { name: 'Pemasukan', value: income.map(c => `${c.emoji} ${c.name}`).join('\n') || '-' },
          { name: 'Pengeluaran', value: expense.map(c => `${c.emoji} ${c.name}`).join('\n') || '-' },
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'hapus') {
      const nama = interaction.options.getString('nama');
      const cat = db.prepare('SELECT * FROM categories WHERE name = ?').get(nama);
      if (!cat) return interaction.reply({ embeds: [errorEmbed('Tidak Ditemukan', `Kategori "${nama}" tidak ada.`)], ephemeral: true });

      db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
      return interaction.reply({ embeds: [successEmbed('Kategori Dihapus', `**${nama}** telah dihapus. Transaksi lama tetap ada tanpa kategori.`)] });
    }
  },
};
