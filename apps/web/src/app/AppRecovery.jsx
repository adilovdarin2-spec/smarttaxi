import React, { useEffect, useState } from "react";
import { Button } from "../core/ui.jsx";
import { Icon } from "../core/icons.jsx";
import "./appRecovery.css";

export function AppRecoveryScreen({ onReload }) {
  return (
    <main className="app-recovery">
      <section role="alert">
        <span className="app-recovery-icon">
          <Icon name="route" size={30} />
        </span>
        <p>SmartTaxi</p>
        <h1>Не удалось открыть экран</h1>
        <p>
          Обновите приложение. Текущая поездка хранится на сервере — обновление
          страницы не отменяет заказ и не создаёт новый.
        </p>
        <Button onClick={onReload}>Обновить приложение</Button>
        <small>
          Если ошибка повторяется, проверьте подключение и сообщите в поддержку
          после входа.
        </small>
      </section>
    </main>
  );
}

export class AppErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <AppRecoveryScreen onReload={() => window.location.reload()} />
    ) : (
      this.props.children
    );
  }
}

export function isAccountStorageChange(event) {
  return event.key === "smarttaxi_token" || event.key === null;
}

// Another tab's sign-in/logout/mode switch must remove the previous account's
// private pages, not merely make their next request fail. Keep same-tab auth
// callbacks unchanged; the browser emits storage only to other documents.
export function AccountTabBoundary({ children }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = (event) => {
      if (
        event.storageArea === window.localStorage &&
        isAccountStorageChange(event)
      )
        setRevision((value) => value + 1);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  return <React.Fragment key={revision}>{children}</React.Fragment>;
}
