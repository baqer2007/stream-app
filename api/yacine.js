import zlib from 'zlib';

function autoSolveYacineStream(cipherBuffer) {
  // تجربة فك الشفرة بالاستنتاج التلقائي لهيكل كائنات JSON
  const targetPrefixes = [
    '{"id":',
    '{"status":',
    '{"name":',
    '{"channel":',
    '{"success":',
    '{"data":'
  ];

  for (const prefix of targetPrefixes) {
    const key = Buffer.alloc(prefix.length);
    for (let i = 0; i < prefix.length; i++) {
      key[i] = cipherBuffer[i] ^ prefix.charCodeAt(i);
    }

    // تجربة أطوال مفاتيح دورية مختلفة (من طول المفتاح المكتشف حتى 32)
    for (let kLen = 4; kLen <= key.length; kLen++) {
      const subKey = key.subarray(0, kLen);
      const out = Buffer.alloc(cipherBuffer.length);
      for (let j = 0; j < cipherBuffer.length; j++) {
        out[j] = cipherBuffer[j] ^ subKey[j % subKey.length];
      }

      const text = out.toString('utf-8');
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;

      if (start !== -1 && end !== -1 && end > start) {
        try {
          const json = JSON.parse(text.substring(start, end));
          return { success: true, data: json };
        } catch (e) {}
      }
    }
  }

  // تجربة فك الشفرة التسلسلي الخطي (Linear feedback stream)
  for (let seed = 0; seed < 256; seed++) {
    const out = Buffer.alloc(cipherBuffer.length);
    let k = seed;
    for (let i = 0; i < cipherBuffer.length; i++) {
      out[i] = cipherBuffer[i] ^ k;
      k = (k + 1) % 256;
    }
    const text = out.toString('utf-8');
    if (text.includes('"id"') || text.includes('"name"') || text.includes('http')) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      try {
        const json = JSON.parse(text.substring(start, end));
        return { success: true, data: json };
      } catch (e) {}
    }
  }

  return { success: false };
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
    const result = autoSolveYacineStream(cipherBytes);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        header_t: headerT,
        channel_data: result.data
      });
    }

    // إرجاع أول 50 حرف مفكوك جزئياً لمعرفة الكلمة المفتاحية فوراً
    const probe = Buffer.alloc(40);
    const keyBase = Buffer.from("c!u_");
    for (let i = 0; i < 40; i++) {
      probe[i] = cipherBytes[i] ^ keyBase[i % keyBase.length];
    }

    return res.status(200).json({
      status: "decoded_sample",
      text_sample: probe.toString('utf-8')
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
