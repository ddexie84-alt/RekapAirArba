import { createClient } from '@vercel/kv';

const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

function toTotalLiters(jirgen, liter) {
  jirgen = parseInt(jirgen) || 0;
  liter = parseFloat(String(liter).replace(',', '.')) || 0;
  return (jirgen * 35) + liter;
}

function fromTotalLiters(totalLiters) {
  return {
    jirgen: Math.floor(totalLiters / 35),
    liter: totalLiters % 35
  };
}

function calcStockAkhirLiters(dayData) {
  if (!dayData) return 0;
  let prevLiters = 0;
  if (dayData.stockPrev) {
    prevLiters = toTotalLiters(dayData.stockPrev.jirgen, dayData.stockPrev.liter);
  }
  let totalMasuk = 0;
  (dayData.masuk || []).forEach(item => {
    totalMasuk += toTotalLiters(item.jirgen, item.liter);
  });
  let totalKeluar = 0;
  (dayData.loader || []).forEach(item => { totalKeluar += toTotalLiters(item.jirgen, item.liter); });
  (dayData.exa || []).forEach(item => { totalKeluar += toTotalLiters(item.jirgen, item.liter); });
  (dayData.roda10 || []).forEach(item => { totalKeluar += toTotalLiters(item.jirgen, item.liter); });
  (dayData.pabrik || []).forEach(item => { totalKeluar += toTotalLiters(item.jirgen, item.liter); });
  return prevLiters + totalMasuk - totalKeluar;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Prevent Vercel and Browser caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  try {
    const hmHistory = (await kv.get('operator_hm_history')) || {};

    const data = await kv.get(`solar_data_${date}`);
    if (!data) {
      // Find the most recent date BEFORE this date
      const allKeys = await kv.keys('solar_data_*');
      const prevKeys = allKeys
        .filter(k => {
          const keyDate = k.replace('solar_data_', '');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(keyDate)) return false;
          return keyDate < date;
        })
        .sort((a, b) => b.localeCompare(a)); // sort descending

      let initialStockPrev = { jirgen: 0, liter: 0 };
      if (prevKeys.length > 0) {
        const mostRecentData = await kv.get(prevKeys[0]);
        if (mostRecentData) {
          const prevStockLiters = calcStockAkhirLiters(mostRecentData);
          initialStockPrev = fromTotalLiters(prevStockLiters);
        }
      }

      return res.status(200).json({
        stockPrev: initialStockPrev,
        masuk: [],
        loader: [],
        exa: [],
        roda10: [],
        pabrik: [],
        hmHistory // Add hmHistory to response
      });
    }
    
    // Attach hmHistory to existing data
    data.hmHistory = hmHistory;
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
}
