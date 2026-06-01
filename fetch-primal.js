// fetch-primal.js — Bot automatico #primal tracker
// Usa Apify clockworks/tiktok-scraper per leggere il conteggio video dell'hashtag

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

async function fetchPrimalVideoCount() {
  console.log('🚀 Avvio scraper TikTok per #primal...');

  // Scarica più video così aumenta la chance di trovare videoCount
  const runBody = JSON.stringify({
    hashtags: ['primal'],
    resultsPerPage: 5,
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
    await sleep(12000);
    attempts++;
    if (attempts > 20) {
      console.error('❌ Timeout dopo 4 minuti');
      process.exit(1);
    }
    const statusRes = await httpRequest({
      hostname: 'api.apify.com',
      path: `/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
      method: 'GET',
    });
    status = statusRes.body.data.status;
    console.log(`⏳ Stato: ${status} (${attempts * 12}s)`);
  }

  if (status !== 'SUCCEEDED') {
    console.error(`❌ Actor fallito con stato: ${status}`);
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
    path: `/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=10`,
    method: 'GET',
  });

  const items = itemsRes.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    console.error('❌ Dataset vuoto');
    process.exit(1);
  }

  console.log(`📦 Ricevuti ${items.length} item dal dataset`);

  // Cerca videoCount in tutti gli item (TikTok lo mette solo in alcuni)
  let videoCount = null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Tutti i possibili campi dove TikTok nasconde il conteggio video
    const found =
      item.searchHashtag?.videoCount ||
      item.searchHashtag?.video_count ||
      item.hashtagInfo?.stats?.videoCount ||
      item.challengeInfo?.stats?.videoCount ||
      item.challenge?.stats?.videoCount ||
      item.stats?.videoCount ||
      item.videoCount ||
      item.postCount ||
      item.postsCount ||
      null;

    if (found) {
      videoCount = found;
      console.log(`🎯 videoCount trovato nell'item ${i}: ${videoCount}`);
      break;
    }
  }

  // Fallback: se non troviamo videoCount, salviamo le views come proxy
  if (!videoCount) {
    console.warn('⚠️ videoCount non trovato direttamente. Stampo tutti i campi per debug:');
    for (let i = 0; i < Math.min(items.length, 3); i++) {
      console.log(`--- Item ${i} keys:`, Object.keys(items[i]));
      if (items[i].searchHashtag) {
        console.log(`--- Item ${i} searchHashtag:`, JSON.stringify(items[i].searchHashtag));
      }
    }

    // Usa views come fallback temporaneo
    const views = items[0]?.searchHashtag?.views || null;
    if (views) {
      console.warn(`⚠️ Uso views come fallback: ${views}`);
      videoCount = views;
    } else {
      console.error('❌ Nessun dato utile trovato');
      process.exit(1);
    }
  }

  return videoCount;
}

async function updateDataFile(count) {
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

  const idx = records.findIndex(r => r.date === today);
  if (idx >= 0) {
    records[idx].total = count;
    console.log(`🔄 Aggiornato record per ${today}`);
  } else {
    records.push({ date: today, total: count });
    console.log(`➕ Aggiunto nuovo record per ${today}`);
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
  console.log(`💾 Salvati ${records.length} record in data.json`);
}

(async () => {
  try {
    const count = await fetchPrimalVideoCount();
    await updateDataFile(count);
    console.log('✅ Completato!');
  } catch(err) {
    console.error('❌ Errore fatale:', err);
    process.exit(1);
  }
})();
