const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const { successEmbed, errorEmbed, balanceEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dompet')
    .setDescription('Kelola dompet (cash, e-wallet, rekening, dll)')
    .addSubcommand(sub => sub.setName('buat').setDescription('Buat dompet baru')
      .addStringOption(o => o.setName('nama').setDescription('Nama dompet').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji dompet (default 💰)'))
      .addIntegerOption(o => o.setName('saldo_awal').setDescription('Saldo awal (default 0')))
    .addSubcommand(sub => sub.setName('list').setDescription('Lihat semua dompet & saldo'))
    .addSubcommand(sub => sub.setName('hapus').setDescription('Hapus dompet (transaksinya ikut terhapus)')
      .addStringOption(o => o.setName('nama').setDescription('Nama dompet').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const wallets = db.prepare('SELECT name FROM wallets').all();
    const filtered = wallets.filter(w => w.name.toLowerCase().includes(focused.toLowerCase()));
    return interaction.respond(filtered.slice(0, 25).map(w => ({ name: w.name, value: w.name })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'buat') {
      const nama = interaction.options.getString('nama');
      const emoji = interaction.options.getString('emoji') || '💰';
      const saldoAwal = interaction.options.getInteger('saldo_awal') || 0;

      const exists = db.prepare('SELECT id FROM wallets WHERE name = ?').get(nama);
      if (exists) return interaction.reply({ embeds: [errorEmbed('Sudah Ada', `Dompet "${nama}" sudah ada.`)], ephemeral: true });

      db.prepare('INSERT INTO wallets (name, emoji, balance) VALUES (?, ?, ?)').run(nama, emoji, saldoAwal);
      return interaction.reply({ embeds: [successEmbed('Dompet Dibuat', `${emoji} **${nama}** berhasil dibuat dengan saldo awal Rp${saldoAwal.toLocaleString('id-ID')}.`)] });
    }

    if (sub === 'list') {
      const wallets = db.prepare('SELECT * FROM wallets ORDER BY id').all();
      const total = wallets.reduce((s, w) => s + w.balance, 0);
      return interaction.reply({ embeds: [balanceEmbed(wallets, total)] });
    }

    if (sub === 'hapus') {
      const nama = interaction.options.getString('nama');
      const wallet = db.prepare('SELECT * FROM wallets WHERE name = ?').get(nama);
      if (!wallet) return interaction.reply({ embeds: [errorEmbed('Tidak Ditemukan', `Dompet "${nama}" tidak ada.`)], ephemeral: true });

      const walletCount = db.prepare('SELECT COUNT(*) c FROM wallets').get().c;
      if (walletCount <= 1) return interaction.reply({ embeds: [errorEmbed('Tidak Bisa Dihapus', 'Minimal harus ada 1 dompet.')], ephemeral: true });

      db.prepare('DELETE FROM wallets WHERE id = ?').run(wallet.id);
      return interaction.reply({ embeds: [successEmbed('Dompet Dihapus', `**${nama}** dan seluruh riwayat transaksinya telah dihapus.`)] });
    }
  },
};
