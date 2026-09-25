import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AppErrorBoundary} from '../src/app/AppRecovery.jsx';
import '../src/styles.css';
import '../src/presentation.css';

// Development-only entry, deliberately absent from the production build.
function BrokenScreen({broken}) {
  if (broken) throw new Error('Explicit local QA fixture: render failure');
  return <p>Тестовый экран работает.</p>;
}
function Preview() {
  const [broken,setBroken]=useState(false);
  return <><header style={{position:'relative',zIndex:1,padding:16,background:'#eaf3ff',color:'#152238',font:'14px Inter,sans-serif'}}><p>QA восстановления · искусственная ошибка компонента · не реальная поездка</p><button style={{minHeight:44,marginTop:12}} onClick={()=>setBroken(true)}>Вызвать тестовую ошибку</button></header><AppErrorBoundary><BrokenScreen broken={broken}/></AppErrorBoundary></>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')).render(<Preview/>);
