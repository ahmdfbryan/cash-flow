const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const { successEmbed, errorEmbed, baseEmbed } = require('../utils/embeds');
const { formatRupiah } = require('../utils/format');

function nextRunDate(frequency) {
  const d = new Date();
  if (frequency === 'daily') d.setDate(d.getDate() + 1);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('berulang')
    .setDescription('Kelola transaksi otomatis berulang (tagihan, langganan, dll)')
    .addSubcommand(sub => sub.setName('buat').setDescription('Buat transaksi berulang baru')
      .addStringOption(o => o.setName('tipe').setDescription('Tipe').setRequired(true)
        .addChoices({ name: 'Pemasukan', value: 'income' }, { name: 'Pengeluaran', value: 'expense' }))
      .addIntegerOption(o => o.setName('jumlah').setDescription('Nominal').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('kategori').setDescription('Kategori').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('dompet').setDescription('Dompet').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('frekuensi').setDescription('Seberapa sering').setRequired(true)
        .addChoices({ name: 'Harian', value: 'daily' }, { name: 'Mingguan', value: 'weekly' }, { name: 'Bulanan', value: 'monthly' }))
      .addStringOption(o => o.setName('deskripsi').setDescription('Catatan')))
    .addSubcommand(sub => sub.setName('list').setDescription('Lihat semua transaksi berulang aktif'))
    .addSubcommand(sub => sub.setName('hapus').setDescription('Hentikan transaksi berulang')
      .addIntegerOption(o => o.setName('id').setDescription('ID recurring (lihat di /berulang list)').setRequired(true))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'dompet') {
      const wallets = db.prepare('SELECT name FROM wallets').all();
      return interaction.respond(wallets.filter(w => w.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25).map(w => ({ name: w.name, value: w.name })));
    }
    if (focused.name === 'kategori') {
      const tipe = interaction.options.getString('tipe') || 'expense';
      const cats = db.prepare('SELECT name FROM categories WHERE type = ?').all(tipe);
      return interaction.respond(cats.filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25).map(c => ({ name: c.name, value: c.name })));
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'buat') {
      const tipe = interaction.options.getString('tipe');
      const jumlah = interaction.options.getInteger('jumlah');
      const kategori = interaction.options.getString('kategori');
      const walletName = interaction.options.getString('dompet');
      const frekuensi = interaction.options.getString('frekuensi');
      const deskripsi = interaction.options.getString('deskripsi') || '';

      const wallet = db.prepare('SELECT * FROM wallets WHERE name = ?').get(walletName);
      const cat = db.prepare('SELECT * FROM categories WHERE name = ? AND type = ?').get(kategori, tipe);
      if (!wallet || !cat) return interaction.reply({ embeds: [errorEmbed('Tidak Valid', 'Dompet atau kategori tidak ditemukan.')], ephemeral: true });

      const next = nextRunDate(frekuensi);
      db.prepare(`INSERT INTO recurring (wallet_id, category_id, type, amount, description, frequency, next_run) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(wallet.id, cat.id, tipe, jumlah, deskripsi, frekuensi, next);

      const freqLabel = { daily: 'harian', weekly: 'mingguan', monthly: 'bulanan' }[frekuensi];
      return interaction.reply({ embeds: [successEmbed('Transaksi Berulang Dibuat', `${formatRupiah(jumlah)} (${freqLabel}) — ${cat.emoji} ${cat.name} dari/ke ${wallet.emoji} ${wallet.name}.\nEksekusi pertama otomatis: ${next}`)] });
    }

    if (sub === 'list') {
      const rows = db.prepare(`
        SELECT r.*, w.name as wallet_name, c.name as cat_name, c.emoji as cat_emoji FROM recurring r
        JOIN wallets w ON w.id = r.wallet_id LEFT JOIN categories c ON c.id = r.category_id
        WHERE r.active = 1
      `).all();
      if (rows.length === 0) return interaction.reply({ embeds: [errorEmbed('Kosong', 'Belum ada transaksi berulang aktif.')], ephemeral: true });

      const freqLabel = { daily: 'harian', weekly: 'mingguan', monthly: 'bulanan' };
      const lines = rows.map(r => `**#${r.id}** ${r.cat_emoji || ''} ${r.cat_name || '-'} — ${formatRupiah(r.amount)} (${freqLabel[r.frequency]}) via ${r.wallet_name}\nEksekusi berikutnya: ${r.next_run}`);
      return interaction.reply({ embeds: [baseEmbed().setTitle('🔁 Transaksi Berulang Aktif').setDescription(lines.join('\n\n'))] });
    }

    if (sub === 'hapus') {
      const id = interaction.options.getInteger('id');
      const row = db.prepare('SELECT * FROM recurring WHERE id = ?').get(id);
      if (!row) return interaction.reply({ embeds: [errorEmbed('Tidak Ditemukan', `Recurring #${id} tidak ada.`)], ephemeral: true });
      db.prepare('UPDATE recurring SET active = 0 WHERE id = ?').run(id);
      return interaction.reply({ embeds: [successEmbed('Dihentikan', `Transaksi berulang #${id} telah dinonaktifkan.`)] });
    }
  },
};
