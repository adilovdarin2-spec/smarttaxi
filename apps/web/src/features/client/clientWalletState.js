export const walletUnavailableText =
  "Онлайн-пополнение и привязка банковских карт пока недоступны. За поездку можно заплатить наличными или доступным кешбэком.";

export function walletMoney(value) {
  if (
    value == null ||
    String(value).trim() === "" ||
    !Number.isFinite(Number(value))
  )
    return "Сумма уточняется";
  return `${Number(value).toLocaleString("ru-KZ", { maximumFractionDigits: 2 })} ₸`;
}
export function savedCardLabel(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "Сохранённая запись";
}
export function topupStatus(value) {
  return (
    {
      PENDING: "Ожидает",
      COMPLETED: "Выполнено",
      FAILED: "Не выполнено",
      CANCELLED: "Отменено",
    }[value] || "Статус уточняется"
  );
}
export function walletDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString("ru-KZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Дата не указана";
}

export function createClientWalletController({ api, readToken, onChange }) {
  let alive = true,
    generation = 0,
    writing = false;
  let state = {
    loading: true,
    error: "",
    data: null,
    removingId: "",
    uncertain: false,
    notice: "",
  };
  const publish = (change) => {
    state = { ...state, ...change };
    if (alive) onChange(state);
  };
  const guard = () => {
    const token = readToken();
    return () => alive && Boolean(token) && readToken() === token;
  };
  async function load(notice = "") {
    if (writing) return;
    const current = guard(),
      request = ++generation;
    if (!current()) return;
    publish({ loading: true, error: "", data: null, notice: "" });
    try {
      const data = await api.load();
      if (!current() || request !== generation) return;
      if (
        !data.summary ||
        data.summary.balanceKzt == null ||
        String(data.summary.balanceKzt).trim() === "" ||
        !Number.isFinite(Number(data.summary.balanceKzt)) ||
        data.summary.currency !== "KZT" ||
        !Array.isArray(data.cards) ||
        !Array.isArray(data.topups)
      ) {
        throw Error("invalid wallet response");
      }
      publish({
        loading: false,
        data,
        error: "",
        removingId: "",
        uncertain: false,
        notice,
      });
    } catch (_) {
      if (current() && request === generation)
        publish({
          loading: false,
          data: null,
          error:
            "Не удалось загрузить кошелёк. Обновите данные — баланс не подтверждён.",
        });
    }
  }
  async function remove(id) {
    const current = guard();
    if (
      !current() ||
      writing ||
      state.loading ||
      state.uncertain ||
      !state.data?.cards.some((card) => card.id === id)
    )
      return;
    writing = true;
    ++generation;
    publish({ removingId: id, error: "", notice: "" });
    try {
      const result = await api.remove(id);
      if (!current()) return;
      if (result?.removed !== true)
        throw Error("missing deletion acknowledgement");
      writing = false;
      await load("Сохранённая запись карты удалена.");
    } catch (error) {
      if (!current()) return;
      const uncertain = !error?.status || error.status >= 500;
      publish({
        removingId: "",
        uncertain,
        error: uncertain
          ? "Не удалось подтвердить удаление. Обновите данные перед повторной попыткой."
          : "Не удалось удалить запись. Проверьте подключение и обновите данные.",
      });
    } finally {
      writing = false;
    }
  }
  return {
    load,
    remove,
    dispose() {
      alive = false;
      generation++;
    },
  };
}
