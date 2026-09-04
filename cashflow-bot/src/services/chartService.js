// Pakai QuickChart.io (hosted chart image API) supaya tidak butuh native
// dependency seperti node-canvas yang sering bikin masalah compile di VPS.

function buildQuickChartUrl(config) {
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?w=600&h=400&bkg=%232b2d31&c=${encoded}`;
}

function pieChartByCategory(rows) {
  // rows: [{ name, emoji, total }]
  const config = {
    type: 'pie',
    data: {
      labels: rows.map(r => `${r.emoji} ${r.name}`),
      datasets: [{
        data: rows.map(r => r.total),
        backgroundColor: ['#5865F2','#EB459E','#57F287','#FEE75C','#ED4245','#9B59B6','#3498DB','#E67E22','#1ABC9C'],
      }],
    },
    options: {
      plugins: {
        legend: { labels: { color: '#ffffff' } },
        title: { display: true, text: 'Pengeluaran per Kategori', color: '#ffffff', font: { size: 18 } },
      },
    },
  };
  return buildQuickChartUrl(config);
}

function trendChart(labels, incomeData, expenseData) {
  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Pemasukan', data: incomeData, backgroundColor: '#57F287' },
        { label: 'Pengeluaran', data: expenseData, backgroundColor: '#ED4245' },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: '#ffffff' } },
        title: { display: true, text: 'Tren Cash Flow', color: '#ffffff', font: { size: 18 } },
      },
      scales: {
        x: { ticks: { color: '#ffffff' } },
        y: { ticks: { color: '#ffffff' } },
      },
    },
  };
  return buildQuickChartUrl(config);
}

module.exports = { pieChartByCategory, trendChart };
