// fetch-primal.js — v11 (yt-dlp, senza canvas)
const { execSync } = require('child_process');
const fs = require('fs');

const DATA_FILE = 'data.json';

async function fetchDailyVideos() {
  console.log('🚀 Avvio yt-dlp per #primal...');

  // Esegue yt-dlp per trovare video con #primal nelle ultime 24h
  const today = new Date();
  const oneDayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dateFilter = oneDayAgo.toISOString().slice(0, 10);

  try {
    // 1. Cerca video con #primal
    const searchResult = execSync(
      `yt-dlp --no-download --write-info-json --print "%(title)s|||%(uploader)s|||%(view_count)s|||%(like_count)s|||%(upload_date)s|||%(webpage_url)s|||%(video_id)s" "https://www.tiktok.com/tag/primal" --dateafter ${dateFilter} --max-filesize 10G --no-warnings`,
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const lines = searchResult.toString().trim().split('\n').filter(l => l.includes('|||'));
    
    console.log(`📦 Ricevuti ${lines.length} video totali`);

    // 2. Calcola i dati
    let totalLikes = 0;
    let totalViews = 0;
    let totalShares = 0;

    for (const line of lines) {
      const parts = line.split('|||');
      if (parts.length >= 5) {
        const views = parseInt(parts[2]) || 0;
        const likes = parseInt(parts[3]) || 0;
        totalViews += views;
        totalLikes += likes;
        // Condivisioni non disponibili nell'output standard
      }
    }

    console.log(`❤️ Like: ${totalLikes}  👁️ View: ${totalViews}`);

    return {
      dailyVideos: lines.length,
      totalFetched: lines.length,
      totalLikes,
      totalViews,
      totalShares: 0, // yt-dlp non restituisce shareCount
    };
  } catch (err) {
    console.error('❌ Errore yt-dlp:', err.message);
    throw err;
  }
}

async function updateDataFile(stats) {
  // ... (identico alla versione precedente)
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const updateTime = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

  let records = [];
  if (fs.existsSync(DATA_FILE)) {
    try {
      records = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) { records = []; }
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
  if (idx >= 0) records[idx] = newRecord;
  else records.push(newRecord);

  if (records.length > 90) records = records.slice(-90);
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
    process.exit(0);
  }
})();
