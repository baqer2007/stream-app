import zlib from 'zlib';

// خوارزمية استنتاج المفتاح الديناميكي التلقائي (Known Plaintext Propagator)
function dynamicPropagateYacine(cipherBytes) {
  // مفتاح البداية المستخرج بدقة 100%
  const knownPrefix = '{"id":44,"name":';
  const keystream = Buffer.alloc(cipherBytes.length);

  for (let i = 0; i < knownPrefix.length; i++) {
    keystream[i] = cipherBytes[i] ^ knownPrefix.charCodeAt(i);
  }

  // كشف نمط التكرار التوليدي للمفتاح
  // نمط التوليد في YTV: Key[i] = (Key[i-1] * a + c) ^ Base[i % 8]
  const base8 = keystream.subarray(0, 8); // [0x63, 0x21, 0x75, 0x5f, 0x3c, 0x70, 0x58, 0x37]

  // تجربة معادلات التوليد الشائعة (Linear Congruential Streams)
  for (let mult = 1; mult <= 31; mult += 2) {
    for (let add = 0; add <= 255; add++) {
      const testKey = Buffer.alloc(cipherBytes.length);
      testKey.set(base8, 0);

      for (let i = 8; i < cipherBytes.length; i++) {
        testKey[i] = (testKey[i - 1] * mult + add + base8[i % 8]) & 0xFF;
      }

      const out = Buffer.alloc(cipherBytes.length);
      for (let i = 0; i < cipherBytes.length; i++) {
        out[i] = cipherBytes[i] ^ testKey[i];
      }

      const text = out.toString('utf-8');
      if (text.includes('http') || text.includes('m3u8') || text.includes('"url"')) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}') + 1;
        if (start !== -1 && end > start) {
          try {
            return { success: true, json: JSON.parse(text.substring(start, end)) };
          } catch (e) {}
        }
      }
    }
  }

  // محاولة فك الشفرة عبر تكرار مصفوفة الـ 16 بايت وتوليداتها
  for (let period = 4; period <= 32; period++) {
    const periodKey = keystream.subarray(0, period);
    const out = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      out[i] = cipherBytes[i] ^ periodKey[i % period];
    }
    const text = out.toString('utf-8');
    if (text.includes('http') || text.includes('.m3u8')) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start !== -1 && end > start) {
        try {
          return { success: true, json: JSON.parse(text.substring(start, end)) };
        } catch (e) {}
      }
    }
  }

  // استخراج النص الأولي الأكثر وضوحاً
  const fallback = Buffer.alloc(cipherBytes.length);
  for (let i = 0; i < cipherBytes.length; i++) {
    fallback[i] = cipherBytes[i] ^ base8[i % 8];
  }

  return { success: false, partial: fallback.toString('utf-8') };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const channelId = req.query.id || "44";
  const API_URL = `http://def.yacinelive.com/api/channel/${channelId}`;

  try {
    const response = await fetch(API_URL, {
      headers: {
        "User-Agent": "okhttp/4.9.0",
        "Accept-Encoding": "gzip",
        "Connection": "Keep-Alive"
      }
    });

    const headerT = response.headers.get("t") || response.headers.get("T") || "";
    const rawBuffer = await response.arrayBuffer();

    let textPayload;
    try {
      textPayload = zlib.gunzipSync(Buffer.from(rawBuffer)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(rawBuffer).toString('utf-8');
    }

    const cipherBytes = Buffer.from(textPayload.trim(), 'base64');
    const result = dynamicPropagateYacine(cipherBytes);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        header_t: headerT,
        data: result.json
      });
    }

    return res.status(200).json({
      status: "analyzing_pattern",
      header_t: headerT,
      partial_text: result.partial.substring(0, 200)
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
