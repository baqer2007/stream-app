import crypto from 'crypto';
import zlib from 'zlib';

const KNOWN_KEYS = [
  { key: "fik@4!895.21?h*r", iv: "1234567890123456" },
  { key: "yacinetvkey12345", iv: "1234567890123456" },
  { key: "1234567890123456", iv: "1234567890123456" },
  { key: "2134567890123456", iv: "1234567890123456" },
  { key: "yacinetv$#@!2023", iv: "1234567890123456" }
];

function tryDecrypt(cipherText, keyStr, ivStr) {
  try {
    const key = Buffer.from(keyStr, 'utf-8');
    const iv = Buffer.from(ivStr, 'utf-8');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    let dec = decipher.update(cipherText, 'base64', 'utf-8');
    dec += decipher.final('utf-8');
    return JSON.parse(dec);
  } catch (e) {
    try {
      const key = Buffer.from(keyStr, 'utf-8');
      const iv = Buffer.from(ivStr, 'utf-8');
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      decipher.setAutoPadding(false);
      let dec = decipher.update(cipherText, 'base64', 'utf-8');
      dec += decipher.final('utf-8');
      const clean = dec.replace(/[\x00-\x1F\x7F]/g, "").trim();
      return JSON.parse(clean);
    } catch (err) {
      return null;
    }
  }
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

    const buffer = await response.arrayBuffer();
    let rawText;
    try {
      rawText = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8');
    } catch (e) {
      rawText = Buffer.from(buffer).toString('utf-8');
    }

    const cipherText = rawText.trim();

    // تجربة المفاتيح المحفوظة
    for (const item of KNOWN_KEYS) {
      const result = tryDecrypt(cipherText, item.key, item.iv);
      if (result) {
        return res.status(200).json({
          status: "success",
          matched_key: item.key,
          data: result
        });
      }
    }

    // في حال عدم تطابق أي مفتاح، إرجاع النص لفحصه
    return res.status(200).json({
      status: "key_mismatch",
      message: "لم يطابق المفتاح الافتراضي، تم جلب النص المشفر بنجاح",
      encrypted_sample: cipherText.substring(0, 100)
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
