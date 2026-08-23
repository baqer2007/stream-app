import zlib from 'zlib';

const KNOWN_KEYS = [
  "fik@4!895.21?h*r",
  "yacinetvkey12345",
  "yacinetv",
  "1234567890123456",
  "com.ytv.player"
];

function tryBruteDecode(rawBytes) {
  // تجربة تخطي بايتات الرأس (من 0 إلى 16 بايت) مع جميع المفاتيح
  for (let offset = 0; offset <= 16; offset++) {
    const slice = rawBytes.subarray(offset);
    
    for (const keyStr of KNOWN_KEYS) {
      const key = Buffer.from(keyStr, 'utf-8');
      const out = Buffer.alloc(slice.length);
      
      for (let i = 0; i < slice.length; i++) {
        out[i] = slice[i] ^ key[i % key.length];
      }

      const text = out.toString('utf-8');
      if (text.includes('{') && text.includes('}')) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}') + 1;
        try {
          const parsed = JSON.parse(text.substring(start, end));
          return { success: true, offset, key: keyStr, data: parsed };
        } catch (e) {}
      }
    }
  }

  // تجربة البحث التلقائي عن مفتاح دوري (Rolling XOR Key Search)
  for (let offset = 0; offset < 8; offset++) {
    const slice = rawBytes.subarray(offset);
    // بافتراض البداية {"
    const k0 = slice[0] ^ 0x7B;
    const k1 = slice[1] ^ 0x22;
    
    const testKey = Buffer.from([k0, k1]);
    const out = Buffer.alloc(slice.length);
    for (let i = 0; i < slice.length; i++) {
      out[i] = slice[i] ^ testKey[i % testKey.length];
    }
    const text = out.toString('utf-8');
    if (text.includes('{') && text.includes('}')) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      try {
        const parsed = JSON.parse(text.substring(start, end));
        return { success: true, offset, key: testKey.toString('hex'), data: parsed };
      } catch (e) {}
    }
  }

  return { success: false };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const API_URL = "http://def.yacinelive.com/api/config/player";

  try {
    const response = await fetch(API_URL, {
      headers: {
        "User-Agent": "okhttp/4.9.0"
      }
    });

    const arrayBuf = await response.arrayBuffer();
    let textPayload;
    try {
      textPayload = zlib.gunzipSync(Buffer.from(arrayBuf)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(arrayBuf).toString('utf-8');
    }

    const rawCipherBytes = Buffer.from(textPayload.trim(), 'base64');
    const result = tryBruteDecode(rawCipherBytes);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        matched_offset: result.offset,
        matched_key: result.key,
        data: result.data
      });
    }

    return res.status(500).json({
      status: "error",
      message: "لم يتمكن من فك التشفير تلقائياً"
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
