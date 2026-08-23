import crypto from 'crypto';
import zlib from 'zlib';

function fullDecodeStream(buffer) {
  // تجربة فك تشفير AES القياسي لمشغل YTV PRO
  const keys = [
    Buffer.from("fik@4!895.21?h*r", "utf-8"),
    Buffer.from("yacinetvkey12345", "utf-8"),
    Buffer.from("1234567890123456", "utf-8")
  ];
  const ivs = [
    Buffer.from("1234567890123456", "utf-8"),
    Buffer.from("0000000000000000", "utf-8")
  ];

  for (const k of keys) {
    for (const iv of ivs) {
      try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', k, iv);
        decipher.setAutoPadding(false);
        let dec = decipher.update(buffer);
        dec = Buffer.concat([dec, decipher.final()]);
        const text = dec.toString('utf-8');
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}') + 1;
        if (start !== -1 && end !== -1) {
          const json = JSON.parse(text.substring(start, end).replace(/[\x00-\x1F\x7F]/g, ''));
          return json;
        }
      } catch (e) {}
    }
  }

  // محاولة فك تشفير XOR المباشر
  const xorKey = Buffer.from("fik@4!895.21?h*r", "utf-8");
  const out = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    out[i] = buffer[i] ^ xorKey[i % xorKey.length];
  }
  const textXor = out.toString('utf-8');
  const startXor = textXor.indexOf('{');
  const endXor = textXor.lastIndexOf('}') + 1;
  if (startXor !== -1 && endXor !== -1) {
    try {
      return JSON.parse(textXor.substring(startXor, endXor));
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
        "User-Agent": "okhttp/3.12.1",
        "Accept-Encoding": "gzip",
        "Connection": "Keep-Alive",
        "Host": "def.yacinelive.com"
      }
    });

    const rawBuffer = await response.arrayBuffer();
    let textPayload;

    try {
      textPayload = zlib.gunzipSync(Buffer.from(rawBuffer)).toString('utf-8');
    } catch (e) {
      textPayload = Buffer.from(rawBuffer).toString('utf-8');
    }

    const base64Str = textPayload.trim();
    const cipherBytes = Buffer.from(base64Str, 'base64');

    const result = fullDecodeStream(cipherBytes);

    if (result) {
      return res.status(200).json({
        status: "success",
        data: result
      });
    }

    return res.status(200).json({
      status: "ready_to_parse",
      payload_sample: base64Str.substring(0, 50)
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
