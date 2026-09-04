const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const chart = require('../services/chartService');
const { errorEmbed } = require('../utils/embeds');
const { formatRupiah } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('laporan')
    .setDescription('Laporan visual cash flow kamu')
    .addStringOption(o => o.setName('periode').setDescription('Rentang waktu').setRequired(true)
      .addChoices(
        { name: 'Bulan Ini', value: 'bulan_ini' },
        { name: '7 Hari Terakhir', value: '7_hari' },
        { name: '30 Hari Terakhir', value: '30_hari' },
      )),

  async execute(interaction) {
    await interaction.deferReply();
    const periode = interaction.options.getString('periode');
    const dayFilter = periode === 'bulan_ini'
      ? "strftime('%Y-%m', t.created_at) = strftime('%Y-%m', 'now')"
      : periode === '7_hari' ? "t.created_at >= datetime('now', '-7 days')" : "t.created_at >= datetime('now', '-30 days')";

    const byCategory = db.prepare(`
      SELECT c.name, c.emoji, SUM(t.amount) as total FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'expense' AND ${dayFilter}
      GROUP BY c.id ORDER BY total DESC
    `).all();

    if (byCategory.length === 0) {
      return interaction.editReply({ embeds: [errorEmbed('Belum Ada Data', 'Belum ada pengeluaran pada periode ini untuk dibuatkan laporan.')] });
    }

    const totalIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM transactions t WHERE t.type='income' AND ${dayFilter}`).get().t;
    const totalExpense = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM transactions t WHERE t.type='expense' AND ${dayFilter}`).get().t;

    const pieUrl = chart.pieChartByCategory(byCategory);

    const topCategory = byCategory[0];
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📈 Laporan Cash Flow — ${periode.replace('_', ' ')}`)
      .addFields(
        { name: 'Total Pemasukan', value: formatRupiah(totalIncome), inline: true },
        { name: 'Total Pengeluaran', value: formatRupiah(totalExpense), inline: true },
        { name: 'Selisih', value: formatRupiah(totalIncome - totalExpense), inline: true },
        { name: 'Kategori Terbesar', value: `${topCategory.emoji} ${topCategory.name} — ${formatRupiah(topCategory.total)}` },
      )
      .setImage(pieUrl)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
