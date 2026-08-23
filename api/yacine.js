import zlib from 'zlib';

function fullAutoDecrypt(cipherBuffer, headerT) {
  const tStr = String(headerT || "1787477198");
  const keysToTest = [
    tStr,
    "fik@4!895.21?h*r" + tStr,
    tStr + "fik@4!895.21?h*r",
    "yacine" + tStr,
    "2024" + tStr
  ];

  // تجربة المفتاح المستنتج من أول بايتات
  const xorFirst = cipherBuffer[0] ^ 0x7B; // 0x7B هو كود البداية '{'
  const autoKey = Buffer.alloc(1, xorFirst);

  const testList = [autoKey.toString('utf-8'), ...keysToTest];

  for (const k of testList) {
    try {
      const kBuf = Buffer.from(k, 'utf-8');
      const out = Buffer.alloc(cipherBuffer.length);
      for (let i = 0; i < cipherBuffer.length; i++) {
        out[i] = cipherBuffer[i] ^ kBuf[i % kBuf.length];
      }
      const text = out.toString('utf-8');
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start !== -1 && end !== -1) {
        return JSON.parse(text.substring(start, end));
      }
    } catch (e) {}
  }
  return null;
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

    const headerT = response.headers.get("T");
    const arrayBuf = await response.arrayBuffer();
    let textPayload;

    try {
      textPayload = zlib.gunzipSync(Buffer.from(arrayBuf)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(arrayBuf).toString('utf-8');
    }

    const rawCipherBytes = Buffer.from(textPayload.trim(), 'base64');
    const result = fullAutoDecrypt(rawCipherBytes, headerT);

    if (result) {
      return res.status(200).json({
        status: "success",
        data: result
      });
    }

    // إرجاع أول 20 بايت بعد فك XOR البسيط لتحديد النمط
    const probe = Buffer.alloc(30);
    for (let i = 0; i < 30; i++) {
      probe[i] = rawCipherBytes[i] ^ 0x63; // تجربة مفتاح الإزاحة 0x63
    }

    return res.status(200).json({
      status: "probe",
      sample_text: probe.toString('utf-8')
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
