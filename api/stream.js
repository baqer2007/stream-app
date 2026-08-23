export default async function handler(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'kid.tv/9.8 (Linux;Android 14) AndroidXMedia3/1.1.1',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    const contentType = response.headers.get('content-type') || '';

    // إذا كان الطلب لقائمة تشغيل m3u8 نقوم بإعادة توجيه كل الروابط الداخلية للبروكسي
    if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL')) {
      const text = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

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

    // إذا كان الطلب لقطعة فيديو (.js / .ts / .pdf) نرسلها مباشرة كبيانات
    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'video/MP2T');
    return res.send(Buffer.from(buffer));

  } catch (err) {
    return res.status(500).send(err.message);
  }
}
