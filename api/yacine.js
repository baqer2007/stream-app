import zlib from 'zlib';

function fullAutoSolve(cipherBytes) {
  // قائمة المفاتيح الكاملة والتوافيق لتطبيق ياسين تيفي
  const baseKeys = [
    "fik@4!895.21?h*r",
    "c!u_yacinetv2024",
    "c!u_player_key12",
    "yacinetvkey12345",
    "com.ytv.player",
    "1234567890123456"
  ];

  // 1. تجربة المفاتيح الكاملة
  for (const kStr of baseKeys) {
    const kBuf = Buffer.from(kStr, 'utf-8');
    const out = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      out[i] = cipherBytes[i] ^ kBuf[i % kBuf.length];
    }
    const text = out.toString('utf-8');
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(text.substring(start, end));
      }
    } catch (e) {}
  }

  // 2. البحث عن المفتاح بالتحليل الترددي المباشر للأطوال من 4 إلى 32
  for (let kLen = 4; kLen <= 32; kLen++) {
    const derivedKey = Buffer.alloc(kLen);
    const prefix = '{"id":44,"name":';
    
    for (let i = 0; i < Math.min(kLen, prefix.length); i++) {
      derivedKey[i] = cipherBytes[i] ^ prefix.charCodeAt(i);
    }
    
    // إكمال المفتاح إن كان الطول أكبر
    for (let i = prefix.length; i < kLen; i++) {
      derivedKey[i] = derivedKey[i % prefix.length];
    }

    const out = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      out[i] = cipherBytes[i] ^ derivedKey[i % kLen];
    }

    const text = out.toString('utf-8');
    if (text.includes('http') || text.includes('m3u8')) {
      try {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}') + 1;
        return JSON.parse(text.substring(start, end));
      } catch (e) {}
    }
  }

  // 3. فك التشفير عبر XOR متعدد التدرج المستنتج من أول 8 بايتات
  const key8 = Buffer.from([0x63, 0x21, 0x75, 0x5f, 0x66, 0x69, 0x6b, 0x40]); // c!u_fik@
  const out8 = Buffer.alloc(cipherBytes.length);
  for (let i = 0; i < cipherBytes.length; i++) {
    out8[i] = cipherBytes[i] ^ key8[i % key8.length];
  }
  try {
    const text = out8.toString('utf-8');
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
    const result = fullAutoSolve(cipherBytes);

    if (result) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        channel_data: result
      });
    }

    // إرجاع أول 80 حرف من النص المفكوك بالمفتاح المستنتج لتأكيد هيكل الـ JSON
    const testKey = Buffer.from([0x63, 0x21, 0x75, 0x5f]);
    const dump = Buffer.alloc(80);
    for (let i = 0; i < 80; i++) {
      dump[i] = cipherBytes[i] ^ testKey[i % testKey.length];
    }

    return res.status(200).json({
      status: "inspect_stream",
      preview_text: dump.toString('utf-8')
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
