import crypto from 'crypto';

// المفاتيح الرسمية لفك تشفير استجابات دراما لايف
const DRAMA_KEY = Buffer.from('28237aecb4b5e7d5a57a6e60ffec7c12', 'hex');
const DRAMA_IV = Buffer.from('d5a57a6e60ffec7c1228237aecb4b5e7', 'hex');

function decryptDrama(encryptedBase64) {
  try {
    const cipherBuffer = Buffer.from(encryptedBase64.trim(), 'base64');
    const decipher = crypto.createDecipheriv('aes-128-cbc', DRAMA_KEY, DRAMA_IV);
    let decrypted = decipher.update(cipherBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
  } catch (err) {
    // تجربة التشفير البديل بدون IV منفصل
    return { error: err.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  const liveId = req.query.id || "1";

  try {
    // جلب القنوات المباشرة من دراما لايف
    const response = await fetch('http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById', {
      method: 'POST',
      headers: {
        'User-Agent': 'okhttp/4.9.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `live_id=${liveId}`
    });

    const rawEncrypted = await response.text();
    const cleanData = rawEncrypted.replace(/HTTP\/1\.1.*?\n\n/s, '').trim();
    const decryptedJson = decryptDrama(cleanData);

    return res.status(200).json({
      status: 'success',
      data: decryptedJson
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}
