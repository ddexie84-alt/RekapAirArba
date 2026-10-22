export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Prevent caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Format date and time for Makassar (WITA)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // en-CA produces YYYY-MM-DD format naturally for date
  const parts = formatter.formatToParts(new Date());
  let year = '', month = '', day = '', hour = '', minute = '';
  
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
    if (part.type === 'hour') hour = part.value;
    if (part.type === 'minute') minute = part.value;
  }
  
  // If hour is 24, reset to 00
  if (hour === '24') hour = '00';

  return res.status(200).json({
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`
  });
}
