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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, data } = req.body;
  if (!date || !data) {
    return res.status(400).json({ error: 'Date and data are required' });
  }

  try {
    // 1. Simpan data untuk tanggal yang sedang di-edit
    await kv.set(`solar_data_${date}`, data);
    
    // 2. Hitung Stock Akhir dari data yang baru saja disimpan
    let currentStockAkhirLiters = calcStockAkhirLiters(data);

    // 3. Ambil semua tanggal yang ada di database
    // get keys returns an array like ["solar_data_2026-10-05", "solar_data_2026-10-06"]
    const allKeys = await kv.keys('solar_data_*');
    
    // 4. Filter hanya tanggal-tanggal yang lebih besar dari tanggal yang diedit
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
