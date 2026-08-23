import crypto from 'crypto';
import zlib from 'zlib';

// دالة فك تشفير بيانات ياسين تيفي
function decryptYacinePayload(base64Payload, headerT) {
  const cipherBytes = Buffer.from(base64Payload.trim(), 'base64');
  
  // المفاتيح الأساسية لمشغل YTV / ياسين تيفي
  const baseKey = "fik@4!895.21?h*r";
  const tStr = String(headerT || "1787484478");

  // اشتقاق مفاتيح التشفير المحتملة
  const attempts = [
    {
      key: Buffer.from(baseKey, 'utf-8'),
      iv: Buffer.from("1234567890123456", 'utf-8')
    },
    {
      key: crypto.createHash('md5').update(baseKey + tStr).digest(),
      iv: Buffer.from("1234567890123456", 'utf-8')
    },
    {
      key: crypto.createHash('md5').update(tStr).digest(),
      iv: crypto.createHash('md5').update(baseKey).digest()
    }
  ];

  for (const { key, iv } of attempts) {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      decipher.setAutoPadding(true);
      let dec = decipher.update(cipherBytes);
      dec = Buffer.concat([dec, decipher.final()]);
      const jsonStr = dec.toString('utf-8');
      return JSON.parse(jsonStr);
    } catch (e) {
      try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(false);
        let dec = decipher.update(cipherBytes);
        dec = Buffer.concat([dec, decipher.final()]);
        const text = dec.toString('utf-8').replace(/[\x00-\x1F\x7F]/g, '').trim();
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}') + 1;
        if (start !== -1 && end !== -1) {
          return JSON.parse(text.substring(start, end));
        }
      } catch (err) {}
    }
  }

  // محاولة XOR ديناميكية
  try {
    const xorKey = Buffer.from(baseKey + tStr);
    const out = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      out[i] = cipherBytes[i] ^ xorKey[i % xorKey.length];
    }
    const text = out.toString('utf-8');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start !== -1 && end !== -1) {
      return JSON.parse(text.substring(start, end));
    }
  } catch (e) {}

  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const channelId = req.query.id || "44"; // القناة الافتراضية beIN 1
  const API_URL = `http://def.yacinelive.com/api/channel/${channelId}`;

  try {
    const response = await fetch(API_URL, {
      headers: {
        "User-Agent": "okhttp/4.9.0",
        "Accept-Encoding": "gzip",
        "Connection": "Keep-Alive"
      }
    });

    const headerT = response.headers.get("t") || response.headers.get("T") || "1787484478";
    const rawBuffer = await response.arrayBuffer();
    
    let textPayload;
    try {
      textPayload = zlib.gunzipSync(Buffer.from(rawBuffer)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(rawBuffer).toString('utf-8');
    }

    const decrypted = decryptYacinePayload(textPayload, headerT);

    if (decrypted) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        data: decrypted
      });
    }

    return res.status(200).json({
      status: "extracted_raw",
      header_t: headerT,
      payload_length: textPayload.length
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
