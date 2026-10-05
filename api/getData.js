import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  try {
    const data = await kv.get(`solar_data_${date}`);
    if (!data) {
      // return default empty structure
      return res.status(200).json({
        stockPrev: { jirgen: 0, liter: 0 },
        masuk: [],
        loader: [],
        exa: [],
        roda10: [],
        pabrik: []
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
}
