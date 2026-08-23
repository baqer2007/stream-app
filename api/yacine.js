export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const channelId = req.query.id || "44";

  try {
    // 1. جلب إعدادات السيرفر والمشغل النشط حالياً
    const configRes = await fetch("http://def.yacinelive.com/api/config/player", {
      headers: {
        "User-Agent": "okhttp/4.9.0",
        "Connection": "Keep-Alive"
      }
    });

    const configData = await configRes.text();

    // 2. فحص الاستجابة المباشرة
    let parsedConfig = null;
    try {
      parsedConfig = JSON.parse(configData);
    } catch {
      parsedConfig = { raw_config: configData };
    }

    return res.status(200).json({
      status: "player_config_ready",
      target_channel: channelId,
      player_config: parsedConfig
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
