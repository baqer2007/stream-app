import crypto from 'crypto';
import zlib from 'zlib';

const KEYS_POOL = [
  // مفاتيح YTV PRO الحديثة و Yacine TV v3
  { key: "1234567890123456", iv: "1234567890123456", algo: "aes-128-cbc" },
  { key: "fik@4!895.21?h*r", iv: "1234567890123456", algo: "aes-128-cbc" },
  { key: "yacinetvkey12345", iv: "yacinetviv123456", algo: "aes-128-cbc" },
  { key: "ytvprokey2024app", iv: "1234567890123456", algo: "aes-128-cbc" },
  { key: "c29tZXJhbmRvbWtleQ==", iv: "1234567890123456", algo: "aes-128-cbc" },
  { key: "com.ytv.player.app", iv: "1234567890123456", algo: "aes-128-cbc" },
  { key: "0123456789abcdef", iv: "fedcba9876543210", algo: "aes-128-cbc" },
  { key: "yacine_tv_secret", iv: "0000000000000000", algo: "aes-128-cbc" }
];

function tryAllDecrypt(cipherBase64) {
  for (const item of KEYS_POOL) {
    try {
      const key = Buffer.from(item.key.padEnd(16, '0').slice(0, 16), 'utf-8');
      const iv = Buffer.from(item.iv.padEnd(16, '0').slice(0, 16), 'utf-8');
      
      const decipher = crypto.createDecipheriv(item.algo, key, iv);
      let dec = decipher.update(cipherBase64, 'base64', 'utf-8');
      dec += decipher.final('utf-8');
      
      const parsed = JSON.parse(dec);
      return { success: true, key: item.key, data: parsed };
    } catch (e) {
      // تجربة بدون Padding
      try {
        const key = Buffer.from(item.key.padEnd(16, '0').slice(0, 16), 'utf-8');
        const iv = Buffer.from(item.iv.padEnd(16, '0').slice(0, 16), 'utf-8');
        const decipher = crypto.createDecipheriv(item.algo, key, iv);
        decipher.setAutoPadding(false);
        let dec = decipher.update(cipherBase64, 'base64', 'utf-8');
        dec += decipher.final('utf-8');
        const clean = dec.replace(/[\x00-\x1F\x7F]/g, "").trim();
        const parsed = JSON.parse(clean);
        return { success: true, key: item.key, data: parsed };
      } catch (err) {}
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

    const buffer = await response.arrayBuffer();
    let rawText;
    try {
      rawText = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8');
    } catch (e) {
      rawText = Buffer.from(buffer).toString('utf-8');
    }

    const cipherText = rawText.trim();
    const result = tryAllDecrypt(cipherText);

    if (result.success) {
      return res.status(200).json({
        status: "success",
        matched_key: result.key,
        data: result.data
      });
    }

    // إرجاع النص المشفر بالكامل لنتمكن من تحليله فكياً
    return res.status(200).json({
      status: "need_custom_key",
      cipher_full: cipherText
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
