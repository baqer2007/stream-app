import zlib from 'zlib';

// خوارزمية فك تشفير YTV PRO / Yacine الحديثة
function decryptYTV(encodedStr) {
  const rawBytes = Buffer.from(encodedStr, 'base64');
  const key = Buffer.from("fik@4!895.21?h*r", "utf-8");
  const output = Buffer.alloc(rawBytes.length);

  for (let i = 0; i < rawBytes.length; i++) {
    output[i] = rawBytes[i] ^ key[i % key.length];
  }

  // معالجة بايتات المحاذاة والتنسيق
  let text = output.toString('utf-8');
  
  // استخراج كائن الـ JSON الصافي
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}') + 1;
  
  if (start !== -1 && end !== -1) {
    return JSON.parse(text.substring(start, end));
  }
  
  throw new Error("Invalid JSON extraction");
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

    const cleanBase64 = textPayload.trim();
    const parsedData = decryptYTV(cleanBase64);

    return res.status(200).json({
      status: "success",
      data: parsedData
    });

  } catch (error) {
    // محاولة ثانوية باستخدام مفتاح الحزمة الاحتياطي
    try {
      const rawBytes = Buffer.from((await (await fetch(API_URL)).text()).trim(), 'base64');
      const altKey = Buffer.from("yacinetvkey12345", "utf-8");
      const altOut = Buffer.alloc(rawBytes.length);
      for (let i = 0; i < rawBytes.length; i++) {
        altOut[i] = rawBytes[i] ^ altKey[i % altKey.length];
      }
      const altText = altOut.toString('utf-8');
      const start = altText.indexOf('{');
      const end = altText.lastIndexOf('}') + 1;
      const parsedData = JSON.parse(altText.substring(start, end));

      return res.status(200).json({
        status: "success",
        data: parsedData
      });
    } catch (err2) {
      return res.status(500).json({
        status: "error",
        message: "Decryption failed: " + error.message
      });
    }
  }
}
