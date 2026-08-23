import crypto from 'crypto';
import zlib from 'zlib';

function decryptYacineEngine(cipherBytes, headerT) {
  const tVal = String(headerT || "1787485293");
  const baseAppKey = "fik@4!895.21?h*r";

  // توليد قائمة المفاتيح المشتقة المعتمدة في تطبيق YTV
  const keyList = [
    Buffer.from(baseAppKey, 'utf-8'),
    crypto.createHash('md5').update(baseAppKey).digest(),
    crypto.createHash('md5').update(tVal).digest(),
    crypto.createHash('md5').update(baseAppKey + tVal).digest(),
    crypto.createHash('md5').update(tVal + baseAppKey).digest(),
    crypto.createHash('sha256').update(baseAppKey).digest().subarray(0, 16),
    crypto.createHash('sha256').update(baseAppKey + tVal).digest().subarray(0, 16)
  ];

  const ivList = [
    Buffer.from("1234567890123456", 'utf-8'),
    Buffer.from("0000000000000000", 'utf-8'),
    Buffer.from(baseAppKey.substring(0, 16), 'utf-8'),
    crypto.createHash('md5').update(tVal).digest(),
    cipherBytes.subarray(0, 16)
  ];

  // 1. تجربة AES-CBC و AES-ECB
  for (const k of keyList) {
    // تجربة ECB
    try {
      const decipher = crypto.createDecipheriv('aes-128-ecb', k, null);
      decipher.setAutoPadding(false);
      let dec = decipher.update(cipherBytes);
      dec = Buffer.concat([dec, decipher.final()]);
      
      let text;
      try {
        text = zlib.inflateSync(dec).toString('utf-8');
      } catch {
        text = dec.toString('utf-8');
      }

      if (text.includes('"id"') && (text.includes('"url"') || text.includes('http') || text.includes('"name"'))) {
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}') + 1;
        return { success: true, method: 'aes-128-ecb', data: JSON.parse(text.substring(s, e)) };
      }
    } catch {}

    // تجربة CBC
    for (const iv of ivList) {
      try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', k, iv);
        decipher.setAutoPadding(false);
        let dec = decipher.update(cipherBytes);
        dec = Buffer.concat([dec, decipher.final()]);

        let text;
        try {
          text = zlib.inflateSync(dec).toString('utf-8');
        } catch {
          text = dec.toString('utf-8');
        }

        if (text.includes('"id"') && (text.includes('"url"') || text.includes('http') || text.includes('"name"'))) {
          const s = text.indexOf('{');
          const e = text.lastIndexOf('}') + 1;
          return { success: true, method: 'aes-128-cbc', data: JSON.parse(text.substring(s, e)) };
        }
      } catch {}
    }
  }

  // 2. تجربة RC4 Dynamic Hash Key
  for (const k of keyList) {
    const s = [];
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + k[i % k.length]) % 256;
      [s[i], s[j]] = [s[j], s[i]];
    }
    let i = 0;
    j = 0;
    const dec = Buffer.alloc(cipherBytes.length);
    for (let idx = 0; idx < cipherBytes.length; idx++) {
      i = (i + 1) % 256;
      j = (j + s[i]) % 256;
      [s[i], s[j]] = [s[j], s[i]];
      dec[idx] = cipherBytes[idx] ^ s[(s[i] + s[j]) % 256];
    }

    const text = dec.toString('utf-8');
    if (text.includes('"id"') && (text.includes('"url"') || text.includes('http') || text.includes('"name"'))) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      return { success: true, method: 'rc4_dynamic', data: JSON.parse(text.substring(start, end)) };
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
    } catch {
      textPayload = Buffer.from(rawBuffer).toString('utf-8');
    }

    const cipherBytes = Buffer.from(textPayload.trim(), 'base64');
    const result = decryptYacineEngine(cipherBytes, headerT);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        header_t: headerT,
        method: result.method,
        data: result.data
      });
    }

    return res.status(200).json({
      status: "trying_combinations",
      header_t: headerT,
      payload_size: cipherBytes.length
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
