export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  try {
    const targetUrl = decodeURIComponent(url);
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "okhttp/4.9.0",
        "Referer": "http://def.yacinelive.com/",
        "Origin": "http://def.yacinelive.com"
      }
    });

    const contentType = response.headers.get("content-type") || "";
    
    // إذا كان الطلب لقائمة تشغيل m3u8
    if (targetUrl.includes(".m3u8") || contentType.includes("mpegurl")) {
      let m3u8Text = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

      // إعادة توجيه أجزاء الفيديو عبر نفس البروكسي الداخلي
      m3u8Text = m3u8Text.replace(/^(?!#)(?!\s*$)(.+)$/gm, (match) => {
        const fullSegmentUrl = match.startsWith("http") ? match : baseUrl + match;
        return `/api/stream?url=${encodeURIComponent(fullSegmentUrl)}`;
      });

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send(m3u8Text);
    }

    // إذا كان مقطع فيديو (ts أو pdf مموه)
    const arrayBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType || "video/mp2t");
    return res.status(200).send(Buffer.from(arrayBuffer));

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
