const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const chart = require('../services/chartService');
const notifier = require('../services/notifier');
const config = require('../config');
const { errorEmbed } = require('../utils/embeds');
const { formatRupiah } = require('../utils/format');

function getPeriodFilters(periode) {
  if (periode === 'bulan_ini') {
    return {
      current: "strftime('%Y-%m', t.created_at) = strftime('%Y-%m', 'now')",
      previous: "strftime('%Y-%m', t.created_at) = strftime('%Y-%m', 'now', '-1 month')",
      label: 'bulan lalu',
    };
  }
  if (periode === '7_hari') {
    return {
      current: "t.created_at >= datetime('now', '-7 days')",
      previous: "t.created_at >= datetime('now', '-14 days') AND t.created_at < datetime('now', '-7 days')",
      label: '7 hari sebelumnya',
    };
  }
  return {
    current: "t.created_at >= datetime('now', '-30 days')",
    previous: "t.created_at >= datetime('now', '-60 days') AND t.created_at < datetime('now', '-30 days')",
    label: '30 hari sebelumnya',
  };
}

function pctChangeText(curr, prev) {
  if (prev === 0) return curr === 0 ? '' : ' 🆕 baru';
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 1) return ' (≈ sama)';
  const arrow = pct > 0 ? '🔺' : '🔻';
  return ` (${arrow} ${Math.abs(pct).toFixed(0)}%)`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('laporan')
    .setDescription('Laporan visual cash flow kamu')
    .addStringOption(o => o.setName('periode').setDescription('Rentang waktu').setRequired(true)
      .addChoices(
        { name: 'Bulan Ini', value: 'bulan_ini' },
        { name: '7 Hari Terakhir', value: '7_hari' },
        { name: '30 Hari Terakhir', value: '30_hari' },
        { name: 'Tren 6 Bulan Terakhir', value: 'tren_6bulan' },
      )),

  async execute(interaction) {
    const laporanChannel = config.channels.laporan || config.channels.default;
    const routeToOtherChannel = laporanChannel && interaction.channelId !== laporanChannel;
    const periode = interaction.options.getString('periode');

    await interaction.deferReply({ ephemeral: routeToOtherChannel });

    const embed = periode === 'tren_6bulan' ? buildTrendEmbed() : buildComparativeEmbed(periode);

    if (!embed) {
      return interaction.editReply({ embeds: [errorEmbed('Belum Ada Data', 'Belum ada pengeluaran pada periode ini untuk dibuatkan laporan.')] });
    }

    if (routeToOtherChannel) {
      await interaction.editReply({ content: `✅ Laporan sudah dibuat — cek di <#${laporanChannel}>` });
      notifier.notifyLaporan({ embeds: [embed] });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

function buildTrendEmbed() {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', t.created_at) as ym,
      SUM(CASE WHEN t.type='income' THEN t.amount ELSE 0 END) as income,
      SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END) as expense
    FROM transactions t
    WHERE t.created_at >= datetime('now', '-6 months', 'start of month')
    GROUP BY ym
  `).all();

  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('id-ID', { month: 'short', year: '2-digit' });
    months.push({ key, label });
  }

  const incomeData = months.map(m => rows.find(r => r.ym === m.key)?.income || 0);
  const expenseData = months.map(m => rows.find(r => r.ym === m.key)?.expense || 0);
  const labels = months.map(m => m.label);

  const totalIncome6bl = incomeData.reduce((a, b) => a + b, 0);
  const totalExpense6bl = expenseData.reduce((a, b) => a + b, 0);
  const avgExpense = Math.round(totalExpense6bl / 6);

  const chartUrl = chart.trendChart(labels, incomeData, expenseData);
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📈 Tren Cash Flow — 6 Bulan Terakhir')
    .addFields(
      { name: 'Total Pemasukan (6 bln)', value: formatRupiah(totalIncome6bl), inline: true },
      { name: 'Total Pengeluaran (6 bln)', value: formatRupiah(totalExpense6bl), inline: true },
      { name: 'Rata-rata Pengeluaran/Bulan', value: formatRupiah(avgExpense), inline: true },
    )
    .setImage(chartUrl)
    .setTimestamp();
}

function buildComparativeEmbed(periode) {
  const { current, previous, label } = getPeriodFilters(periode);

  const byCategory = db.prepare(`
    SELECT c.id, c.name, c.emoji, SUM(t.amount) as total FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense' AND ${current}
    GROUP BY c.id ORDER BY total DESC
  `).all();

  if (byCategory.length === 0) return null;

  const prevByCategory = db.prepare(`
    SELECT c.id, SUM(t.amount) as total FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense' AND ${previous}
    GROUP BY c.id
  `).all();
  const prevMap = new Map(prevByCategory.map(r => [r.id, r.total]));

  const totalIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM transactions t WHERE t.type='income' AND ${current}`).get().t;
  const totalExpense = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM transactions t WHERE t.type='expense' AND ${current}`).get().t;
  const prevTotalIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM transactions t WHERE t.type='income' AND ${previous}`).get().t;
  const prevTotalExpense = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM transactions t WHERE t.type='expense' AND ${previous}`).get().t;

  const pieUrl = chart.pieChartByCategory(byCategory);
  const topCategory = byCategory[0];

  const categoryLines = byCategory.slice(0, 8).map(c => {
    const prevTotal = prevMap.get(c.id) || 0;
    return `${c.emoji} **${c.name}**: ${formatRupiah(c.total)}${pctChangeText(c.total, prevTotal)}`;
  });

  const periodLabel = periode === 'bulan_ini' ? 'Bulan Ini' : periode === '7_hari' ? '7 Hari Terakhir' : '30 Hari Terakhir';

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📈 Laporan Cash Flow — ${periodLabel}`)
    .addFields(
      { name: 'Total Pemasukan', value: `${formatRupiah(totalIncome)}${pctChangeText(totalIncome, prevTotalIncome)}`, inline: true },
      { name: 'Total Pengeluaran', value: `${formatRupiah(totalExpense)}${pctChangeText(totalExpense, prevTotalExpense)}`, inline: true },
      { name: 'Selisih', value: formatRupiah(totalIncome - totalExpense), inline: true },
      { name: 'Kategori Terbesar', value: `${topCategory.emoji} ${topCategory.name} — ${formatRupiah(topCategory.total)}` },
      { name: `Per Kategori (vs ${label})`, value: categoryLines.join('\n') },
    )
    .setImage(pieUrl)
    .setFooter({ text: `Perbandingan terhadap ${label}` })
    .setTimestamp();
}
