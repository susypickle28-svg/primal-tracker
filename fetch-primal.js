// fetch-primal.js — v10 (gratuito, senza Apify)
// Utilizza la libreria tiktok-scraper per ottenere video con #primal

const { TikTokScraper } = require('tiktok-scraper');
const fs = require('fs');

const DATA_FILE = 'data.json';

async function fetchDailyVideos() {
  console.log('🚀 Avvio scraping TikTok per #primal...');

  try {
    // Scraping dell'hashtag #primal (massimo 1000 video)
    const videos = await TikTokScraper.hashtag({
      name: 'primal',
      count: 1000,           // Numero di video da ottenere (max 1000)
      timeout: 30000,        // Timeout 30 secondi
    });

    console.log(`📦 Ricevuti ${videos.length} video totali`);

    // Filtra quelli delle ultime 24h
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentVideos = videos.filter(v => {
      const ts = v.createTime ? v.createTime * 1000 : 0; // createTime è in secondi
      return ts >= oneDayAgo;
    });

    console.log(`📅 Video nelle ultime 24h: ${recentVideos.length}`);

    // Calcola like, view, share (se disponibili)
    const totalLikes = recentVideos.reduce((s, v) => s + (v.diggCount || 0), 0);
    const totalViews = recentVideos.reduce((s, v) => s + (v.playCount || 0), 0);
    const totalShares = recentVideos.reduce((s, v) => s + (v.shareCount || 0), 0);

    console.log(`❤️ Like: ${totalLikes}  👁️ View: ${totalViews}`);

    return {
      dailyVideos: recentVideos.length,
      totalFetched: videos.length,
      totalLikes,
      totalViews,
      totalShares,
    };
  } catch (err) {
    console.error('❌ Errore durante lo scraping:', err.message);
    throw err;
  }
}

async function updateDataFile(stats) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const updateTime = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

  let records = [];
  if (fs.existsSync(DATA_FILE)) {
    try {
      records = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(records)) records = [];
    } catch (e) {
      records = [];
    }
  }

  const newRecord = {
    date: today,
    dailyVideos: stats.dailyVideos,
    totalFetched: stats.totalFetched,
    totalLikes: stats.totalLikes,
    totalViews: stats.totalViews,
    totalShares: stats.totalShares,
    updateTime,
  };

  const idx = records.findIndex(r => r.date === today);
  if (idx >= 0) {
    records[idx] = newRecord;
    console.log(`🔄 Aggiornato ${today} @ ${updateTime}`);
  } else {
    records.push(newRecord);
    console.log(`➕ Aggiunto ${today} @ ${updateTime}`);
  }

  if (records.length > 90) {
    records = records.slice(-90);
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
  console.log(`💾 Salvati ${records.length} record`);
}

(async () => {
  try {
    console.log('⏰ Avvio fetch #primal -', new Date().toISOString());
    const stats = await fetchDailyVideos();
    await updateDataFile(stats);
    console.log('✅ Completato con successo!');
  } catch (err) {
    console.error('❌ Errore fatale:', err);
    console.log('⚠️ Il workflow continuerà al prossimo ciclo.');
    process.exit(0);
  }
})();
