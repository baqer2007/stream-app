import zlib from 'zlib';

function solveAndDecrypt(cipherBytes) {
  // المفاتيح المحتملة استناداً إلى بايتات البداية
  const knownPrefixes = [
    '{"status":',
    '{"channels":',
    '{"data":',
    '{"categories":',
    '{"live":'
  ];

  for (const prefix of knownPrefixes) {
    const keyLen = 16;
    const derivedKey = Buffer.alloc(Math.min(keyLen, prefix.length));
    
    for (let i = 0; i < derivedKey.length; i++) {
      derivedKey[i] = cipherBytes[i] ^ prefix.charCodeAt(i);
    }

    // تجربة فك النص بالمفتاح المستنتج
    const out = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      out[i] = cipherBytes[i] ^ derivedKey[i % derivedKey.length];
    }

    const text = out.toString('utf-8');
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start !== -1 && end !== -1) {
        const json = JSON.parse(text.substring(start, end));
        return { success: true, data: json };
      }
    } catch (e) {}
  }

  // محاولة الفك بمفتاح ثابت متعدد البايتات
  const customKey = Buffer.from([0x63, 0x21, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74]);
  const out2 = Buffer.alloc(cipherBytes.length);
  for (let i = 0; i < cipherBytes.length; i++) {
    out2[i] = cipherBytes[i] ^ customKey[i % customKey.length];
  }
  
  try {
    const text2 = out2.toString('utf-8');
    const start2 = text2.indexOf('{');
    const end2 = text2.lastIndexOf('}') + 1;
    if (start2 !== -1 && end2 !== -1) {
      return { success: true, data: JSON.parse(text2.substring(start2, end2)) };
    }
  } catch (e) {}

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
    const result = solveAndDecrypt(rawCipherBytes);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        data: result.data
      });
    }

    // إرجاع أول 64 بايت لتحليل المفتاح بدقة إن لزم
    const hexDump = rawCipherBytes.subarray(0, 32).toString('hex');
    return res.status(200).json({
      status: "key_extracting",
      header_hex: hexDump
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
