import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";

function cleanPhoneForProvider(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function whatsappBaseUrl() {
  return (env.INFOBIP_WHATSAPP_BASE_URL || env.INFOBIP_BASE_URL || "").replace(/\/$/, "");
}

function whatsappApiKey() {
  return env.INFOBIP_WHATSAPP_API_KEY || env.INFOBIP_API_KEY || "";
}

function whatsappUrl() {
  return `${whatsappBaseUrl()}/whatsapp/1/message/template`;
}

// Best-effort, additional delivery channel alongside SMS — never the only
// way a passenger/driver gets their code, so failures here are reported
// but never thrown: the caller keeps going on the SMS result regardless.
export function whatsappEnabled() {
  return env.WHATSAPP_PROVIDER === "infobip" &&
    Boolean(whatsappApiKey()) &&
    Boolean(whatsappBaseUrl()) &&
    Boolean(env.INFOBIP_WHATSAPP_SENDER) &&
    Boolean(env.INFOBIP_WHATSAPP_OTP_TEMPLATE);
}

export async function sendWhatsAppCode({ phone, code }) {
  if (!whatsappEnabled()) {
    return { provider: "whatsapp", delivered: false, skipped: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(whatsappUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `App ${whatsappApiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        messages: [
          {
            from: env.INFOBIP_WHATSAPP_SENDER,
            to: cleanPhoneForProvider(phone),
            messageId: randomUUID(),
            content: {
              templateName: env.INFOBIP_WHATSAPP_OTP_TEMPLATE,
              templateData: { body: { placeholders: [code] } },
              language: env.INFOBIP_WHATSAPP_OTP_LANGUAGE
            }
          }
        ]
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        provider: "whatsapp",
        delivered: false,
        error: payload?.requestError?.serviceException?.text ||
          payload?.requestError?.serviceException?.messageId ||
          `HTTP ${response.status}`
      };
    }

    const message = payload?.messages?.[0] || {};
    return {
      provider: "whatsapp",
      delivered: true,
      messageId: message.messageId || null,
      status: message.status?.groupName || message.status?.name || null
    };
  } catch (error) {
    return {
      provider: "whatsapp",
      delivered: false,
      error: error?.name === "AbortError" ? "timeout" : String(error?.message || error)
    };
  } finally {
    clearTimeout(timeout);
  }
}
