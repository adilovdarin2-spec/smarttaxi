import { sessionGuard } from "../../lib/sessionGuard.js";

export const emptyFavoritesState = Object.freeze({
  favorites: [],
  loading: false,
  error: "",
  notice: "",
  creating: false,
  deletingId: "",
  uncertain: false,
});

const normalized = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const finite = (value) => Number.isFinite(Number(value));

export function validFavoriteList(data) {
  const rows = data?.favorites ?? data?.addresses;
  if (!Array.isArray(rows)) throw Error("invalid favorite-address response");
  const valid = rows.every(validFavoriteAddress);
  if (!valid) throw Error("invalid favorite-address row");
  return rows;
}

function validFavoriteAddress(row) {
  return Boolean(
    row &&
      normalized(row.id) &&
      normalized(row.label) &&
      normalized(row.title) &&
      normalized(row.addressText ?? row.address_text) &&
      finite(row.lat) &&
      finite(row.lng),
  );
}

export function sameFavoriteAddress(row, payload) {
  return (
    normalized(row?.label).toUpperCase() ===
      normalized(payload?.label).toUpperCase() &&
    normalized(row?.title) === normalized(payload?.title) &&
    normalized(row?.addressText ?? row?.address_text) ===
      normalized(payload?.addressText) &&
    finite(row?.lat) &&
    finite(row?.lng) &&
    Math.abs(Number(row.lat) - Number(payload.lat)) < 0.000001 &&
    Math.abs(Number(row.lng) - Number(payload.lng)) < 0.000001
  );
}

function uncertainWrite(error, remove = false) {
  if (error?.name === "AbortError") return false;
  if (remove && error?.status === 404) return true;
  if (error?.code === "MISSING_ACKNOWLEDGEMENT") return true;
  return (
    (error instanceof TypeError && error.status == null) ||
    (error?.status >= 500 && error.status < 600)
  );
}

export function createClientFavoritesController({
  api,
  readToken,
  onChange,
  formatError = (error) => error?.message || "Не удалось выполнить запрос",
}) {
  let alive = true;
  let generation = 0;
  let writing = false;
  let state = { ...emptyFavoritesState };

  const publish = (change) => {
    state = { ...state, ...change };
    if (alive) onChange(state);
  };
  const operationGuard = () =>
    sessionGuard(readToken(), readToken, () => alive);

  async function readList(current) {
    const rows = validFavoriteList(await api.load());
    return current() ? rows : null;
  }

  async function load(notice = "") {
    if (writing) return { status: "busy" };
    const current = operationGuard();
    const request = ++generation;
    if (!current()) return { status: "stale" };
    publish({ loading: true, error: "", notice: "" });
    try {
      const favorites = await readList(current);
      if (!favorites || request !== generation) return { status: "stale" };
      publish({
        favorites,
        loading: false,
        error: "",
        notice,
        uncertain: false,
        deletingId: "",
        creating: false,
      });
      return { status: "confirmed", favorites };
    } catch (error) {
      if (current() && request === generation) {
        publish({ loading: false, error: formatError(error) });
      }
      return { status: "failed", error };
    }
  }

  async function create(payload) {
    const current = operationGuard();
    if (!current() || writing || state.loading || state.uncertain) {
      return { status: "blocked" };
    }
    writing = true;
    ++generation;
    publish({ creating: true, error: "", notice: "" });
    try {
      const result = await api.create(payload);
      if (!current()) return { status: "stale" };
      const address = result?.address;
      if (!validFavoriteAddress(address) || !sameFavoriteAddress(address, payload)) {
        throw Object.assign(Error("favorite creation was not acknowledged"), {
          code: "MISSING_ACKNOWLEDGEMENT",
        });
      }
      const favorites = [
        address,
        ...state.favorites.filter((row) => row.id !== address.id),
      ];
      publish({
        favorites,
        creating: false,
        uncertain: false,
        notice: "Адрес сохранён в избранном.",
      });
      return { status: "confirmed", address };
    } catch (error) {
      if (!current()) return { status: "stale" };
      if (uncertainWrite(error)) {
        try {
          const favorites = await readList(current);
          if (!favorites) return { status: "stale" };
          if (favorites.some((row) => sameFavoriteAddress(row, payload))) {
            publish({
              favorites,
              creating: false,
              uncertain: false,
              notice: "Адрес сохранён в избранном.",
            });
            return { status: "recovered" };
          }
          publish({
            favorites,
            creating: false,
            uncertain: true,
            error:
              "Не удалось подтвердить сохранение. Обновите список перед повторной попыткой.",
          });
          return { status: "uncertain", error };
        } catch {
          publish({
            creating: false,
            uncertain: true,
            error:
              "Не удалось подтвердить сохранение. Обновите список перед повторной попыткой.",
          });
          return { status: "uncertain", error };
        }
      }
      publish({ creating: false, error: formatError(error) });
      return { status: "failed", error };
    } finally {
      writing = false;
    }
  }

  async function remove(id) {
    const current = operationGuard();
    if (
      !current() ||
      writing ||
      state.loading ||
      state.uncertain ||
      !state.favorites.some((row) => row.id === id)
    ) {
      return { status: "blocked" };
    }
    writing = true;
    ++generation;
    publish({ deletingId: id, error: "", notice: "" });
    try {
      await api.remove(id);
      if (!current()) return { status: "stale" };
      const favorites = state.favorites.filter((row) => row.id !== id);
      publish({
        favorites,
        deletingId: "",
        uncertain: false,
        notice: "Адрес удалён из избранного.",
      });
      return { status: "confirmed" };
    } catch (error) {
      if (!current()) return { status: "stale" };
      if (uncertainWrite(error, true)) {
        try {
          const favorites = await readList(current);
          if (!favorites) return { status: "stale" };
          if (!favorites.some((row) => row.id === id)) {
            publish({
              favorites,
              deletingId: "",
              uncertain: false,
              notice: "Адрес удалён из избранного.",
            });
            return { status: "recovered" };
          }
          publish({
            favorites,
            deletingId: "",
            uncertain: true,
            error:
              "Не удалось подтвердить удаление. Обновите список перед повторной попыткой.",
          });
          return { status: "uncertain", error };
        } catch {
          publish({
            deletingId: "",
            uncertain: true,
            error:
              "Не удалось подтвердить удаление. Обновите список перед повторной попыткой.",
          });
          return { status: "uncertain", error };
        }
      }
      publish({ deletingId: "", error: formatError(error) });
      return { status: "failed", error };
    } finally {
      writing = false;
    }
  }

  return {
    load,
    create,
    remove,
    dispose() {
      alive = false;
      generation += 1;
    },
  };
}
