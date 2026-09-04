const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { errorEmbed } = require('../utils/embeds');
const { formatRupiah } = require('../utils/format');

const BADGES = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Ranking kategori pengeluaran paling boros')
    .addStringOption(o => o.setName('periode').setDescription('Rentang waktu (default bulan ini)')
      .addChoices(
        { name: 'Bulan Ini', value: 'bulan_ini' },
        { name: 'Bulan Lalu', value: 'bulan_lalu' },
        { name: '7 Hari Terakhir', value: '7_hari' },
        { name: 'Semua Waktu', value: 'semua' },
      )),

  async execute(interaction) {
    const periode = interaction.options.getString('periode') || 'bulan_ini';
    const filters = {
      bulan_ini: "strftime('%Y-%m', t.created_at) = strftime('%Y-%m', 'now')",
      bulan_lalu: "strftime('%Y-%m', t.created_at) = strftime('%Y-%m', 'now', '-1 month')",
      '7_hari': "t.created_at >= datetime('now', '-7 days')",
      semua: '1=1',
    };
    const periodLabel = { bulan_ini: 'Bulan Ini', bulan_lalu: 'Bulan Lalu', '7_hari': '7 Hari Terakhir', semua: 'Semua Waktu' };

    const rows = db.prepare(`
      SELECT c.name, c.emoji, SUM(t.amount) as total, COUNT(*) as jumlah_transaksi
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'expense' AND ${filters[periode]}
      GROUP BY c.id ORDER BY total DESC
      LIMIT 10
    `).all();

    if (rows.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Belum Ada Data', 'Belum ada pengeluaran pada periode ini.')], ephemeral: true });
    }

    const grandTotal = rows.reduce((s, r) => s + r.total, 0);

    const lines = rows.map((r, i) => {
      const badge = BADGES[i] || `**#${i + 1}**`;
      const pctOfTotal = grandTotal > 0 ? Math.round((r.total / grandTotal) * 100) : 0;
      return `${badge} ${r.emoji} **${r.name}** — ${formatRupiah(r.total)} (${pctOfTotal}%)\n┗ ${r.jumlah_transaksi}x transaksi`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(`🏆 Leaderboard Kategori Paling Boros — ${periodLabel[periode]}`)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `Total pengeluaran: ${formatRupiah(grandTotal)}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
