import crypto from 'crypto';
import zlib from 'zlib';

function tryRc4(cipherBytes, key) {
  try {
    const decipher = crypto.createDecipheriv('rc4', Buffer.from(key), '');
    const out = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);
    const text = out.toString('utf-8');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start !== -1 && end !== -1) {
      return JSON.parse(text.substring(start, end));
    }
  } catch (e) {}
  return null;
}

function tryXor(cipherBytes, key) {
  try {
    const kBuf = Buffer.from(key);
    const out = Buffer.alloc(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      out[i] = cipherBytes[i] ^ kBuf[i % kBuf.length];
    }
    const text = out.toString('utf-8');
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

  const API_URL = "http://def.yacinelive.com/api/config/player";

  try {
    const response = await fetch(API_URL, {
      headers: {
        "User-Agent": "okhttp/4.9.0"
      }
    });

    const headerT = response.headers.get("t") || response.headers.get("T") || "1787481279";
    const arrayBuf = await response.arrayBuffer();
    let textPayload;

    try {
      textPayload = zlib.gunzipSync(Buffer.from(arrayBuf)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(arrayBuf).toString('utf-8');
    }

    const cipherBytes = Buffer.from(textPayload.trim(), 'base64');

    // احتمالات المفاتيح المشتقة
    const keyCandidates = [
      headerT,
      crypto.createHash('md5').update(headerT).digest('hex'),
      crypto.createHash('md5').update(headerT).digest(),
      "fik@4!895.21?h*r" + headerT,
      headerT + "fik@4!895.21?h*r",
      crypto.createHash('sha256').update(headerT).digest('hex').substring(0, 16),
      "yacinetv" + headerT,
      "ytvpro" + headerT
    ];

    // 1. فحص عبر RC4
    for (const k of keyCandidates) {
      const resData = tryRc4(cipherBytes, k);
      if (resData) {
        return res.status(200).json({ status: "success", cipher: "rc4", data: resData });
      }
    }

    // 2. فحص عبر XOR
    for (const k of keyCandidates) {
      const resData = tryXor(cipherBytes, k);
      if (resData) {
        return res.status(200).json({ status: "success", cipher: "xor", data: resData });
      }
    }

    // استخراج المفتاح المباشر بافتراض JSON
    const assumedHeader = Buffer.from('{"status":200');
    const dynamicKey = Buffer.alloc(assumedHeader.length);
    for (let i = 0; i < assumedHeader.length; i++) {
      dynamicKey[i] = cipherBytes[i] ^ assumedHeader[i];
    }

    return res.status(200).json({
      status: "inspecting",
      header_T: headerT,
      discovered_key_part: dynamicKey.toString('utf-8')
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
