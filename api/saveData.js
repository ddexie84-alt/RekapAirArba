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

// Menghitung Sisa Stock Akhir dalam Liter
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, data } = req.body;
  if (!date || !data) {
    return res.status(400).json({ error: 'Date and data are required' });
  }

  try {
    // 1. Optimistic Locking Check
    const existing = await kv.get(`solar_data_${date}`);
    if (existing) {
      const currentRev = existing._rev || 0;
      if (data._rev !== undefined && data._rev !== currentRev) {
        return res.status(409).json({ error: 'Conflict: Data modified by another user' });
      }
      data._rev = currentRev + 1;
    } else {
      data._rev = 1;
    }

    // Preserve/set manual flag if user filled explicit real/minus
    if (data.isManualRealGenset === undefined && ((data.stokRealGenset && data.stokRealGenset.trim()) || (data.minusRealGenset && data.minusRealGenset.trim()))) {
      data.isManualRealGenset = true;
    }

    // 2. Simpan data untuk tanggal yang sedang di-edit
    await kv.set(`solar_data_${date}`, data);
    
    // 3. Hitung Stock Akhir dari data yang baru saja disimpan
    let currentStockAkhirLiters = calcStockAkhirLiters(data);
    let currentRealGensetLiters = calcRealGensetAkhirLiters(data);

    // 4. Ambil semua tanggal yang ada di database
    const allKeys = await kv.keys('solar_data_*');
    
    // Filter hanya tanggal-tanggal yang lebih besar dari tanggal yang diedit
    const subsequentKeys = allKeys
      .filter(k => {
        const keyDate = k.replace('solar_data_', '');
        // Pastikan format tanggal YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(keyDate)) return false;
        // Hanya ambil tanggal setelahnya
        return keyDate > date;
      })
      .sort(); // Urutkan secara kronologis (ascending)

    // 5. Update secara berantai (Domino Effect)
    for (const key of subsequentKeys) {
      const nextData = await kv.get(key);
      if (!nextData) continue;
      
      // Update stock awal hari tersebut dengan stock akhir hari sebelumnya
      nextData.stockPrev = fromTotalLiters(currentStockAkhirLiters);
      
      // Hitung ulang stock akhir hari tersebut
      currentStockAkhirLiters = calcStockAkhirLiters(nextData);

      // Cascade Genset Real
      if (currentRealGensetLiters !== null) {
        nextData.gensetRealPrev = currentRealGensetLiters;
        const isNextManual = nextData.isManualRealGenset === true;
        if (!isNextManual) {
          const masukG = calcGensetMasukLiters(nextData);
          const keluarG = calcGensetKeluarLiters(nextData);
          const nextRealLiters = Math.max(0, currentRealGensetLiters + masukG - keluarG);
          nextData.stokRealGenset = formatFromLiters(nextRealLiters);
          const webG = calcGensetWebLiters(nextData);
          const minusG = webG - nextRealLiters;
          nextData.minusRealGenset = (minusG > 0.05 ? formatFromLiters(minusG) : (minusG < -0.05 ? ('-' + formatFromLiters(Math.abs(minusG))) : '0'));
          nextData.isManualRealGenset = false;
          currentRealGensetLiters = nextRealLiters;
        } else {
          // Manual entry keeps its value and becomes the baseline going forward
          currentRealGensetLiters = calcRealGensetAkhirLiters(nextData);
        }
      }
      
      // Simpan perubahan ke database
      await kv.set(key, nextData);
    }

    // 6. Update operator HM History
    try {
      let hmHistory = {};
      if (allKeys.length > 0) {
        // Chunking mget to avoid Upstash 1000 keys limit
        const chunkSize = 100;
        let pastDataArray = [];
        for (let i = 0; i < allKeys.length; i += chunkSize) {
          const chunk = allKeys.slice(i, i + chunkSize);
          const chunkData = await kv.mget(...chunk);
          pastDataArray = pastDataArray.concat(chunkData);
        }
        
        allKeys.forEach((key, idx) => {
          const pastData = pastDataArray[idx];
          if (!pastData) return;
          const kDate = key.replace('solar_data_', '');
          [...(pastData.loader || []), ...(pastData.exa || [])].forEach(item => {
             if (item.operator && item.hmIsi) {
                if (!hmHistory[item.operator]) hmHistory[item.operator] = [];
                // Only push if not already exists for this date to avoid duplicates
                const existing = hmHistory[item.operator].find(e => e.date === kDate);
                if (!existing) {
                  hmHistory[item.operator].push({ date: kDate, hm: parseFloat(item.hmIsi) });
                } else {
                  existing.hm = Math.max(existing.hm, parseFloat(item.hmIsi));
                }
             }
          });
        });
      }

      // Sort dates
      Object.keys(hmHistory).forEach(opr => {
         hmHistory[opr].sort((a,b) => a.date.localeCompare(b.date));
      });

      await kv.set('operator_hm_history', hmHistory);
    } catch(err) {
      console.error("Gagal update hm_history:", err);
    }

    return res.status(200).json({ success: true, cascaded: subsequentKeys.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to save data' });
  }
}
