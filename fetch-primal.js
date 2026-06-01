// fetch-primal.js — Bot automatico #primal tracker
// Usa Apify clockworks~tiktok-hashtag-scraper per leggere il videoCount dell'hashtag

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
  console.log('🚀 Avvio scraper hashtag TikTok per #primal...');

  // clockworks~tiktok-hashtag-scraper — restituisce stats dell'hashtag incluso videoCount
  const runBody = JSON.stringify({
    hashtags: ['primal'],
  });

  const runRes = await httpRequest({
    hostname: 'api.apify.com',
    path: `/v2/acts/clockworks~tiktok-hashtag-scraper/runs?token=${APIFY_TOKEN}`,
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

  // Polling fino a SUCCEEDED
  let status = 'RUNNING';
  let attempts = 0;
  while (['RUNNING', 'READY', 'ABORTING'].includes(status)) {
    await sleep(15000);
    attempts++;
    if (attempts > 20) {
      console.error('❌ Timeout dopo 5 minuti');
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
    path: `/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=5`,
    method: 'GET',
  });

  const items = itemsRes.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    console.error('❌ Dataset vuoto');
    process.exit(1);
  }

  console.log(`📦 Ricevuti ${items.length} item`);
  console.log('🔍 Struttura primo item:', JSON.stringify(items[0], null, 2));

  // Cerca videoCount nei campi tipici di tiktok-hashtag-scraper
  const item = items[0];
  const videoCount =
    item.videoCount ||
    item.video_count ||
    item.stats?.videoCount ||
    item.stats?.video_count ||
    item.hashtagInfo?.stats?.videoCount ||
    item.challengeInfo?.stats?.videoCount ||
    item.challenge?.stats?.videoCount ||
    item.postsCount ||
    item.postCount ||
    null;

  if (!videoCount) {
    console.error('❌ videoCount non trovato. Campi disponibili:', JSON.stringify(item, null, 2));
    process.exit(1);
  }

  console.log(`🎯 Video totali #primal: ${videoCount}`);
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
