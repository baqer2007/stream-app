import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const API_URL = "http://def.yacinelive.com/api/config/player";
  const KEY = Buffer.from("fik@4!895.21?h*r", "utf-8");
  const IV = Buffer.from("1234567890123456", "utf-8");

  try {
    const response = await fetch(API_URL, {
      headers: {
        "User-Agent": "okhttp/4.9.0",
        "Accept-Encoding": "gzip"
      }
    });

    const encryptedData = (await response.text()).trim();

    // فك تشفير AES-128-CBC
    const decipher = crypto.createDecipheriv("aes-128-cbc", KEY, IV);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedData, "base64", "utf-8");
    decrypted += decipher.final("utf-8");

    const jsonData = JSON.parse(decrypted);

    return res.status(200).json({
      status: "success",
      data: jsonData
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
