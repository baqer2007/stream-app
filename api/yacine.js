
import zlib from 'zlib';
import crypto from 'crypto';

// قائمة مفاتيح فك التشفير المعروفة لتطبيقات YTV و Yacine
const XOR_KEYS = [
  "fik@4!895.21?h*r",
  "yacinetvkey12345",
  "yacinetv",
  "com.ytv.player",
  "ytvpro2024",
  "1234567890123456"
];

function xorDecrypt(buffer, keyStr) {
  const key = Buffer.from(keyStr, 'utf-8');
  const out = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    out[i] = buffer[i] ^ key[i % key.length];
  }
  return out.toString('utf-8');
}

function rc4Decrypt(buffer, keyStr) {
  try {
    const decipher = crypto.createDecipheriv('rc4', Buffer.from(keyStr), '');
    const out = Buffer.concat([decipher.update(buffer), decipher.final()]);
    return out.toString('utf-8');
  } catch (e) {
    return null;
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

    const rawBuffer = await response.arrayBuffer();
    let textPayload;
    try {
      textPayload = zlib.gunzipSync(Buffer.from(rawBuffer)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(rawBuffer).toString('utf-8');
    }

    const base64Clean = textPayload.trim();
    const rawBytes = Buffer.from(base64Clean, 'base64');

    // 1. تجربة فك التشفير عبر XOR مع المفاتيح
    for (const k of XOR_KEYS) {
      try {
        const text = xorDecrypt(rawBytes, k);
        if (text.includes('{') && text.includes('}')) {
          const jsonStart = text.indexOf('{');
          const jsonEnd = text.lastIndexOf('}') + 1;
          const parsed = JSON.parse(text.substring(jsonStart, jsonEnd));
          return res.status(200).json({ status: "success", method: "xor", key: k, data: parsed });
        }
      } catch (err) {}
    }

    // 2. تجربة فك التشفير عبر RC4
    for (const k of XOR_KEYS) {
      try {
        const text = rc4Decrypt(rawBytes, k);
        if (text && text.includes('{') && text.includes('}')) {
          const jsonStart = text.indexOf('{');
          const jsonEnd = text.lastIndexOf('}') + 1;
          const parsed = JSON.parse(text.substring(jsonStart, jsonEnd));
          return res.status(200).json({ status: "success", method: "rc4", key: k, data: parsed });
        }
      } catch (err) {}
    }

    // 3. تجربة اشتقاق المفتاح تلقائياً عبر فحص رأس الـ JSON
    // بافتراض بداية النص المشفر تبدأ بـ {"
    const targetHeader = Buffer.from('{"');
    const derivedKey = Buffer.alloc(2);
    derivedKey[0] = rawBytes[0] ^ targetHeader[0];
    derivedKey[1] = rawBytes[1] ^ targetHeader[1];

    return res.status(200).json({
      status: "analyzing",
      raw_length: rawBytes.length,
      derived_header_bytes: derivedKey.toString('hex')
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
