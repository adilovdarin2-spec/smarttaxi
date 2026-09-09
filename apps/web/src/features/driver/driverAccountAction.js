import { sessionGuard } from "../../lib/sessionGuard.js";
import { accountError } from "./driverAccountModel.js";

export function createDriverAccountAction({ readToken, isAlive, onChange }) {
  let locked = false;
  return async (action, onSuccess, message = "Сохранено") => {
    const isCurrent = sessionGuard(readToken(), readToken, isAlive);
    if (locked || !isCurrent()) return;
    locked = true;
    let uncertain = false;
    onChange({ busy: true, error: "", message: "" });
    try {
      const result = await action();
      if (!isCurrent()) return;
      onChange({ busy: false, error: "", message });
      onSuccess?.(result);
    } catch (error) {
      // A write may have committed even if its response was lost. Never
      // replay it or enable another submit until the user reloads the list.
      uncertain = !error?.status || error.status >= 500;
      if (isCurrent())
        onChange({
          busy: uncertain,
          uncertain,
          message: "",
          error: uncertain
            ? "Ответ сервиса не получен. Обновите раздел и проверьте результат перед повторной отправкой."
            : accountError(error),
        });
    } finally {
      if (!uncertain) locked = false;
    }
  };
}
