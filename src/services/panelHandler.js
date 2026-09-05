const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database/db');
const { errorEmbed } = require('../utils/embeds');

// State sementara per-sesi (per pesan ephemeral), isinya pilihan dropdown sebelum lanjut ke modal.
// Dibersihkan otomatis begitu modal ditampilkan atau kalau kadaluarsa.
const sessions = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000;

function setSession(messageId, data) {
  sessions.set(messageId, { ...(sessions.get(messageId) || {}), ...data, updatedAt: Date.now() });
}
function getSession(messageId) {
  const s = sessions.get(messageId);
  if (s && Date.now() - s.updatedAt > SESSION_TTL_MS) { sessions.delete(messageId); return null; }
  return s || null;
}

function isPanelButton(customId) {
  return ['panel_masuk', 'panel_keluar', 'panel_transfer', 'panel_continue_masuk', 'panel_continue_keluar', 'panel_continue_transfer'].includes(customId);
}
function isPanelSelect(customId) {
  return ['panel_select_wallet', 'panel_select_category', 'panel_select_wallet_from', 'panel_select_wallet_to'].includes(customId);
}
function isPanelModal(customId) {
  return customId.startsWith('modal_final_');
}

function parseAmount(raw) {
  const cleaned = String(raw).replace(/[^\d]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : NaN;
}

// ============================================================
// Tahap 1: klik tombol panel -> tampilkan dropdown pilihan
// ============================================================
async function handleButton(interaction) {
  if (interaction.customId === 'panel_masuk' || interaction.customId === 'panel_keluar') {
    return startMasukKeluarFlow(interaction, interaction.customId === 'panel_masuk' ? 'income' : 'expense');
  }
  if (interaction.customId === 'panel_transfer') {
    return startTransferFlow(interaction);
  }
  if (interaction.customId === 'panel_continue_masuk' || interaction.customId === 'panel_continue_keluar') {
    return continueMasukKeluar(interaction, interaction.customId === 'panel_continue_masuk' ? 'income' : 'expense');
  }
  if (interaction.customId === 'panel_continue_transfer') {
    return continueTransfer(interaction);
  }
}

async function startMasukKeluarFlow(interaction, type) {
  const wallets = db.prepare('SELECT * FROM wallets').all().slice(0, 25);
  const categories = db.prepare('SELECT * FROM categories WHERE type = ?').all(type).slice(0, 25);

  const walletSelect = new StringSelectMenuBuilder().setCustomId('panel_select_wallet').setPlaceholder('1️⃣ Pilih dompet...')
    .addOptions(wallets.map(w => ({ label: w.name, value: String(w.id), emoji: w.emoji })));
  const categorySelect = new StringSelectMenuBuilder().setCustomId('panel_select_category').setPlaceholder('2️⃣ Pilih kategori...')
    .addOptions(categories.map(c => ({ label: c.name, value: String(c.id), emoji: c.emoji })));
  const continueBtn = new ButtonBuilder().setCustomId(`panel_continue_${type === 'income' ? 'masuk' : 'keluar'}`).setLabel('Lanjut ➡️').setStyle(ButtonStyle.Primary);

  const reply = await interaction.reply({
    content: buildSummaryText(type === 'income' ? 'Catat Pemasukan' : 'Catat Pengeluaran', null, null),
    components: [
      new ActionRowBuilder().addComponents(walletSelect),
      new ActionRowBuilder().addComponents(categorySelect),
      new ActionRowBuilder().addComponents(continueBtn),
    ],
    ephemeral: true,
    withResponse: true,
  });

  setSession(reply.resource.message.id, { type });
}

async function startTransferFlow(interaction) {
  const wallets = db.prepare('SELECT * FROM wallets').all().slice(0, 25);

  const fromSelect = new StringSelectMenuBuilder().setCustomId('panel_select_wallet_from').setPlaceholder('1️⃣ Dari dompet...')
    .addOptions(wallets.map(w => ({ label: w.name, value: String(w.id), emoji: w.emoji })));
  const toSelect = new StringSelectMenuBuilder().setCustomId('panel_select_wallet_to').setPlaceholder('2️⃣ Ke dompet...')
    .addOptions(wallets.map(w => ({ label: w.name, value: String(w.id), emoji: w.emoji })));
  const continueBtn = new ButtonBuilder().setCustomId('panel_continue_transfer').setLabel('Lanjut ➡️').setStyle(ButtonStyle.Primary);

  const reply = await interaction.reply({
    content: buildTransferSummaryText(null, null),
    components: [
      new ActionRowBuilder().addComponents(fromSelect),
      new ActionRowBuilder().addComponents(toSelect),
      new ActionRowBuilder().addComponents(continueBtn),
    ],
    ephemeral: true,
    withResponse: true,
  });

  setSession(reply.resource.message.id, { type: 'transfer' });
}

function buildSummaryText(title, walletName, categoryName) {
  return `**${title}**\n` +
    `${walletName ? '✅' : '⬜'} Dompet: ${walletName || '_(belum dipilih)_'}\n` +
    `${categoryName ? '✅' : '⬜'} Kategori: ${categoryName || '_(belum dipilih)_'}\n` +
    `Pilih dompet & kategori di atas, lalu klik **Lanjut** buat isi jumlah & deskripsi.`;
}
function buildTransferSummaryText(fromName, toName) {
  return `**Transfer Antar Dompet**\n` +
    `${fromName ? '✅' : '⬜'} Dari: ${fromName || '_(belum dipilih)_'}\n` +
    `${toName ? '✅' : '⬜'} Ke: ${toName || '_(belum dipilih)_'}\n` +
    `Pilih dompet asal & tujuan di atas, lalu klik **Lanjut** buat isi jumlah & biaya admin (opsional).`;
}

// ============================================================
// Tahap 2: user pilih dari dropdown -> update ringkasan pesan
// ============================================================
async function handleSelectMenu(interaction) {
  const session = getSession(interaction.message.id) || {};

  if (interaction.customId === 'panel_select_wallet') {
    session.walletId = parseInt(interaction.values[0], 10);
    setSession(interaction.message.id, session);
    const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(session.walletId);
    const category = session.categoryId ? db.prepare('SELECT * FROM categories WHERE id = ?').get(session.categoryId) : null;
    return interaction.update({ content: buildSummaryText(session.type === 'income' ? 'Catat Pemasukan' : 'Catat Pengeluaran', wallet?.name, category?.name) });
  }

  if (interaction.customId === 'panel_select_category') {
    session.categoryId = parseInt(interaction.values[0], 10);
    setSession(interaction.message.id, session);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(session.categoryId);
    const wallet = session.walletId ? db.prepare('SELECT * FROM wallets WHERE id = ?').get(session.walletId) : null;
    return interaction.update({ content: buildSummaryText(session.type === 'income' ? 'Catat Pemasukan' : 'Catat Pengeluaran', wallet?.name, category?.name) });
  }

  if (interaction.customId === 'panel_select_wallet_from') {
    session.fromId = parseInt(interaction.values[0], 10);
    setSession(interaction.message.id, session);
    const from = db.prepare('SELECT * FROM wallets WHERE id = ?').get(session.fromId);
    const to = session.toId ? db.prepare('SELECT * FROM wallets WHERE id = ?').get(session.toId) : null;
    return interaction.update({ content: buildTransferSummaryText(from?.name, to?.name) });
  }

  if (interaction.customId === 'panel_select_wallet_to') {
    session.toId = parseInt(interaction.values[0], 10);
    setSession(interaction.message.id, session);
    const to = db.prepare('SELECT * FROM wallets WHERE id = ?').get(session.toId);
    const from = session.fromId ? db.prepare('SELECT * FROM wallets WHERE id = ?').get(session.fromId) : null;
    return interaction.update({ content: buildTransferSummaryText(from?.name, to?.name) });
  }
}

// ============================================================
// Tahap 3: klik "Lanjut" -> tampilkan modal (cuma jumlah & deskripsi)
// ============================================================
async function continueMasukKeluar(interaction, type) {
  const session = getSession(interaction.message.id);
  if (!session || !session.walletId || !session.categoryId) {
    return interaction.reply({ embeds: [errorEmbed('Belum Lengkap', 'Pilih dompet dan kategori dulu sebelum klik Lanjut.')], ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_final_${type}_${session.walletId}_${session.categoryId}`)
    .setTitle(type === 'income' ? 'Catat Pemasukan' : 'Catat Pengeluaran')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('jumlah').setLabel('Jumlah (angka saja)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 50000'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('deskripsi').setLabel('Deskripsi (opsional)').setStyle(TextInputStyle.Short).setRequired(false),
      ),
    );
  return interaction.showModal(modal);
}

async function continueTransfer(interaction) {
  const session = getSession(interaction.message.id);
  if (!session || !session.fromId || !session.toId) {
    return interaction.reply({ embeds: [errorEmbed('Belum Lengkap', 'Pilih dompet asal dan tujuan dulu sebelum klik Lanjut.')], ephemeral: true });
  }
  if (session.fromId === session.toId) {
    return interaction.reply({ embeds: [errorEmbed('Tidak Valid', 'Dompet asal dan tujuan gak boleh sama. Pilih ulang salah satunya.')], ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_final_transfer_${session.fromId}_${session.toId}`)
    .setTitle('Transfer Antar Dompet')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('jumlah').setLabel('Jumlah (angka saja)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 100000'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('biaya_admin').setLabel('Biaya Admin (opsional, default 0)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('contoh: 2500'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('deskripsi').setLabel('Deskripsi (opsional)').setStyle(TextInputStyle.Short).setRequired(false),
      ),
    );
  return interaction.showModal(modal);
}

// ============================================================
// Tahap 4: submit modal -> proses transaksi beneran
// ============================================================
async function handleModalSubmit(interaction) {
  const catat = require('../commands/catat'); // lazy require, hindari circular dependency

  const parts = interaction.customId.split('_'); // modal_final_<kind>_<id1>_<id2>
  const kind = parts[2];

  if (kind === 'income' || kind === 'expense') {
    const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(parseInt(parts[3], 10));
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(parseInt(parts[4], 10));
    if (!wallet || !category) {
      return interaction.reply({ embeds: [errorEmbed('Data Tidak Ditemukan', 'Dompet atau kategori sudah tidak ada. Coba ulangi dari awal lewat tombol panel.')], ephemeral: true });
    }
    const jumlah = parseAmount(interaction.fields.getTextInputValue('jumlah'));
    const deskripsi = interaction.fields.getTextInputValue('deskripsi') || '';
    if (!jumlah || jumlah <= 0) {
      return interaction.reply({ embeds: [errorEmbed('Jumlah Tidak Valid', 'Isi jumlah dengan angka lebih dari 0, contoh: 50000')], ephemeral: true });
    }
    return catat.processMasukKeluar(interaction, kind, jumlah, wallet.name, category.name, deskripsi);
  }

  if (kind === 'transfer') {
    const from = db.prepare('SELECT * FROM wallets WHERE id = ?').get(parseInt(parts[3], 10));
    const to = db.prepare('SELECT * FROM wallets WHERE id = ?').get(parseInt(parts[4], 10));
    if (!from || !to) {
      return interaction.reply({ embeds: [errorEmbed('Data Tidak Ditemukan', 'Salah satu dompet sudah tidak ada. Coba ulangi dari awal lewat tombol panel.')], ephemeral: true });
    }
    const jumlah = parseAmount(interaction.fields.getTextInputValue('jumlah'));
    const biayaAdminRaw = interaction.fields.getTextInputValue('biaya_admin');
    const biayaAdmin = biayaAdminRaw ? (parseAmount(biayaAdminRaw) || 0) : 0;
    const deskripsi = interaction.fields.getTextInputValue('deskripsi') || '';
    if (!jumlah || jumlah <= 0) {
      return interaction.reply({ embeds: [errorEmbed('Jumlah Tidak Valid', 'Isi jumlah dengan angka lebih dari 0, contoh: 100000')], ephemeral: true });
    }
    return catat.processTransfer(interaction, jumlah, from.name, to.name, biayaAdmin, deskripsi);
  }
}

module.exports = { isPanelButton, isPanelSelect, isPanelModal, handleButton, handleSelectMenu, handleModalSubmit };
