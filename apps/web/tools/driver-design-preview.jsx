// Development-only visual fixture. Renders production components; no auth,
// network mutations, fabricated GPS, or real orders. Not a Vite build entry.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import '../src/presentation.css';
import { IncomingOrderCard, ActiveOrderPanel, DriverShiftPanel } from '../src/features/driver/DriverApp.jsx';

function Preview() {
  const [state, setState] = useState('incoming');
  const [action, setAction] = useState('');
  const [working, setWorking] = useState(false);
  const order = {id:'component-fixture',status:state,tariff:'Economy',estimatedPrice:700,
    paymentMethod:'CASH',distanceKm:3.5,durationMin:12,pickup:'улица Бектасова, 12, главный вход со стороны двора',
    dropoff:'улица Кожанова, 34, Мырзакент', waiting_started_at: new Date(Date.now()-30000).toISOString(), free_waiting_until:new Date(Date.now()+150000).toISOString()};
  return <main style={{maxWidth:390,margin:'0 auto',background:'#fff',minHeight:'100vh'}}>
    <style>{`.phone-frame.driver-core-phone.driver-design-fixture { display:block !important; height:auto !important; min-height:0 !important; padding:16px !important; overflow:visible !important; }`}</style>
    <div style={{padding:16,color:'#607087',font:'12px Inter,sans-serif'}}>
      QA компонентов · тестовые данные · не реальная поездка
      <select aria-label="Состояние для визуальной проверки" value={state} onChange={e=>{setState(e.target.value);setAction('');}} style={{display:'block',width:'100%',padding:12,marginTop:12}}>
        <option value="incoming">Входящий заказ</option><option value="line">Линия</option>
        <option value="DRIVER_GOING_TO_CLIENT">Еду к клиенту</option><option value="WAITING_CLIENT">Ожидание</option>
        <option value="TRIP_STARTED">В поездке</option><option value="TRIP_COMPLETED">Завершение</option>
      </select>
    </div>
    <div className="phone-frame driver-core-phone driver-design driver-design-fixture" style={{minHeight:0,margin:0,border:0,borderRadius:0,padding:16,boxShadow:'none'}}>
      {state === 'incoming' ? <IncomingOrderCard order={order} onAccept={()=>setAction('Принять')} onReject={()=>setAction('Пропустить')} />
        : state === 'line' ? <DriverShiftPanel title={working?'На линии':'Не на линии'} description="Новые заказы появятся после выхода на линию."
          regions={[{id:'local',name:'Мырзакент'}]} selectedRegionId="local" onRegionSelect={()=>{}} earnings={{todayGrossKzt:9800,completedOrders:14}} debt={{debtKzt:8757}}
          isWorking={working} onToggle={()=>setWorking(!working)} />
        : <ActiveOrderPanel order={order} onAction={(_,next)=>setAction(next.label)} onNavigate={()=>setAction('Навигатор')} onCancel={()=>setAction('Отменить')} onNoShow={()=>setAction('Клиент не вышел')} />}
    </div>
    {action && <p role="status" style={{padding:16}}>QA: {action} — запрос не отправлялся</p>}
  </main>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')).render(<Preview />);
