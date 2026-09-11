import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClientWalletView } from '../src/features/client/ClientWalletSection.jsx';
import { createClientWalletController } from '../src/features/client/clientWalletState.js';
import '../src/styles.css';
import '../src/presentation.css';

// Explicit DEV-only visual fixture: no API calls, credentials, financial writes
// or imports from the production entrypoint. Uses the real view and controller.
function Preview() {
  const [state, setState] = useState({ loading: true });
  const [writes, setWrites] = useState(0);
  const controller = useRef(null);
  const failRead = useRef(false);
  useEffect(() => {
    const resource = createClientWalletController({
      readToken: () => 'in-memory-visual-fixture',
      onChange: setState,
      api: {
        load: async () => {
          if (failRead.current) throw Error('Explicit QA read failure');
          return {
            summary: { balanceKzt: 1450, currency: 'KZT' },
            cards: [{ id: 'fixture', maskedCardNumber: '•••• 1234', holderName: 'Local QA' }],
            topups: [{ id: 'fixture', amountKzt: 5000, status: 'PENDING', createdAt: '2026-09-09T12:00:00Z' }],
          };
        },
        remove: async () => {
          setWrites(count => count + 1);
          throw Error('Explicit QA lost deletion response');
        },
      },
    });
    controller.current = resource;
    resource.load();
    return () => resource.dispose();
  }, []);
  return <div style={{ maxWidth: 480, margin: '0 auto' }}>
    <aside style={{ padding: 16, background: '#EAF3FF', color: '#152238', font: '13px Inter, sans-serif' }}>
      <p>QA · тестовые данные. Нет реального кошелька или списаний.</p>
      <p role="status">Тестовых удалений: {writes}</p>
      <button style={{ minHeight: 44 }} onClick={() => { failRead.current = !failRead.current; controller.current.load(); }}>Переключить ошибку чтения</button>
    </aside>
    <ClientWalletView state={state} onReload={() => controller.current.load()} onRemove={card => controller.current.remove(card.id)} />
  </div>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')).render(<Preview />);
