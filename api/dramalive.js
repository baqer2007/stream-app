import crypto from 'crypto';

const DRAMA_KEY = Buffer.from('28237aecb4b5e7d5a57a6e60ffec7c12', 'hex');
const DRAMA_IV  = Buffer.from('d5a57a6e60ffec7c1228237aecb4b5e7', 'hex');

function safeDecryptDrama(cipherBuf) {
  // 1. تجربة AES-CBC بدون حشوة صارمة
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', DRAMA_KEY, DRAMA_IV);
    decipher.setAutoPadding(false);
    let dec = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
    
    // إزالة أحرف الحشوة (PKCS7 unpad يدوياً)
    const pad = dec[dec.length - 1];
    if (pad > 0 && pad <= 16) {
      dec = dec.subarray(0, dec.length - pad);
    }
    const text = dec.toString('utf-8');
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}') + 1;
    if (s !== -1 && e > s) {
      return JSON.parse(text.substring(s, e));
    }
  } catch {}

  // 2. تجربة مفاتيح دراما لايف الإضافية (v13)
  const altKey = crypto.createHash('md5').update('livedrama_v13_secret').digest();
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', altKey, DRAMA_IV);
    decipher.setAutoPadding(false);
    let dec = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
    const text = dec.toString('utf-8');
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}') + 1;
    if (s !== -1 && e > s) {
      return JSON.parse(text.substring(s, e));
    }
  } catch {}

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  const liveId = req.query.id || "1";

  try {
    // 1. طلب قائمة السيرفرات والبث
    const response = await fetch('http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById', {
      method: 'POST',
      headers: {
        'User-Agent': 'okhttp/4.9.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `live_id=${liveId}`
    });

    const rawText = await response.text();
    
    // استخراج Base64 الخام
    const b64 = rawText.replace(/HTTP\/1\.1[\s\S]*?\r?\n\r?\n/, '').replace(/[^A-Za-z0-9+/=]/g, '');
    const cipherBuf = Buffer.from(b64, 'base64');

    const result = safeDecryptDrama(cipherBuf);

    if (result) {
      return res.status(200).json({
        status: 'success',
        streams: result
      });
    }

    // 2. محاولة جلب رابط التحويل المباشر (Redirect Endpoint)
    const redirRes = await fetch('http://redirect.1spbgmu.com/redirect/getLiveByRedirect', {
      method: 'POST',
      headers: {
        'User-Agent': 'okhttp/4.9.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `live_id=${liveId}`
    });
    const redirText = await redirRes.text();

    return res.status(200).json({
      status: 'redirect_captured',
      redirect_payload: redirText.substring(0, 300)
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}
