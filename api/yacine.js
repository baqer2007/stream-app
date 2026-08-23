import zlib from 'zlib';
import crypto from 'crypto';

// 1. خوارزمية RC4 القياسية
function rc4Decrypt(key, cipherBytes) {
  const s = [];
  for (let i = 0; i < 256; i++) s[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }

  let i = 0;
  j = 0;
  const out = Buffer.alloc(cipherBytes.length);

  for (let k = 0; k < cipherBytes.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    const t = (s[i] + s[j]) % 256;
    out[k] = cipherBytes[k] ^ s[t];
  }

  return out;
}

// 2. خوارزمية فك التشفير التراكمي الشاملة لتطبيق ياسين تيفي
function solveYacineRC4AndRolling(cipherBytes, headerT) {
  const tStr = String(headerT || "1787484688");
  
  const keyCandidates = [
    Buffer.from("fik@4!895.21?h*r"),
    Buffer.from("yacinetvkey12345"),
    Buffer.from("c!u_fik@4!895.21"),
    Buffer.from(tStr),
    Buffer.from("1234567890123456"),
    crypto.createHash('md5').update("fik@4!895.21?h*r").digest(),
    crypto.createHash('md5').update("fik@4!895.21?h*r" + tStr).digest(),
    crypto.createHash('md5').update(tStr).digest()
  ];

  // أ. تجربة خوارزمية RC4 مع كافة المفاتيح
  for (const k of keyCandidates) {
    const dec = rc4Decrypt(k, cipherBytes);
    const text = dec.toString('utf-8');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start !== -1 && end > start) {
      try {
        return { success: true, method: 'rc4', data: JSON.parse(text.substring(start, end)) };
      } catch (e) {}
    }
  }

  // ب. تجربة توليد تدفق المفتاح عبر Linear Feedback Shift (LFSR)
  for (let step = 1; step <= 255; step++) {
    const out = Buffer.alloc(cipherBytes.length);
    let currentKey = 0x63; // البايت الأول المؤكد
    for (let i = 0; i < cipherBytes.length; i++) {
      out[i] = cipherBytes[i] ^ currentKey;
      currentKey = (currentKey + step) & 0xFF;
    }
    const text = out.toString('utf-8');
    if (text.includes('"id"') && (text.includes('"url"') || text.includes('http'))) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      try {
        return { success: true, method: 'lfsr', data: JSON.parse(text.substring(start, end)) };
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
    const result = solveYacineRC4AndRolling(cipherBytes, headerT);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        header_t: headerT,
        method: result.method,
        data: result.data
      });
    }

    // تجربة الـ RC4 الأولى وعرض العينة
    const testDec = rc4Decrypt(Buffer.from("fik@4!895.21?h*r"), cipherBytes);
    return res.status(200).json({
      status: "trying_rc4",
      header_t: headerT,
      rc4_sample: testDec.subarray(0, 80).toString('utf-8')
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
