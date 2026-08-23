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
      const m3u8Text = await response.text();
      const basePath = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

      const modifiedM3u8 = m3u8Text.replace(/^(?!#)(?!\s*$)(.+)$/gm, (line) => {
        const cleanLine = line.trim();
        let fullSegmentUrl;

        if (cleanLine.startsWith("http://") || cleanLine.startsWith("https://")) {
          fullSegmentUrl = cleanLine;
        } else if (cleanLine.startsWith("/")) {
          fullSegmentUrl = `${hostOrigin}${cleanLine}`;
        } else {
          fullSegmentUrl = `${basePath}${cleanLine}`;
        }

        if (queryParams && !fullSegmentUrl.includes("?")) {
          fullSegmentUrl += queryParams;
        }

        return `/api/stream?url=${encodeURIComponent(fullSegmentUrl)}`;
      });

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send(modifiedM3u8);
    }

    // جلب وتحويل مقاطع الفيديو (.js / .ts) إلى تدفق فيديو مباشر
    const arrayBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "video/MP2T");
    res.setHeader("Content-Disposition", "inline");
    return res.status(200).send(Buffer.from(arrayBuffer));

  } catch (error) {
    return res.status(500).send(error.message);
  }
}
