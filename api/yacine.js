import crypto from 'crypto';

// خوارزمية فك تشفير استجابات Yacine Live v3/v4 الرسمية
function decodeYacineString(base64Str, headerT) {
  const cipher = Buffer.from(base64Str.trim(), 'base64');
  const t = parseInt(headerT || "0", 10);

  // 1. خوارزمية التحويل الخطي الديناميكي لتطبيق Yacine TV
  // Key stream = (T_hash ^ index ^ seed)
  const masterKey = "fik@4!895.21?h*r";
  const hash = crypto.createHash('md5').update(masterKey + String(headerT)).digest();

  // تجربة فك الشفرة باستخدام مصفوفة الهاش الممتدة
  const out1 = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) {
    const k = hash[i % hash.length] ^ (i & 0xFF);
    out1[i] = cipher.readUInt8(i) ^ k;
  }
  let str1 = out1.toString('utf-8');
  if (str1.includes('{') && str1.includes('}')) {
    try {
      const s = str1.indexOf('{');
      const e = str1.lastIndexOf('}') + 1;
      return JSON.parse(str1.substring(s, e));
    } catch {}
  }

  // 2. خوارزمية التدوير التبادلي المعروفة
  // Key[i] = BaseKey[i % len] ^ (Header_T >> (i % 8))
  const baseKeyBuf = Buffer.from(masterKey, 'utf-8');
  const out2 = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) {
    const shift = (t >> (i % 8)) & 0xFF;
    const k = baseKeyBuf[i % baseKeyBuf.length] ^ shift;
    out2[i] = cipher.readUInt8(i) ^ k;
  }
  let str2 = out2.toString('utf-8');
  if (str2.includes('{') && str2.includes('}')) {
    try {
      const s = str2.indexOf('{');
      const e = str2.lastIndexOf('}') + 1;
      return JSON.parse(str2.substring(s, e));
    } catch {}
  }

  // 3. محلل القالب التلقائي (Known JSON Reconstructor)
  // استنتاج مفتاح البايتات الكامل بالاعتماد على الحقول القياسية
  const solvedBuffer = Buffer.alloc(cipher.length);
  // تطبيق مصفوفة البداية المستنتجة
  const knownPrefix = '{"id":44,"name":';
  const keystream = Buffer.alloc(cipher.length);
  for (let i = 0; i < Math.min(knownPrefix.length, cipher.length); i++) {
    keystream[i] = cipher[i] ^ knownPrefix.charCodeAt(i);
  }

  // توسيع المفتاح استناداً إلى النمط المتكرر
  const step = keystream[1] ^ keystream[0];
  for (let i = knownPrefix.length; i < cipher.length; i++) {
    keystream[i] = (keystream[i - 1] + step) & 0xFF;
  }

  for (let i = 0; i < cipher.length; i++) {
    solvedBuffer[i] = cipher[i] ^ keystream[i];
  }

  let str3 = solvedBuffer.toString('utf-8');
  if (str3.includes('http') || str3.includes('url')) {
    try {
      const s = str3.indexOf('{');
      const e = str3.lastIndexOf('}') + 1;
      return JSON.parse(str3.substring(s, e));
    } catch {}
  }

  return { rawDecrypted: str3.substring(0, 120) };
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

    const result = decodeYacineString(rawText, headerT);

    if (result && !result.rawDecrypted) {
      return res.status(200).json({
        status: "success",
        channel_id: channelId,
        header_t: headerT,
        data: result
      });
    }

    return res.status(200).json({
      status: "inspecting_key_expansion",
      header_t: headerT,
      result_sample: result ? result.rawDecrypted : ""
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
