import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, data } = req.body;
  if (!date || !data) {
    return res.status(400).json({ error: 'Date and data are required' });
  }

  try {
    await kv.set(`solar_data_${date}`, data);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to save data' });
  }
}
