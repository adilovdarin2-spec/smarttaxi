import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {api,login} from "./lib/api";
import {createSocket} from "./lib/socket";
import "./styles.css";

function Nav(){return <div className="nav"><div className="logo">SmartTaxi</div><a href="/client">Клиент</a><a href="/driver">Водитель</a><a href="/owner">Владелец</a></div>}

function Client(){
 const [tariffs,setTariffs]=useState([]),[result,setResult]=useState(null),[error,setError]=useState("");
 const [form,setForm]=useState({riderName:"Дарын",riderPhone:"+77000000000",pickupText:"Atakent, центр",dropoffText:"Atakent, вокзал",tariff:"Economy",paymentMethod:"CASH",notes:""});
 useEffect(()=>{api("/api/tariffs").then(d=>setTariffs(d.tariffs)).catch(()=>{})},[]);
 async function submit(e){e.preventDefault();setError("");try{setResult((await api("/api/orders",{method:"POST",body:JSON.stringify(form)})).order)}catch(e){setError(e.message)}}
 return <div className="page"><div className="grid"><div className="card"><h1>Заказать такси</h1><form onSubmit={submit}>{["riderName","riderPhone","pickupText","dropoffText"].map(k=><label key={k}>{k}<input value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<label>Тариф<select value={form.tariff} onChange={e=>setForm({...form,tariff:e.target.value})}>{(tariffs.length?tariffs:[{name:"Economy"},{name:"Comfort"},{name:"Business"},{name:"Delivery"}]).map(t=><option key={t.name}>{t.name}</option>)}</select></label><label>Оплата<select value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})}><option value="CASH">Наличные</option><option value="KASPI">Kaspi</option><option value="CARD">Карта</option></select></label><label>Комментарий<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><button className="btn">Заказать</button>{error&&<p className="error">{error}</p>}</form></div><div className="card"><h2>Карта</h2><div className="mapMock"><div className="pin a">A</div><div className="pin b">B</div></div>{result&&<div className="item"><span className="badge">{result.status}</span><h3>Заказ #{result.short_id}</h3><p>{result.price} ₸</p><p className="muted">{result.pickup_text} → {result.dropoff_text}</p></div>}</div></div></div>
}

function Driver(){
 const [auth,setAuth]=useState(false),[phone,setPhone]=useState("+77000000000"),[password,setPassword]=useState("123456"),[orders,setOrders]=useState([]),[stats,setStats]=useState(null),[error,setError]=useState("");
 async function doLogin(e){e.preventDefault();try{await login({phone,password});setAuth(true);load()}catch(e){setError(e.message)}}
 async function load(){setOrders((await api("/api/orders")).orders);setStats(await api("/api/drivers/me/stats").catch(()=>null))}
 async function status(st){await api("/api/drivers/me/status",{method:"PATCH",body:JSON.stringify({status:st})});load()}
 async function accept(id){try{await api(`/api/orders/${id}/accept`,{method:"POST"});load()}catch(e){alert(e.message)}}
 async function step(id,a){await api(`/api/orders/${id}/${a}`,{method:"POST"});load()}
 useEffect(()=>{if(!auth)return;const s=createSocket();s.emit("join_drivers");s.on("order_created",load);s.on("order_taken",load);s.on("order_updated",load);return()=>s.disconnect()},[auth]);
 if(!auth)return <div className="page"><div className="card"><h1>Вход водителя</h1><form onSubmit={doLogin}><label>Телефон<input value={phone} onChange={e=>setPhone(e.target.value)}/></label><label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="btn">Войти</button>{error&&<p className="error">{error}</p>}</form></div></div>;
 return <div className="page"><div className="row"><button className="btn" onClick={()=>status("FREE")}>На линии</button><button className="btn secondary" onClick={()=>status("OFFLINE")}>Не на линии</button><button className="btn secondary" onClick={load}>Обновить</button></div><br/><div className="grid3"><div className="stat"><strong>{stats?.today?.orders_total||0}</strong><span>Заказов</span></div><div className="stat"><strong>{stats?.today?.revenue_total||0} ₸</strong><span>Выручка</span></div><div className="stat"><strong>{stats?.driver?.debt||0} ₸</strong><span>Долг</span></div></div><br/><div className="card"><h2>Заказы</h2><div className="list">{orders.map(o=><div className="item" key={o.id}><span className="badge">{o.status}</span><h3>{o.pickup_text} → {o.dropoff_text}</h3><p>{o.price} ₸ · {o.tariff} · {o.payment_method}</p>{o.status==="NEW"&&<button className="btn" onClick={()=>accept(o.id)}>Принять</button>}{o.status==="DRIVER_ASSIGNED"&&<button className="btn" onClick={()=>step(o.id,"arrived")}>Я приехал</button>}{o.status==="DRIVER_ARRIVED"&&<button className="btn" onClick={()=>step(o.id,"start")}>Начать</button>}{o.status==="IN_PROGRESS"&&<button className="btn" onClick={()=>step(o.id,"complete")}>Завершить</button>}</div>)}</div></div></div>
}

function Owner(){
 const [auth,setAuth]=useState(false),[email,setEmail]=useState("admin@smarttaxi.local"),[password,setPassword]=useState("ChangeMe_2026!"),[orders,setOrders]=useState([]),[drivers,setDrivers]=useState([]),[stats,setStats]=useState(null),[error,setError]=useState("");
 async function doLogin(e){e.preventDefault();try{await login({email,password});setAuth(true);load()}catch(e){setError(e.message)}}
 async function load(){setOrders((await api("/api/orders")).orders);setDrivers((await api("/api/drivers")).drivers);setStats(await api("/api/finance/stats"))}
 useEffect(()=>{if(!auth)return;const s=createSocket();s.emit("join_dispatch");s.on("order_created",load);s.on("order_updated",load);return()=>s.disconnect()},[auth]);
 if(!auth)return <div className="page"><div className="card"><h1>Вход владельца</h1><form onSubmit={doLogin}><label>Email<input value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="btn">Войти</button>{error&&<p className="error">{error}</p>}</form></div></div>;
 return <div className="page"><button className="btn secondary" onClick={load}>Обновить</button><br/><br/><div className="grid3"><div className="stat"><strong>{stats?.today?.orders_total||0}</strong><span>Заказов</span></div><div className="stat"><strong>{stats?.today?.revenue_total||0} ₸</strong><span>Выручка</span></div><div className="stat"><strong>{stats?.drivers?.driver_debts_total||0} ₸</strong><span>Долги</span></div></div><br/><div className="grid"><div className="card"><h2>Заказы</h2><div className="list">{orders.map(o=><div className="item" key={o.id}><span className="badge">{o.status}</span><b>#{o.short_id}</b><p>{o.rider_name} · {o.rider_phone}</p><p>{o.pickup_text} → {o.dropoff_text}</p><p>{o.price} ₸ · {o.payment_method}</p></div>)}</div></div><div className="card"><h2>Водители</h2><div className="list">{drivers.map(d=><div className="item" key={d.id}><span className="badge">{d.status}</span><h3>{d.name}</h3><p>{d.car_model} · {d.plate}</p><p>Долг: {d.debt} ₸ · Баланс: {d.balance} ₸</p></div>)}</div></div></div></div>
}

function App(){const p=location.pathname;return <><Nav/>{p.startsWith("/driver")?<Driver/>:p.startsWith("/owner")?<Owner/>:<Client/>}</>}
createRoot(document.getElementById("root")).render(<App/>);
