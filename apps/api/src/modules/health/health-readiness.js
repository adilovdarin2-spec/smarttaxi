export function smsReadinessStatus(config) {
  if (config.SMS_PROVIDER === "infobip") {
    return config.INFOBIP_API_KEY && config.INFOBIP_BASE_URL
      ? "configured"
      : "not_configured";
  }
  return config.NODE_ENV === "production" ? "not_configured" : "dev";
}

export function dependenciesReady(checks, nodeEnv) {
  const baseReady = checks.db === "ok" && checks.redis === "PONG";
  const routingReady = nodeEnv !== "production" || checks.osrm !== "fail";
  const smsReady = checks.sms === "dev" || checks.sms === "configured";
  return baseReady && routingReady && smsReady;
}
