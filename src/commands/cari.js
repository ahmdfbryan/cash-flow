const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const { baseEmbed, errorEmbed } = require('../utils/embeds');
const { formatRupiah, formatDate } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cari')
    .setDescription('Cari transaksi lama berdasarkan kata kunci di deskripsi')
    .addStringOption(o => o.setName('kata_kunci').setDescription('Kata kunci yang dicari di deskripsi').setRequired(true))
    .addStringOption(o => o.setName('dompet').setDescription('Filter dompet (opsional)').setAutocomplete(true))
    .addStringOption(o => o.setName('tipe').setDescription('Filter tipe (opsional)')
      .addChoices({ name: 'Pemasukan', value: 'income' }, { name: 'Pengeluaran', value: 'expense' }))
    .addIntegerOption(o => o.setName('jumlah_data').setDescription('Maksimal hasil ditampilkan (default 10)')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const wallets = db.prepare('SELECT name FROM wallets').all();
    const filtered = wallets.filter(w => w.name.toLowerCase().includes(focused.toLowerCase()));
    return interaction.respond(filtered.slice(0, 25).map(w => ({ name: w.name, value: w.name })));
  },

  async execute(interaction) {
    const kataKunci = interaction.options.getString('kata_kunci');
    const walletName = interaction.options.getString('dompet');
    const tipe = interaction.options.getString('tipe');
    const limit = interaction.options.getInteger('jumlah_data') || 10;

    let query = `
      SELECT t.*, w.name as wallet_name, w.emoji as wallet_emoji, c.name as cat_name, c.emoji as cat_emoji
      FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.description LIKE ?
    `;
    const params = [`%${kataKunci}%`];

    if (walletName) {
      query += ' AND w.name = ?';
      params.push(walletName);
    }
    if (tipe) {
      query += ' AND t.type = ?';
      params.push(tipe);
    }
    query += ' ORDER BY t.created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params);
    if (rows.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Tidak Ditemukan', `Gak ada transaksi dengan deskripsi mengandung "${kataKunci}".`)], ephemeral: true });
    }

    const typeIcon = { income: '📥', expense: '📤', transfer_in: '↩️', transfer_out: '↪️' };
    const lines = rows.map(r =>
      `${typeIcon[r.type]} **${formatRupiah(r.amount)}** — ${r.cat_emoji || ''} ${r.cat_name || 'Transfer'} • ${r.wallet_emoji} ${r.wallet_name}\n` +
      `┗ ${r.description || 'tanpa catatan'} · ${formatDate(r.created_at)} · ID: \`${r.id}\``
    );

    const embed = baseEmbed().setTitle(`🔍 Hasil Pencarian: "${kataKunci}"`).setDescription(lines.join('\n\n'))
      .setFooter({ text: `${rows.length} hasil ditemukan${rows.length === limit ? ' (mungkin masih ada lagi, coba naikkan jumlah_data)' : ''}` });
    return interaction.reply({ embeds: [embed] });
  },
};
