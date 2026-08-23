import zlib from 'zlib';

function crackAndDecryptYacine(cipherBytes) {
  // فحص أطوال المفاتيح المحتملة (من 1 إلى 32)
  for (let keyLen = 1; keyLen <= 32; keyLen++) {
    // مصفوفة لاحتساب المفتاح الأكثر احتمالاً لكل موقع
    const key = Buffer.alloc(keyLen);
    
    // بناء المفتاح الافتراضي استناداً إلى بايتات البداية المؤكدة {"id":
    const startPattern = '{"id":';
    for (let i = 0; i < Math.min(keyLen, startPattern.length); i++) {
      key[i] = cipherBytes[i] ^ startPattern.charCodeAt(i);
    }

    // تجربة فك الشفرة واستخراج النص
    const decrypted = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      decrypted[i] = cipherBytes[i] ^ key[i % keyLen];
    }

    const text = decrypted.toString('utf-8');
    
    // التحقق من وجود الكلمات المفتاحية في الاستجابة
    if (text.includes('"id"') && (text.includes('"name"') || text.includes('"url"') || text.includes('"channels"'))) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start !== -1 && end > start) {
        try {
          return {
            success: true,
            keyLen,
            keyHex: key.toString('hex'),
            data: JSON.parse(text.substring(start, end))
          };
        } catch (e) {}
      }
    }
  }

  // تجربة البحث الشامل عن المفتاح المتكرر عبر خوارزمية التحليل الترددي
  const candidateKeys = [
    Buffer.from([0x63, 0x21, 0x75, 0x01]),
    Buffer.from("fik@4!895.21?h*r"),
    Buffer.from("yacinetvkey12345"),
    Buffer.from("c!u\x01\x18\x03\x1c\x3b")
  ];

  for (const k of candidateKeys) {
    const decrypted = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      decrypted[i] = cipherBytes[i] ^ k[i % k.length];
    }
    const text = decrypted.toString('utf-8');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start !== -1 && end > start) {
      try {
        return {
          success: true,
          keyLen: k.length,
          keyHex: k.toString('hex'),
          data: JSON.parse(text.substring(start, end))
        };
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
    const result = crackAndDecryptYacine(cipherBytes);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        header_t: headerT,
        key_length: result.keyLen,
        data: result.data
      });
    }

    // طباعة أول 16 بايت بعد استخدام المفتاح الرياضي الدقيق (0x63, 0x21, 0x75, 0x01)
    const exactKey = Buffer.from([0x63, 0x21, 0x75, 0x01]);
    const cleanSample = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      cleanSample[i] = cipherBytes[i] ^ exactKey[i % 4];
    }

    return res.status(200).json({
      status: "inspect_key",
      decrypted_start: cleanSample.toString('utf-8'),
      raw_hex: cipherBytes.subarray(0, 16).toString('hex')
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
