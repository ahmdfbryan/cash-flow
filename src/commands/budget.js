const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const notifier = require('../services/notifier');
const { successEmbed, errorEmbed, baseEmbed } = require('../utils/embeds');
const { formatRupiah, currentMonthKey } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('budget')
    .setDescription('Kelola anggaran bulanan per kategori')
    .addSubcommand(sub => sub.setName('set').setDescription('Set/update budget bulan ini')
      .addStringOption(o => o.setName('kategori').setDescription('Kategori pengeluaran').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Limit nominal per bulan').setRequired(true).setMinValue(1)))
    .addSubcommand(sub => sub.setName('list').setDescription('Lihat status semua budget bulan ini')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const cats = db.prepare("SELECT name FROM categories WHERE type = 'expense'").all();
    const filtered = cats.filter(c => c.name.toLowerCase().includes(focused.toLowerCase()));
    return interaction.respond(filtered.slice(0, 25).map(c => ({ name: c.name, value: c.name })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const month = currentMonthKey();

    if (sub === 'set') {
      const kategori = interaction.options.getString('kategori');
      const limit = interaction.options.getInteger('limit');
      const cat = db.prepare("SELECT * FROM categories WHERE name = ? AND type = 'expense'").get(kategori);
      if (!cat) return interaction.reply({ embeds: [errorEmbed('Tidak Ditemukan', `Kategori pengeluaran "${kategori}" tidak ada.`)], ephemeral: true });

      db.prepare(`
        INSERT INTO budgets (category_id, month, limit_amount) VALUES (?, ?, ?)
        ON CONFLICT(category_id, month) DO UPDATE SET limit_amount = excluded.limit_amount
      `).run(cat.id, month, limit);

      const budgetEmbed = successEmbed('Budget Diset', `Budget **${cat.name}** bulan ini: ${formatRupiah(limit)}`);
      return notifier.replyRouted(interaction, 'budget', budgetEmbed);
    }

    if (sub === 'list') {
      const budgets = db.prepare(`
        SELECT b.*, c.name as cat_name, c.emoji as cat_emoji FROM budgets b
        JOIN categories c ON c.id = b.category_id WHERE b.month = ?
      `).all(month);

      if (budgets.length === 0) return interaction.reply({ embeds: [errorEmbed('Belum Ada Budget', 'Set budget dulu dengan `/budget set`.')], ephemeral: true });

      const lines = budgets.map(b => {
        const spent = db.prepare(`
          SELECT COALESCE(SUM(amount), 0) total FROM transactions
          WHERE category_id = ? AND type = 'expense' AND strftime('%Y-%m', created_at) = ?
        `).get(b.category_id, month).total;
        const pct = Math.min(100, Math.round((spent / b.limit_amount) * 100));
        const barLen = 15;
        const filled = Math.round((pct / 100) * barLen);
        const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
        const warn = pct >= 100 ? ' ⚠️' : pct >= 80 ? ' ⚡' : '';
        return `${b.cat_emoji} **${b.cat_name}**${warn}\n\`${bar}\` ${pct}% — ${formatRupiah(spent)} / ${formatRupiah(b.limit_amount)}`;
      });

      const embed = baseEmbed().setTitle(`📊 Status Budget — ${month}`).setDescription(lines.join('\n\n'));
      return interaction.reply({ embeds: [embed] });
    }
  },
};
