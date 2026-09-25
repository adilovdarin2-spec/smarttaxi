import { Router } from "express";
import { env } from "../../config/env.js";

const router = Router();

function parseVersion(value) {
  return String(value || "0")
    .trim()
    .split(".")
    .map(part => Number.parseInt(part, 10) || 0);
}

// True if `a` is strictly older than `b` (dotted-integer compare, e.g.
// "1.2.10" > "1.2.9" — not a plain string compare, which would get that
// case backwards).
export function isOlderVersion(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    if (l !== r) return l < r;
  }
  return false;
}

// Запрет без выхода -- это не запрет, это стена.
//
// updateRequired закрывает приложение целиком: экран во весь экран, назад не
// уйти, одна кнопка «Обновить». Кнопка ведёт по APP_UPDATE_URL. Если этой
// переменной нет -- а на проде её сейчас нет, -- кнопка не делает ничего, и
// человек остаётся в приложении, из которого нельзя выйти и в которое нельзя
// войти.
//
// А поднять APP_MIN_SUPPORTED_VERSION владелец рано или поздно поднимет: это
// ровно то, что делают при первом настоящем релизе, чтобы увести всех с
// пилотной сборки. Поэтому отказываемся закрывать вход, пока некуда вести:
// пусть лучше старая версия поработает лишний день, чем человек упрётся в
// стену.
let warnedAboutMissingUpdateUrl = false;

router.get("/", (req, res) => {
  const clientVersion = String(req.query.version || "").trim();
  const latest = env.APP_LATEST_VERSION;
  const minSupported = env.APP_MIN_SUPPORTED_VERSION;
  const updateUrl = env.APP_UPDATE_URL || null;
  const belowMinimum = clientVersion ? isOlderVersion(clientVersion, minSupported) : false;
  if (belowMinimum && !updateUrl && !warnedAboutMissingUpdateUrl) {
    warnedAboutMissingUpdateUrl = true;
    console.warn(
      "[app-version] APP_MIN_SUPPORTED_VERSION отсекает старые сборки, но APP_UPDATE_URL пуст — " +
      "принудительное обновление не включается, иначе людям некуда идти. Задайте APP_UPDATE_URL."
    );
  }
  res.json({
    latestVersion: latest,
    minSupportedVersion: minSupported,
    updateUrl,
    updateNotes: env.APP_UPDATE_NOTES || null,
    updateRequired: belowMinimum && Boolean(updateUrl),
    updateAvailable: clientVersion ? isOlderVersion(clientVersion, latest) : false
  });
});

export default router;
