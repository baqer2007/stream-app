export default async function handler(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  const customHeaders = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; HEY2-W09 Build/HONORHEY2-W09; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/150.0.7871.184 Safari/537.36 Vinebre',
    'X-Requested-With': 'kid.tv',
    'Referer': 'http://localhost/',
    'Accept': '*/*'
  };

  try {
    // تتبع الـ 302 Redirect تلقائياً وجلب الرابط النهائي
    const response = await fetch(targetUrl, {
      headers: customHeaders,
      redirect: 'follow'
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    const finalUrl = response.url;
    const contentType = response.headers.get('content-type') || '';

    // معالجة ملفات القوائم m3u8
    if (finalUrl.includes('.m3u8') || targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
      const text = await response.text();
      const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);

      const modifiedPlaylist = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;

        let fullSegmentUrl = trimmed;
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          fullSegmentUrl = baseUrl + trimmed;
        }
        return `/api/stream?url=${encodeURIComponent(fullSegmentUrl)}`;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(modifiedPlaylist);
    }

    // تمرير قطع الفيديو المباشرة (.ts)
    const arrayBuf = await response.arrayBuffer();
    res.setHeader('Content-Type', 'video/MP2T');
    return res.send(Buffer.from(arrayBuf));

  } catch (err) {
    return res.status(500).send(err.message);
  }
}
