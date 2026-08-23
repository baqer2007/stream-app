import crypto from 'crypto';

function decryptYacineAPI(base64Payload, headerT) {
  const cipherBuffer = Buffer.from(base64Payload.replace(/\s+/g, ''), 'base64');
  const tStr = String(headerT || '');

  // 1. مفاتيح AES المعروفة لتطبيقات ياسين تيفي و YTV
  const stringKeys = [
    "fik@4!895.21?h*r",
    "yacinetvkey12345",
    "com.ytv.player",
    "c!u_yacinetv2024",
    "1234567890123456",
    "9584726194827163"
  ];

  const derivedKeys = [];
  for (const sk of stringKeys) {
    derivedKeys.push(Buffer.from(sk.padEnd(16, '0').substring(0, 16), 'utf-8'));
    derivedKeys.push(crypto.createHash('md5').update(sk).digest());
    if (tStr) {
      derivedKeys.push(crypto.createHash('md5').update(sk + tStr).digest());
      derivedKeys.push(crypto.createHash('md5').update(tStr + sk).digest());
    }
  }

  // تجربة فك التشفير عبر AES-128-CBC
  for (const key of derivedKeys) {
    // الحالة أ: IV في أول 16 بايت من البيانات
    if (cipherBuffer.length > 16) {
      try {
        const iv = cipherBuffer.subarray(0, 16);
        const data = cipherBuffer.subarray(16);
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(true);
        let dec = decipher.update(data);
        dec = Buffer.concat([dec, decipher.final()]);
        const text = dec.toString('utf-8');
        return JSON.parse(text);
      } catch {}
    }

    // الحالة ب: IV ثابت (16 أصفار أو 1234567890123456)
    for (const ivStr of ["1234567890123456", "0000000000000000"]) {
      try {
        const iv = Buffer.from(ivStr, 'utf-8');
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(true);
        let dec = decipher.update(cipherBuffer);
        dec = Buffer.concat([dec, decipher.final()]);
        const text = dec.toString('utf-8');
        return JSON.parse(text);
      } catch {}
    }
  }

  // 2. تجربة تدفق الـ XOR التكراري الشامل للأطوال حتى 64 بايت
  for (let kLen = 1; kLen <= 64; kLen++) {
    const key = Buffer.alloc(kLen);
    const prefix = '{"id":';
    for (let i = 0; i < Math.min(kLen, prefix.length); i++) {
      key[i] = cipherBuffer[i] ^ prefix.charCodeAt(i);
    }
    const out = Buffer.alloc(cipherBuffer.length);
    for (let i = 0; i < cipherBuffer.length; i++) {
      out[i] = cipherBuffer[i] ^ key[i % kLen];
    }
    const text = out.toString('utf-8');
    if (text.includes('"name"') || text.includes('http')) {
      const s = text.indexOf('{');
      const e = text.lastIndexOf('}') + 1;
      if (s !== -1 && e > s) {
        try {
          return JSON.parse(text.substring(s, e));
        } catch {}
      }
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
        "Connection": "Keep-Alive"
      }
    });

    const headerT = response.headers.get("t") || response.headers.get("T") || "";
    const rawText = await response.text();

    const result = decryptYacineAPI(rawText, headerT);

    if (result) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        header_t: headerT,
        data: result
      });
    }

    return res.status(200).json({
      status: "raw_captured",
      header_t: headerT,
      response_snippet: rawText.substring(0, 100)
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
