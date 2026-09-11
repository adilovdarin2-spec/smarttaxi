import { AppError } from "../../common/errors.js";
import { env } from "../../config/env.js";

function cleanPhoneForProvider(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) throw new AppError("Invalid phone", 400, "INVALID_PHONE");
  return digits;
}

function smsText({ code, purpose }) {
  const action = purpose === "RESET_PASSWORD" ? "восстановления доступа" : "подтверждения входа";
  return `SmartTaxi: код ${action} ${code}. Никому не сообщайте этот код.`;
}

function infobipUrl() {
  const base = env.INFOBIP_BASE_URL.replace(/\/$/, "");
  return `${base}/sms/3/messages`;
}

export function smsDeliveryMode() {
  if (env.SMS_PROVIDER === "infobip") return "INFOBIP";
  return "DEV_CONSOLE";
}

export async function sendSmsCode({ phone, code, purpose }) {
  if (env.SMS_PROVIDER !== "infobip") {
    if (env.NODE_ENV === "production") {
      throw new AppError("SMS provider is not configured", 503, "SMS_PROVIDER_NOT_CONFIGURED");
    }
    return { provider: "dev", delivered: false };
  }

  if (!env.INFOBIP_API_KEY || !env.INFOBIP_BASE_URL) {
    throw new AppError("SMS provider is not configured", 503, "SMS_PROVIDER_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(infobipUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `App ${env.INFOBIP_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        messages: [
          {
            destinations: [{ to: cleanPhoneForProvider(phone) }],
            sender: env.SMS_FROM,
            content: { text: smsText({ code, purpose }) }
          }
        ]
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AppError("SMS delivery failed", 502, "SMS_DELIVERY_FAILED", {
        provider: "infobip",
        status: response.status,
        requestError: payload?.requestError?.serviceException?.messageId || payload?.requestError?.serviceException?.text || null
      });
    }

    const message = payload?.messages?.[0] || {};
    return {
      provider: "infobip",
      delivered: true,
      messageId: message.messageId || null,
      status: message.status?.groupName || message.status?.name || null
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const codeName = error?.name === "AbortError" ? "SMS_DELIVERY_TIMEOUT" : "SMS_DELIVERY_FAILED";
    throw new AppError("SMS delivery failed", 502, codeName);
  } finally {
    clearTimeout(timeout);
  }
}
