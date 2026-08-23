import crypto from 'crypto';
import zlib from 'zlib';

function exhaustiveAesDecrypt(cipherBytes, headerT) {
  const tStr = String(headerT || "1787484688");
  const knownKeys = [
    "fik@4!895.21?h*r",
    "yacinetvkey12345",
    "1234567890123456",
    "com.ytv.player",
    "yacinetv",
    "9584726194827163"
  ];

  const generatedKeys = [];

  for (const k of knownKeys) {
    generatedKeys.push(Buffer.from(k.padEnd(16, '0').slice(0, 16), 'utf-8'));
    generatedKeys.push(crypto.createHash('md5').update(k).digest());
    generatedKeys.push(crypto.createHash('md5').update(k + tStr).digest());
    generatedKeys.push(crypto.createHash('md5').update(tStr + k).digest());
  }

  generatedKeys.push(crypto.createHash('md5').update(tStr).digest());
  generatedKeys.push(Buffer.from(tStr.padEnd(16, '0').slice(0, 16), 'utf-8'));

  const generatedIVs = [
    Buffer.from("1234567890123456", 'utf-8'),
    Buffer.from("0000000000000000", 'utf-8'),
    Buffer.from(tStr.padEnd(16, '0').slice(0, 16), 'utf-8'),
    crypto.createHash('md5').update(tStr).digest(),
    cipherBytes.subarray(0, 16) // حالة IV مدمج في أول 16 بايت
  ];

  for (const key of generatedKeys) {
    for (const iv of generatedIVs) {
      // 1. تجربة كامل البايتات
      try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(false);
        let dec = decipher.update(cipherBytes);
        dec = Buffer.concat([dec, decipher.final()]);
        const text = dec.toString('utf-8');
        if (text.includes('{') && text.includes('}')) {
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}') + 1;
          const parsed = JSON.parse(text.substring(start, end));
          return parsed;
        }
      } catch (e) {}

      // 2. تجربة تخطي أول 16 بايت في حال كان الـ IV في المقدمة
      try {
        const actualCipher = cipherBytes.subarray(16);
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, cipherBytes.subarray(0, 16));
        decipher.setAutoPadding(false);
        let dec = decipher.update(actualCipher);
        dec = Buffer.concat([dec, decipher.final()]);
        const text = dec.toString('utf-8');
        if (text.includes('{') && text.includes('}')) {
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}') + 1;
          const parsed = JSON.parse(text.substring(start, end));
          return parsed;
        }
      } catch (e) {}
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

    const headerT = response.headers.get("t") || response.headers.get("T") || "1787484688";
    const rawBuffer = await response.arrayBuffer();

    let textPayload;
    try {
      textPayload = zlib.gunzipSync(Buffer.from(rawBuffer)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(rawBuffer).toString('utf-8');
    }

    const cipherBytes = Buffer.from(textPayload.trim(), 'base64');
    const result = exhaustiveAesDecrypt(cipherBytes, headerT);

    if (result) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        data: result
      });
    }

    return res.status(200).json({
      status: "trying_pattern",
      first_32_bytes_hex: cipherBytes.subarray(0, 32).toString('hex'),
      header_t: headerT
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
