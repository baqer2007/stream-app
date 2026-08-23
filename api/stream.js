export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const rawTarget = req.query.url;
  const customReferer = req.query.ref || "https://x.com/";

  if (!rawTarget) {
    return res.status(400).send("Target URL is required");
  }

  const targetUrl = decodeURIComponent(rawTarget);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      headers: {
        "Referer": customReferer,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    });

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).send("Upstream stream error");
    }

    const contentType = upstreamResponse.headers.get("content-type") || "";

    if (targetUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("application/x-mpegurl")) {
      const playlistText = await upstreamResponse.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

      const rewritten = playlistText.split("\n").map(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const fullSegmentUrl = trimmed.startsWith("http") ? trimmed : baseUrl + trimmed;
          return `/api/stream?ref=${encodeURIComponent(customReferer)}&url=${encodeURIComponent(fullSegmentUrl)}`;
        }
        return line;
      }).join("\n");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send(rewritten);
    }

    const buffer = await upstreamResponse.arrayBuffer();
    res.setHeader("Content-Type", contentType || "video/MP2T");
    return res.status(200).send(Buffer.from(buffer));

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
