const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const { baseEmbed, errorEmbed } = require('../utils/embeds');
const { formatRupiah, formatDate } = require('../utils/format');

const PERIODS = {
  hari_ini: "date(created_at) = date('now')",
  minggu_ini: "strftime('%Y-%W', created_at) = strftime('%Y-%W', 'now')",
  bulan_ini: "strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
  semua: '1=1',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('riwayat')
    .setDescription('Lihat riwayat transaksi')
    .addStringOption(o => o.setName('periode').setDescription('Rentang waktu')
      .addChoices(
        { name: 'Hari Ini', value: 'hari_ini' },
        { name: 'Minggu Ini', value: 'minggu_ini' },
        { name: 'Bulan Ini', value: 'bulan_ini' },
        { name: 'Semua', value: 'semua' },
      ))
    .addStringOption(o => o.setName('dompet').setDescription('Filter dompet').setAutocomplete(true))
    .addIntegerOption(o => o.setName('jumlah_data').setDescription('Berapa transaksi terakhir yang ditampilkan (default 10)')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const wallets = db.prepare('SELECT name FROM wallets').all();
    const filtered = wallets.filter(w => w.name.toLowerCase().includes(focused.toLowerCase()));
    return interaction.respond(filtered.slice(0, 25).map(w => ({ name: w.name, value: w.name })));
  },

  async execute(interaction) {
    const periode = interaction.options.getString('periode') || 'bulan_ini';
    const walletName = interaction.options.getString('dompet');
    const limit = interaction.options.getInteger('jumlah_data') || 10;

    let query = `
      SELECT t.*, w.name as wallet_name, w.emoji as wallet_emoji, c.name as cat_name, c.emoji as cat_emoji
      FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE ${PERIODS[periode]}
    `;
    const params = [];
    if (walletName) {
      query += ' AND w.name = ?';
      params.push(walletName);
    }
    query += ' ORDER BY t.created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params);
    if (rows.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Kosong', 'Tidak ada transaksi pada periode ini.')], ephemeral: true });
    }

    const typeIcon = { income: '📥', expense: '📤', transfer_in: '↩️', transfer_out: '↪️' };
    const lines = rows.map(r =>
      `${typeIcon[r.type]} **${formatRupiah(r.amount)}** — ${r.cat_emoji || ''} ${r.cat_name || 'Transfer'} • ${r.wallet_emoji} ${r.wallet_name}\n` +
      `┗ ${r.description || 'tanpa catatan'} · ${formatDate(r.created_at)} · ID: \`${r.id}\``
    );

    const embed = baseEmbed().setTitle(`📜 Riwayat Transaksi (${periode.replace('_', ' ')})`).setDescription(lines.join('\n\n'));
    return interaction.reply({ embeds: [embed] });
  },
};
