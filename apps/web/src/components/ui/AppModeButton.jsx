import React, { useEffect, useRef, useState } from "react";
import { api, getToken, setToken } from "../../lib/api.js";
import { switchAppMode } from "../../lib/appMode.js";
import { Button } from "../../core/ui.jsx";

export default function AppModeButton({ mode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true),
    locked = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const switchMode = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await switchAppMode({
        mode,
        request: api,
        readToken: getToken,
        writeToken: setToken,
        navigate: (path) => window.location.assign(path),
        isAlive: () => alive.current,
      });
    } catch (failure) {
      if (alive.current)
        setError(
          failure.status || failure instanceof TypeError
            ? "Не удалось переключить режим. Проверьте соединение и попробуйте ещё раз."
            : failure.message,
        );
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className="app-mode-control">
      <Button variant="secondary" onClick={switchMode} disabled={busy}>
        {busy
          ? "Переключаем…"
          : mode === "driver"
            ? "Вернуться в режим водителя"
            : "Заказать поездку как пассажир"}
      </Button>
      {error && (
        <p
          role="alert"
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: "#a22942",
            padding: "12px 0",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
