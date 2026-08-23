import zlib from 'zlib';

function solveExactYacineJSON(cipherBytes) {
  // المفتاح القياسي المستنتج 8 بايت
  const knownPrefix = '{"id":44,"name":';
  const derivedKey = Buffer.alloc(knownPrefix.length);

  for (let i = 0; i < knownPrefix.length; i++) {
    derivedKey[i] = cipherBytes[i] ^ knownPrefix.charCodeAt(i);
  }

  // تجربة فك الشفرة بأطوال دورية للمفتاح المشتق
  const keyLengths = [8, 12, 16, 24, 32, derivedKey.length];

  for (const kLen of keyLengths) {
    const k = derivedKey.subarray(0, kLen);
    const out = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      out[i] = cipherBytes[i] ^ k[i % kLen];
    }

    const text = out.toString('utf-8');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;

    if (start !== -1 && end > start) {
      try {
        const json = JSON.parse(text.substring(start, end));
        return { success: true, json };
      } catch (e) {}
    }
  }

  // تجربة البحث التبادلي الشامل لجميع توافيق 8 بايت المحيطة
  const base8 = Buffer.from([0x63, 0x21, 0x75, 0x5f, 0x3c, 0x70, 0x58, 0x37]);
  for (let delta = -16; delta <= 16; delta++) {
    const testK = Buffer.alloc(8);
    for (let i = 0; i < 8; i++) testK[i] = (base8[i] + delta) & 0xFF;

    const out = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      out[i] = cipherBytes[i] ^ testK[i % 8];
    }

    const text = out.toString('utf-8');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start !== -1 && end > start) {
      try {
        const json = JSON.parse(text.substring(start, end));
        return { success: true, json };
      } catch (e) {}
    }
  }

  // استخراج النص الأقرب في حال وجود شوائب طفيفة
  const out = Buffer.alloc(cipherBytes.length);
  for (let i = 0; i < cipherBytes.length; i++) {
    out[i] = cipherBytes[i] ^ derivedKey[i % derivedKey.length];
  }

  return { success: false, rawText: out.toString('utf-8') };
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

    const rawBuffer = await response.arrayBuffer();
    let textPayload;
    try {
      textPayload = zlib.gunzipSync(Buffer.from(rawBuffer)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(rawBuffer).toString('utf-8');
    }

    const cipherBytes = Buffer.from(textPayload.trim(), 'base64');
    const result = solveExactYacineJSON(cipherBytes);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        data: result.json
      });
    }

    return res.status(200).json({
      status: "almost_there",
      decoded_text: result.rawText.substring(0, 150)
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
