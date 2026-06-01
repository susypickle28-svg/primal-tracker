// fetch-primal.js — #primal daily activity tracker
// Conta i video postati nelle ultime 24h con #primal usando Apify

const https = require('https');
const fs = require('fs');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const DATA_FILE = 'data.json';

if (!APIFY_TOKEN) {
  console.error('❌ APIFY_TOKEN non trovato! Controlla i GitHub Secrets.');
  process.exit(1);
}

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchDailyVideos() {
  console.log('🚀 Avvio scraper #primal — conteggio video ultimi 24h...');

  // Scarica 50 video recenti con #primal
  const runBody = JSON.stringify({
    hashtags: ['primal'],
    resultsPerPage: 50,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
  });

  const runRes = await httpRequest({
    hostname: 'api.apify.com',
    path: `/v2/acts/clockworks~tiktok-scraper/runs?token=${APIFY_TOKEN}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(runBody),
    }
  }, runBody);

  if (runRes.status !== 201) {
    console.error('❌ Errore avvio actor:', JSON.stringify(runRes.body));
    process.exit(1);
  }

  const runId = runRes.body.data.id;
  console.log(`✅ Actor avviato. Run ID: ${runId}`);

  // Polling
  let status = 'RUNNING';
  let attempts = 0;
  while (['RUNNING', 'READY', 'ABORTING'].includes(status)) {
    await sleep(15000);
    attempts++;
    if (attempts > 30) {
      console.error('❌ Timeout');
      process.exit(1);
    }
    const statusRes = await httpRequest({
      hostname: 'api.apify.com',
      path: `/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
      method: 'GET',
    });
    status = statusRes.body.data.status;
    console.log(`⏳ Stato: ${status} (${attempts * 15}s)`);
  }

  if (status !== 'SUCCEEDED') {
    console.error(`❌ Actor fallito: ${status}`);
    process.exit(1);
  }

  // Leggi dataset
  const runInfoRes = await httpRequest({
    hostname: 'api.apify.com',
    path: `/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
    method: 'GET',
  });
  const datasetId = runInfoRes.body.data.defaultDatasetId;

  const itemsRes = await httpRequest({
    hostname: 'api.apify.com',
    path: `/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=100`,
    method: 'GET',
  });

  const items = itemsRes.body;
  if (!items || !Array.isArray(items)) {
    console.error('❌ Dataset vuoto');
    process.exit(1);
  }

  console.log(`📦 Ricevuti ${items.length} video totali`);

  // Filtra solo i video delle ultime 24h
  const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
  const recentVideos = items.filter(item => {
    const ts = item.createTime || item.createTimeISO ? new Date(item.createTimeISO).getTime() / 1000 : 0;
    return ts >= oneDayAgo;
  });

  console.log(`📅 Video nelle ultime 24h: ${recentVideos.length}`);
  console.log(`📊 Video totali scaricati: ${items.length}`);

  // Statistiche aggiuntive sui video recenti
  const totalLikes = recentVideos.reduce((sum, v) => sum + (v.diggCount || 0), 0);
  const totalViews = recentVideos.reduce((sum, v) => sum + (v.playCount || 0), 0);
  const totalShares = recentVideos.reduce((sum, v) => sum + (v.shareCount || 0), 0);

  console.log(`❤️ Like totali (24h): ${totalLikes}`);
  console.log(`👁️ View totali (24h): ${totalViews}`);

  return {
    dailyVideos: recentVideos.length,
    totalFetched: items.length,
    totalLikes,
    totalViews,
    totalShares,
  };
}

async function updateDataFile(stats) {
  const today = new Date().toISOString().slice(0, 10);
  let records = [];

  if (fs.existsSync(DATA_FILE)) {
    try {
      records = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(records)) records = [];
    } catch(e) {
      console.warn('⚠️ data.json corrotto, ricreo');
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
  };

  const idx = records.findIndex(r => r.date === today);
  if (idx >= 0) {
    records[idx] = newRecord;
    console.log(`🔄 Aggiornato ${today}`);
  } else {
    records.push(newRecord);
    console.log(`➕ Aggiunto ${today}`);
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
  console.log(`💾 Salvati ${records.length} record in data.json`);
}

(async () => {
  try {
    const stats = await fetchDailyVideos();
    await updateDataFile(stats);
    console.log('✅ Completato!');
  } catch(err) {
    console.error('❌ Errore fatale:', err);
    process.exit(1);
  }
})();
