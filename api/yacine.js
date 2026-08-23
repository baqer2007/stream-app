import crypto from 'crypto';

function decryptYacineStandard(base64Data, headerT) {
  const cipherBytes = Buffer.from(base64Data.trim(), 'base64');
  const tStr = String(headerT || '').trim();

  // الكلمات المفتاحية الرئيسية في تطبيق YTV / ياسين تيفي
  const masterSecrets = [
    "fik@4!895.21?h*r",
    "yacinetv#2024",
    "com.ytv.player",
    "yacinetvkey12345",
    "9584726194827163"
  ];

  const keys = [];
  for (const s of masterSecrets) {
    keys.push(crypto.createHash('md5').update(s).digest());
    keys.push(Buffer.from(s.padEnd(16, '0').substring(0, 16), 'utf-8'));
    if (tStr) {
      keys.push(crypto.createHash('md5').update(s + tStr).digest());
      keys.push(crypto.createHash('md5').update(tStr + s).digest());
    }
  }

  // IVs المحتملة
  const ivs = [
    Buffer.from("1234567890123456", 'utf-8'),
    Buffer.from("0000000000000000", 'utf-8'),
    cipherBytes.subarray(0, 16)
  ];

  // 1. فحص AES-128-CBC
  for (const key of keys) {
    for (const iv of ivs) {
      const dataToDecrypt = (iv === cipherBytes.subarray(0, 16)) ? cipherBytes.subarray(16) : cipherBytes;
      
      for (const autoPad of [true, false]) {
        try {
          const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
          decipher.setAutoPadding(autoPad);
          let dec = decipher.update(dataToDecrypt);
          dec = Buffer.concat([dec, decipher.final()]);
          const text = dec.toString('utf-8');

          if (text.includes('{') && text.includes('}')) {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}') + 1;
            const parsed = JSON.parse(text.substring(start, end));
            return { success: true, method: 'AES-CBC', data: parsed };
          }
        } catch {}
      }
    }
  }

  // 2. فحص XOR Block Stream (إذا كان التشفير مصفوفة مقطعية)
  // تكرار البايتات المشتقة السليمة
  const verifiedKey = Buffer.from([0x63, 0x21, 0x75, 0x5f, 0x3c, 0x70, 0x58, 0x37]);
  const out = Buffer.alloc(cipherBytes.length);
  for (let i = 0; i < cipherBytes.length; i++) {
    out[i] = cipherBytes[i] ^ verifiedKey[i % 8];
  }
  const textXor = out.toString('utf-8');
  if (textXor.includes('"id"') && textXor.includes('"name"')) {
    try {
      const start = textXor.indexOf('{');
      const end = textXor.lastIndexOf('}') + 1;
      return { success: true, method: 'XOR-8', data: JSON.parse(textXor.substring(start, end)) };
    } catch {}
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
        "Connection": "Keep-Alive"
      }
    });

    const headerT = response.headers.get("t") || response.headers.get("T") || "";
    const rawText = await response.text();

    const result = decryptYacineStandard(rawText, headerT);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        header_t: headerT,
        encryption_method: result.method,
        channel_info: result.data
      });
    }

    return res.status(200).json({
      status: "trying_aes_keys",
      header_t: headerT,
      data_length: rawText.length
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
