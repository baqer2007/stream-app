export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).send("Missing url");
  }

  try {
    const targetUrl = decodeURIComponent(url);
    const parsedUrl = new URL(targetUrl);
    const hostOrigin = parsedUrl.origin;
    const queryParams = parsedUrl.search;

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "okhttp/4.9.0",
        "Referer": "http://def.yacinelive.com/",
        "Origin": "http://def.yacinelive.com"
      }
    });

    if (targetUrl.includes(".m3u8")) {
      let m3u8Text = await response.text();
      const basePath = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

      // 1. إعادة توجيه مفاتيح التشفير #EXT-X-KEY إن وجدت
      m3u8Text = m3u8Text.replace(/URI="([^"]+)"/g, (match, uri) => {
        let fullKeyUrl = uri.startsWith("http") ? uri : (uri.startsWith("/") ? `${hostOrigin}${uri}` : `${basePath}${uri}`);
        if (queryParams && !fullKeyUrl.includes("?")) fullKeyUrl += queryParams;
        return `URI="/api/stream?url=${encodeURIComponent(fullKeyUrl)}"`;
      });

      // 2. إعادة توجيه مقاطع الفيديو (.js / .ts / .pdf)
      const lines = m3u8Text.split('\n');
      const rewrittenLines = lines.map(line => {
        const clean = line.trim();
        if (!clean || clean.startsWith('#')) return line;

        let fullSegmentUrl;
        if (clean.startsWith("http://") || clean.startsWith("https://")) {
          fullSegmentUrl = clean;
        } else if (clean.startsWith("/")) {
          fullSegmentUrl = `${hostOrigin}${clean}`;
        } else {
          fullSegmentUrl = `${basePath}${clean}`;
        }

        if (queryParams && !fullSegmentUrl.includes("?")) {
          fullSegmentUrl += queryParams;
        }

        return `/api/stream?url=${encodeURIComponent(fullSegmentUrl)}`;
      });

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send(rewrittenLines.join('\n'));
    }

    // جلب تمرير مقاطع الفيديو ومفاتيح التشفير
    const arrayBuffer = await response.arrayBuffer();
    const contentType = targetUrl.includes(".key") ? "application/octet-stream" : "video/MP2T";
    res.setHeader("Content-Type", contentType);
    return res.status(200).send(Buffer.from(arrayBuffer));

  } catch (error) {
    return res.status(500).send(error.message);
  }
}
8
