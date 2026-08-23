import zlib from 'zlib';

function decryptYacinePro(cipherBytes) {
  // 1. توليد مصفوفة المفتاح الكاملة 16-بايت المشتقة
  const derivedKey16 = Buffer.from([
    0x63, 0x21, 0x75, 0x5f, // c!u_
    0x3c, 0x70, 0x58, 0x37, // <pX7
    0x19, 0x56, 0x02, 0x41,
    0x6a, 0x4f, 0x34, 0x27
  ]);

  // 2. تجربة فك الشفرة بالمفتاح المشتق
  const out = Buffer.alloc(cipherBytes.length);
  for (let i = 0; i < cipherBytes.length; i++) {
    out[i] = cipherBytes[i] ^ derivedKey16[i % 16];
  }

  let text = out.toString('utf-8');
  let start = text.indexOf('{');
  let end = text.lastIndexOf('}') + 1;

  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.substring(start, end));
    } catch (e) {}
  }

  // 3. محلل التدرج التلقائي (Auto Rolling Matcher)
  const pattern = '{"id":';
  const k = Buffer.alloc(cipherBytes.length);
  for (let i = 0; i < cipherBytes.length; i++) {
    k[i] = cipherBytes[i] ^ (i < pattern.length ? pattern.charCodeAt(i) : 0);
  }

  // تجربة الأطوال الدورية 8, 12, 16, 24, 32
  for (const len of [8, 12, 16, 24, 32]) {
    const subKey = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
      subKey[i] = cipherBytes[i] ^ (i < 6 ? pattern.charCodeAt(i) : 0x20);
    }
    const tempOut = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      tempOut[i] = cipherBytes[i] ^ subKey[i % len];
    }
    const t = tempOut.toString('utf-8');
    if (t.includes('"name"') || t.includes('"url"')) {
      const s = t.indexOf('{');
      const e = t.lastIndexOf('}') + 1;
      try {
        return JSON.parse(t.substring(s, e));
      } catch (err) {}
    }
  }

  return null;
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
    const result = decryptYacinePro(cipherBytes);

    if (result) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        channel_data: result
      });
    }

    // إرجاع أول 60 بايت مفكوكة بالمفتاح 16-بايت لمعاينة النص
    const key16 = Buffer.from([0x63, 0x21, 0x75, 0x5f, 0x3c, 0x70, 0x58, 0x37, 0x19, 0x56, 0x02, 0x41, 0x6a, 0x4f, 0x34, 0x27]);
    const dump = Buffer.alloc(60);
    for (let i = 0; i < 60; i++) {
      dump[i] = cipherBytes[i] ^ key16[i % 16];
    }

    return res.status(200).json({
      status: "inspect_full_key",
      preview: dump.toString('utf-8')
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
