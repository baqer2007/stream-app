import crypto from 'crypto';
import zlib from 'zlib';

function tryAesDecrypt(cipherBytes, keyBuffer, ivBuffer) {
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuffer, ivBuffer);
    decipher.setAutoPadding(true);
    let dec = decipher.update(cipherBytes);
    dec = Buffer.concat([dec, decipher.final()]);
    return JSON.parse(dec.toString('utf-8'));
  } catch (e) {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuffer, ivBuffer);
      decipher.setAutoPadding(false);
      let dec = decipher.update(cipherBytes);
      dec = Buffer.concat([dec, decipher.final()]);
      const text = dec.toString('utf-8').replace(/[\x00-\x1F\x7F]/g, '').trim();
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start !== -1 && end !== -1) {
        return JSON.parse(text.substring(start, end));
      }
    } catch (err) {}
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

    const headerT = response.headers.get("t") || response.headers.get("T") || "1787477198";
    const arrayBuf = await response.arrayBuffer();
    let textPayload;

    try {
      textPayload = zlib.gunzipSync(Buffer.from(arrayBuf)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(arrayBuf).toString('utf-8');
    }

    const cipherBytes = Buffer.from(textPayload.trim(), 'base64');

    // قائمة التجارب لتوليد مفاتيح الـ AES من T والمفاتيح الثابتة
    const candidates = [
      // 1. المفتاح الافتراضي مع IV مشتق من T
      {
        k: Buffer.from("fik@4!895.21?h*r", "utf-8"),
        iv: Buffer.from(headerT.padEnd(16, '0').slice(0, 16), "utf-8")
      },
      // 2. المفتاح مشتق من MD5(T)
      {
        k: crypto.createHash('md5').update(headerT).digest(),
        iv: Buffer.from("1234567890123456", "utf-8")
      },
      // 3. المفتاح مشتق من MD5(fik@... + T)
      {
        k: crypto.createHash('md5').update("fik@4!895.21?h*r" + headerT).digest(),
        iv: Buffer.from("1234567890123456", "utf-8")
      },
      // 4. المفتاح الافتراضي والـ IV الثابت
      {
        k: Buffer.from("fik@4!895.21?h*r", "utf-8"),
        iv: Buffer.from("1234567890123456", "utf-8")
      },
      // 5. مفتاح YTV الحديث
      {
        k: Buffer.from("yacinetvkey12345", "utf-8"),
        iv: Buffer.from("1234567890123456", "utf-8")
      }
    ];

    for (const item of candidates) {
      const result = tryAesDecrypt(cipherBytes, item.k, item.iv);
      if (result) {
        return res.status(200).json({
          status: "success",
          header_t: headerT,
          data: result
        });
      }
    }

    return res.status(200).json({
      status: "trying_combinations",
      header_t: headerT,
      data_length: cipherBytes.length
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
