import crypto from 'crypto';

const DRAMA_KEY = Buffer.from('28237aecb4b5e7d5a57a6e60ffec7c12', 'hex');
const DRAMA_IV = Buffer.from('d5a57a6e60ffec7c1228237aecb4b5e7', 'hex');

function decryptDramaLive(rawText) {
  // تنظيف النص واستخراج كتلة Base64 النقية فقط
  const lines = rawText.split('\n');
  let base64Body = "";
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('HTTP/') && !trimmed.includes(':')) {
      base64Body += trimmed;
    }
  }

  // تصحيح أبعاد Base64
  let cleanBase64 = base64Body.replace(/[^A-Za-z0-9+/=]/g, '');
  while (cleanBase64.length % 4 !== 0) {
    cleanBase64 += '=';
  }

  const cipherBuffer = Buffer.from(cleanBase64, 'base64');

  // فك التشفير مع دعم Auto Padding
  for (const autoPad of [true, false]) {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', DRAMA_KEY, DRAMA_IV);
      decipher.setAutoPadding(autoPad);
      let dec = decipher.update(cipherBuffer);
      dec = Buffer.concat([dec, decipher.final()]);
      const text = dec.toString('utf-8');
      
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start !== -1 && end > start) {
        return { success: true, data: JSON.parse(text.substring(start, end)) };
      }
    } catch (e) {}
  }

  return { success: false, raw_len: cipherBuffer.length };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  const liveId = req.query.id || "1";

  try {
    const response = await fetch('http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById', {
      method: 'POST',
      headers: {
        'User-Agent': 'okhttp/4.9.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `live_id=${liveId}`
    });

    const rawResponse = await response.text();
    const result = decryptDramaLive(rawResponse);

    if (result.success) {
      return res.status(200).json({
        status: 'success',
        streams: result.data
      });
    }

    return res.status(200).json({
      status: 'decryption_retry',
      details: result
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}
