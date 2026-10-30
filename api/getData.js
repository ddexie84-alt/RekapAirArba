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

function parseJumlahStr(str) {
  if (!str) return { jirgen: 0, liter: 0 };
  const s = String(str).trim().replace(',', '.');
  const parts = s.split('.');
  const jirgen = parseInt(parts[0]) || 0;
  const liter = parts[1] !== undefined ? parseFloat('0.' + parts[1]) * 35 : 0;
  return { jirgen, liter: Math.round(liter * 100) / 100 };
}

function formatFromLiters(totalLiters) {
  if (totalLiters === undefined || totalLiters === null || isNaN(totalLiters)) return '0';
  totalLiters = Math.round(totalLiters * 100) / 100;
  const jirgen = Math.floor(totalLiters / 35);
  const remainder = Math.round((totalLiters % 35) * 100) / 100;
  if (remainder === 0) return '' + jirgen;
  const desimal = Math.round((remainder / 35) * 100);
  if (desimal === 0) return '' + jirgen;
  return jirgen + '.' + String(desimal).padStart(2, '0');
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

function calcGensetMasukLiters(dayData) {
  if (!dayData) return 0;
  let masukGenset = 0;
  (dayData.masuk || []).forEach(item => {
    if (!item.lokasi || (item.lokasi || '').toLowerCase() === 'genset') {
      masukGenset += toTotalLiters(item.jirgen, item.liter);
    }
  });
  return masukGenset;
}

function calcGensetKeluarLiters(dayData) {
  if (!dayData) return 0;
  let keluarGenset = 0;
  (dayData.loader || []).forEach(item => {
    if (item.sumber === 'Keduanya') {
      keluarGenset += toTotalLiters(item.jirgenGenset || 0, item.literGenset || 0);
    } else if (item.sumber === 'Genset' || !item.sumber) {
      keluarGenset += toTotalLiters(item.jirgen, item.liter);
    }
  });
  (dayData.exa || []).forEach(item => {
    if (item.sumber === 'Keduanya') {
      keluarGenset += toTotalLiters(item.jirgenGenset || 0, item.literGenset || 0);
    } else if (item.sumber === 'Genset' || !item.sumber) {
      keluarGenset += toTotalLiters(item.jirgen, item.liter);
    }
  });
  (dayData.roda10 || []).forEach(item => {
    if (item.sumber === 'Keduanya') {
      keluarGenset += toTotalLiters(item.jirgenGenset || 0, item.literGenset || 0);
    } else if (item.sumber === 'Genset' || !item.sumber) {
      keluarGenset += toTotalLiters(item.jirgen, item.liter);
    }
  });
  (dayData.pabrik || []).forEach(item => {
    if (item.sumber === 'Genset' || !item.sumber) {
      keluarGenset += toTotalLiters(item.jirgen, item.liter);
    }
  });
  return keluarGenset;
}

function calcGensetWebLiters(dayData) {
  if (!dayData) return 0;
  let prevLiters = 0;
  if (dayData.stockPrev) {
    prevLiters = toTotalLiters(dayData.stockPrev.jirgen, dayData.stockPrev.liter);
  }
  return prevLiters + calcGensetMasukLiters(dayData) - calcGensetKeluarLiters(dayData);
}

function calcRealGensetAkhirLiters(dayData, prevRealLiters) {
  if (!dayData) return null;
  const rawReal = (dayData.stokRealGenset || '').trim();
  const rawMinus = (dayData.minusRealGenset || '').trim();
  const isManual = dayData.isManualRealGenset === true || (dayData.isManualRealGenset !== false && (rawReal !== '' || rawMinus !== ''));

  if (isManual) {
    if (rawReal) {
      const p = parseJumlahStr(rawReal);
      return toTotalLiters(p.jirgen, p.liter);
    } else if (rawMinus) {
      const p = parseJumlahStr(rawMinus);
      const minusL = toTotalLiters(p.jirgen, p.liter);
      const webL = calcGensetWebLiters(dayData);
      return Math.max(0, webL - minusL);
    }
  }

  if (prevRealLiters !== null && prevRealLiters !== undefined) {
    const masuk = calcGensetMasukLiters(dayData);
    const keluar = calcGensetKeluarLiters(dayData);
    return Math.max(0, prevRealLiters + masuk - keluar);
  }

  if (dayData.gensetRealPrev !== undefined && dayData.gensetRealPrev !== null) {
    const masuk = calcGensetMasukLiters(dayData);
    const keluar = calcGensetKeluarLiters(dayData);
    return Math.max(0, dayData.gensetRealPrev + masuk - keluar);
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Prevent Vercel and Browser caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { date, month } = req.query;
  if (!date && !month) {
    return res.status(400).json({ error: 'Date or Month is required' });
  }

  // 1. Ambil daftar bulan yang tersedia di database
  if (month === 'list') {
    try {
      const allKeys = await kv.keys('solar_data_*');
      const months = [...new Set(
        allKeys
          .map(k => k.replace('solar_data_', ''))
          .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
          .map(d => d.substring(0, 7))
      )].sort((a, b) => b.localeCompare(a));
      return res.status(200).json(months);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 2. Ambil seluruh data harian untuk satu bulan tertentu (misal: 2026-10)
  if (month) {
    try {
      const allKeys = await kv.keys('solar_data_' + month + '-*');
      const results = {};
      for (const k of allKeys) {
        const d = await kv.get(k);
        if (d) {
          results[k.replace('solar_data_', '')] = d;
        }
      }
      return res.status(200).json(results);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
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
      let initialRealPrev = null;
      let initialRealGenset = '';
      let initialMinusReal = '';

      if (prevKeys.length > 0) {
        const mostRecentData = await kv.get(prevKeys[0]);
        if (mostRecentData) {
          const prevStockLiters = calcStockAkhirLiters(mostRecentData);
          initialStockPrev = fromTotalLiters(prevStockLiters);

          const prevRealLiters = calcRealGensetAkhirLiters(mostRecentData);
          if (prevRealLiters !== null) {
            initialRealPrev = prevRealLiters;
            initialRealGenset = formatFromLiters(prevRealLiters);
            const initialWebLiters = prevStockLiters;
            const minusL = initialWebLiters - prevRealLiters;
            initialMinusReal = (minusL > 0.05 ? formatFromLiters(minusL) : (minusL < -0.05 ? ('-' + formatFromLiters(Math.abs(minusL))) : '0'));
          }
        }
      }

      return res.status(200).json({
        stockPrev: initialStockPrev,
        masuk: [],
        loader: [],
        exa: [],
        roda10: [],
        pabrik: [],
        gensetRealPrev: initialRealPrev,
        stokRealGenset: initialRealGenset,
        minusRealGenset: initialMinusReal,
        isManualRealGenset: false,
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
