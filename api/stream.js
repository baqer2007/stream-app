export default async function handler(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url');
  }

  // دعم استعلامات الـ Preflight CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; HEY2-W09) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    };

    // تمرير الـ Range لدعم تقديم وتأخير الفيديو في المتصفح
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const response = await fetch(targetUrl, {
      headers,
      redirect: 'follow'
    });

    const contentType = response.headers.get('content-type') || '';

    // معالجة استجابات الـ JSON (بيانات السيرفر والأفلام)
    if (contentType.includes('json') || targetUrl.includes('player_api.php')) {
      const data = await response.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(response.status).send(data);
    }

    // تمرير بيانات الفيديو والـ Headers الأساسية
    res.setHeader('Content-Type', contentType || 'video/mp4');
    if (response.headers.get('content-range')) {
      res.setHeader('Content-Range', response.headers.get('content-range'));
    }
    if (response.headers.get('content-length')) {
      res.setHeader('Content-Length', response.headers.get('content-length'));
    }
    res.setHeader('Accept-Ranges', 'bytes');

    const arrayBuffer = await response.arrayBuffer();
    return res.status(response.status).send(Buffer.from(arrayBuffer));

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
