'use client';
import { useState, useEffect } from 'react';

// Palette — less is more. Real apps don't use 8 shades of brown.
const C = {
  bg:       '#F4F0E8',   // warm page bg
  surface:  '#FFFFFF',
  card:     '#F9F7F2',   // barely-there card bg
  border:   '#E2DBD0',
  muted:    '#A89E8E',
  body:     '#3D3530',
  ink:      '#1A1410',
  header:   '#1A1410',   // near-black, not brown
  accent:   '#D05A28',   // single rust accent
  green:    '#2D7A4F',
  blue:     '#1A5FA8',
};

const STOPS_EDSA = ['Monumento','Balintawak','Trinoma','Quezon Ave','Cubao','Ortigas','Guadalupe','Magallanes','Taft Ave'];
const STOPS_KATIP = ['Katipunan LRT2','Ateneo Gate','UP Diliman','Balara','Tandang Sora'];
const ALL_STOPS = [...STOPS_EDSA, ...STOPS_KATIP];

const VEHICLES = [
  { id:'bus',     label:'EDSA Bus',    sub:'Carousel rapid bus', speedN:22, speedR:12, fareBase:13, fareKm:2.2,  color:'#D05A28', lineColor:'#E87040' },
  { id:'jeepney', label:'Jeepney',     sub:'Katipunan route',    speedN:18, speedR:10, fareBase:11, fareKm:1.8,  color:'#B8962E', lineColor:'#D4AF37' },
  { id:'uv',      label:'UV Express',  sub:'Air-conditioned van', speedN:28, speedR:16, fareBase:18, fareKm:3.2,  color:'#2D7A4F', lineColor:'#3A9D65' },
  { id:'mrt',     label:'MRT / LRT',   sub:'Fastest — rail only', speedN:45, speedR:40, fareBase:15, fareKm:1.5,  color:'#1A5FA8', lineColor:'#2B7FDD' },
];

const STOP_COORDS: Record<string, [number,number]> = {
  'Monumento':[14.6543,120.984],'Balintawak':[14.651,120.9842],'Trinoma':[14.652,121.032],
  'Quezon Ave':[14.6448,121.038],'Cubao':[14.6197,121.051],'Ortigas':[14.5875,121.0584],
  'Guadalupe':[14.567,121.0469],'Magallanes':[14.5402,121.0039],'Taft Ave':[14.5545,120.9942],
  'Katipunan LRT2':[14.6284,121.073],'Ateneo Gate':[14.6395,121.0775],'UP Diliman':[14.654,121.0685],
  'Balara':[14.67,121.072],'Tandang Sora':[14.682,121.044],
};

function hav(a:[number,number],b:[number,number]){
  const R=6371,dLat=(b[0]-a[0])*Math.PI/180,dLng=(b[1]-a[1])*Math.PI/180;
  const s=Math.sin(dLat/2)**2+Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

function getDist(from:string,to:string){
  const iA=STOPS_EDSA.indexOf(from),iB=STOPS_EDSA.indexOf(to);
  if(iA!==-1&&iB!==-1){
    const lo=Math.min(iA,iB),hi=Math.max(iA,iB);
    let d=0;for(let i=lo;i<hi;i++)d+=hav(STOP_COORDS[STOPS_EDSA[i]],STOP_COORDS[STOPS_EDSA[i+1]]);
    return Math.round(d*10)/10;
  }
  const a=STOP_COORDS[from],b=STOP_COORDS[to];
  return a&&b?Math.round(hav(a,b)*10)/10:5;
}

type Screen='home'|'pick'|'result';
type Vehicle=typeof VEHICLES[0];

// ── shared nav bar ──────────────────────────────────────────────────────────
function NavBar({onBack,label}:{onBack?:()=>void;label?:string}){
  return(
    <div style={{height:52,background:C.surface,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',padding:'0 16px',gap:12,flexShrink:0}}>
      {onBack&&(
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',padding:'6px 0',display:'flex',alignItems:'center',gap:4,color:C.ink}}>
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 4l-7 6 7 6"/></svg>
        </button>
      )}
      <span style={{fontFamily:'var(--font)',fontSize:16,fontWeight:700,color:C.ink,letterSpacing:'-0.01em'}}>{label||'ParaPo'}</span>
      {!onBack&&<span style={{fontSize:10,fontWeight:600,color:C.accent,background:'#FBE9E0',borderRadius:4,padding:'2px 6px',letterSpacing:'0.04em'}}>BETA</span>}
      {!onBack&&<a href="/auth" style={{marginLeft:'auto',fontSize:12,color:C.muted,textDecoration:'none',fontFamily:'Inter,sans-serif',fontWeight:500}}>Sign out</a>}
    </div>
  );
}

export default function DesignD(){
  const [screen,setScreen]=useState<Screen>('home');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [vehicle,setVehicle]=useState<Vehicle|null>(null);
  const [rush,setRush]=useState(false);
  const [dist,setDist]=useState(0);

  useEffect(()=>{const h=new Date().getHours();setRush((h>=7&&h<=9)||(h>=17&&h<=19));});

  const eta=vehicle?Math.round((dist/(rush?vehicle.speedR:vehicle.speedN))*60):0;
  const fare=vehicle?Math.round((vehicle.fareBase+dist*vehicle.fareKm)*100)/100:0;

  // ── SCREEN: HOME ──────────────────────────────────────────────────────────
  if(screen==='home') return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:C.bg,fontFamily:'"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      {/* Google Fonts Inter */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}select{-webkit-appearance:none;-moz-appearance:none;appearance:none;}`}</style>
      <NavBar/>

      {/* Hero */}
      <div style={{padding:'24px 20px 0',background:C.surface,borderBottom:`1px solid ${C.border}`}}>
        <p style={{fontSize:22,fontWeight:700,color:C.ink,letterSpacing:'-0.02em',margin:'0 0 4px'}}>
          Where are you headed?
        </p>
        <p style={{fontSize:13,color:C.muted,margin:'0 0 20px'}}>Pick two stops to compare routes</p>

        {/* From / To */}
        <div style={{border:`1.5px solid ${C.border}`,borderRadius:12,background:C.surface,overflow:'hidden',marginBottom:16}}>
          {/* From row */}
          <div style={{display:'flex',alignItems:'center',padding:'0 14px',gap:10,borderBottom:`1px solid ${C.border}`}}>
            <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4" fill="none" stroke={C.green} strokeWidth="2"/><circle cx="6" cy="6" r="1.5" fill={C.green}/></svg>
            <select value={from} onChange={e=>setFrom(e.target.value)} style={{flex:1,background:'transparent',border:'none',outline:'none',padding:'14px 0',fontSize:15,color:from?C.ink:C.muted,fontFamily:'inherit',fontWeight:from?500:400,cursor:'pointer'}}>
              <option value="">From</option>
              {ALL_STOPS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          {/* Swap row */}
          <div style={{display:'flex',alignItems:'center',padding:'0 14px',gap:10}}>
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="3" y="3" width="6" height="6" rx="1" fill={C.accent}/></svg>
            <select value={to} onChange={e=>setTo(e.target.value)} style={{flex:1,background:'transparent',border:'none',outline:'none',padding:'14px 0',fontSize:15,color:to?C.ink:C.muted,fontFamily:'inherit',fontWeight:to?500:400,cursor:'pointer'}}>
              <option value="">To</option>
              {ALL_STOPS.map(s=><option key={s}>{s}</option>)}
            </select>
            <button onClick={()=>{const t=from;setFrom(to);setTo(t);}} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 6px',cursor:'pointer',color:C.muted,fontSize:12,display:'flex',alignItems:'center'}}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5l4-4 4 4M11 9l-4 4-4-4"/></svg>
            </button>
          </div>
        </div>

        {/* Rush toggle */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:10,background:rush?'#FBE9E0':C.card,border:`1px solid ${rush?'#EFC4AA':C.border}`,marginBottom:20,transition:'background 0.2s'}}>
          <div>
            <p style={{margin:0,fontSize:14,fontWeight:500,color:C.ink}}>Rush hour</p>
            <p style={{margin:0,fontSize:12,color:C.muted}}>7–9 am · 5–7 pm</p>
          </div>
          <button onClick={()=>setRush(!rush)} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:8,padding:0}}>
            <span style={{fontSize:12,color:rush?C.accent:C.muted,fontWeight:500}}>{rush?'On':'Off'}</span>
            <div style={{width:42,height:24,borderRadius:12,background:rush?C.accent:'#D9D4CC',position:'relative',transition:'background 0.2s',flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:rush?21:3,transition:'left 0.2s',boxShadow:'0 1px 4px rgba(0,0,0,0.18)'}}/>
            </div>
          </button>
        </div>

        <button
          onClick={()=>{if(from&&to&&from!==to){setDist(getDist(from,to));setScreen('pick');}}}
          disabled={!from||!to||from===to}
          style={{width:'100%',background:from&&to&&from!==to?C.ink:'#D1CCC3',color:'#fff',border:'none',borderRadius:10,padding:'15px',fontSize:15,fontWeight:600,letterSpacing:'-0.01em',cursor:from&&to&&from!==to?'pointer':'default',marginBottom:24,transition:'background 0.15s'}}
        >
          See transport options
        </button>
      </div>

      {/* Route list */}
      <div style={{flex:1,padding:'20px 20px 32px'}}>
        <p style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:'0.08em',margin:'0 0 12px'}}>AVAILABLE CORRIDORS</p>
        <div style={{display:'flex',flexDirection:'column',gap:1,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',background:C.surface}}>
          {[
            {label:'EDSA Carousel',sub:'Monumento → Taft Ave',stops:9,color:C.accent},
            {label:'Katipunan Jeepney',sub:'Katipunan LRT2 → Tandang Sora',stops:5,color:C.blue},
          ].map((r,i)=>(
            <div key={r.label} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',background:C.surface,borderBottom:i===0?`1px solid ${C.border}`:'none'}}>
              <div style={{width:4,height:36,borderRadius:2,background:r.color,flexShrink:0}}/>
              <div style={{flex:1}}>
                <p style={{margin:0,fontSize:14,fontWeight:600,color:C.ink}}>{r.label}</p>
                <p style={{margin:'2px 0 0',fontSize:12,color:C.muted}}>{r.sub}</p>
              </div>
              <span style={{fontSize:12,color:C.muted}}>{r.stops} stops</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:'10px 20px',borderTop:`1px solid ${C.border}`,background:C.surface}}>
        <p style={{margin:0,fontSize:11,color:C.muted,textAlign:'center'}}>Seeded data · Not a live feed</p>
      </div>
    </div>
  );

  // ── SCREEN: VEHICLE PICKER ────────────────────────────────────────────────
  if(screen==='pick') return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:C.bg,fontFamily:'"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}`}</style>
      <NavBar onBack={()=>setScreen('home')} label="Choose transport"/>

      {/* Route summary strip */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'12px 20px',display:'flex',alignItems:'center',gap:10}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,flexShrink:0}}>
          <div style={{width:8,height:8,borderRadius:'50%',border:`2px solid ${C.green}`,background:C.surface}}/>
          <div style={{width:1,height:16,background:C.border}}/>
          <div style={{width:8,height:8,borderRadius:2,background:C.accent}}/>
        </div>
        <div style={{flex:1}}>
          <p style={{margin:0,fontSize:14,fontWeight:500,color:C.ink}}>{from}</p>
          <p style={{margin:'4px 0 0',fontSize:14,fontWeight:500,color:C.ink}}>{to}</p>
        </div>
        <div style={{textAlign:'right'}}>
          <p style={{margin:0,fontSize:13,fontWeight:600,color:C.ink}}>{dist} km</p>
          <p style={{margin:'2px 0 0',fontSize:12,color:rush?C.accent:C.green,fontWeight:500}}>{rush?'Rush hour':'Normal'}</p>
        </div>
      </div>

      <div style={{flex:1,padding:'16px 20px 32px',overflowY:'auto'}}>
        <p style={{fontSize:13,color:C.muted,margin:'0 0 16px'}}>Tap a vehicle to see your full route</p>

        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {VEHICLES.map(v=>{
            const spd=rush?v.speedR:v.speedN;
            const mins=Math.round((dist/spd)*60);
            const estFare=Math.round((v.fareBase+dist*v.fareKm)*100)/100;
            return(
              <button key={v.id} onClick={()=>{setVehicle(v);setScreen('result');}}
                style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:0,cursor:'pointer',textAlign:'left',display:'block',overflow:'hidden',transition:'box-shadow 0.15s'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.boxShadow='0 2px 12px rgba(0,0,0,0.1)';}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.boxShadow='none';}}
              >
                {/* Left color bar via border-left — cleaner than a separate div */}
                <div style={{display:'flex',alignItems:'center',gap:0}}>
                  <div style={{width:4,background:v.color,alignSelf:'stretch',flexShrink:0,borderRadius:'12px 0 0 12px'}}/>
                  <div style={{flex:1,padding:'16px 16px 16px 14px',display:'flex',alignItems:'center',gap:14}}>
                    {/* ETA — the hero number, left-aligned */}
                    <div style={{minWidth:52,flexShrink:0}}>
                      <p style={{margin:0,fontSize:28,fontWeight:700,color:C.ink,letterSpacing:'-0.03em',lineHeight:1}}>{mins}</p>
                      <p style={{margin:'2px 0 0',fontSize:11,color:C.muted}}>min</p>
                    </div>
                    {/* Divider */}
                    <div style={{width:1,height:40,background:C.border,flexShrink:0}}/>
                    {/* Details */}
                    <div style={{flex:1}}>
                      <p style={{margin:0,fontSize:15,fontWeight:600,color:C.ink}}>{v.label}</p>
                      <p style={{margin:'2px 0 0',fontSize:12,color:C.muted}}>{v.sub}</p>
                    </div>
                    {/* Fare */}
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <p style={{margin:0,fontSize:15,fontWeight:600,color:C.ink}}>₱{estFare.toFixed(2)}</p>
                      <p style={{margin:'2px 0 0',fontSize:11,color:C.muted}}>est. fare</p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p style={{fontSize:11,color:C.muted,margin:'20px 0 0',lineHeight:1.6}}>
          ⚠ Seeded / simulated data. Not a live operator feed. Fares are estimates only.
        </p>
      </div>
    </div>
  );

  // ── SCREEN: RESULT ────────────────────────────────────────────────────────
  return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:C.bg,fontFamily:'"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}`}</style>
      <NavBar onBack={()=>setScreen('pick')} label={vehicle?.label}/>

      {/* Vehicle color bar */}
      <div style={{height:3,background:vehicle?.color}}/>

      {/* Route header */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',display:'flex',alignItems:'center',gap:12}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,flexShrink:0}}>
          <div style={{width:8,height:8,borderRadius:'50%',border:`2px solid ${C.green}`,background:C.surface}}/>
          <div style={{width:1,height:16,background:C.border}}/>
          <div style={{width:8,height:8,borderRadius:2,background:C.accent}}/>
        </div>
        <div style={{flex:1}}>
          <p style={{margin:0,fontSize:14,color:C.ink,fontWeight:500}}>{from}</p>
          <p style={{margin:'4px 0 0',fontSize:14,color:C.ink,fontWeight:500}}>{to}</p>
        </div>
        <button onClick={()=>setScreen('pick')} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 12px',fontSize:12,color:C.body,cursor:'pointer',fontFamily:'inherit',fontWeight:500}}>
          Change
        </button>
      </div>

      <div style={{flex:1,padding:'20px',overflowY:'auto'}}>
        {/* Big ETA / Fare */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px 16px'}}>
            <p style={{margin:'0 0 8px',fontSize:11,fontWeight:600,color:C.muted,letterSpacing:'0.06em'}}>ETA</p>
            <p style={{margin:0,fontSize:44,fontWeight:700,color:C.ink,letterSpacing:'-0.04em',lineHeight:1}}>{eta}</p>
            <p style={{margin:'4px 0 0',fontSize:13,color:C.muted}}>minutes</p>
          </div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px 16px'}}>
            <p style={{margin:'0 0 8px',fontSize:11,fontWeight:600,color:C.muted,letterSpacing:'0.06em'}}>FARE</p>
            <p style={{margin:0,fontSize:32,fontWeight:700,color:vehicle?.color??C.accent,letterSpacing:'-0.03em',lineHeight:1}}>₱{fare.toFixed(2)}</p>
            <p style={{margin:'4px 0 0',fontSize:13,color:C.muted}}>estimated</p>
          </div>
        </div>

        {/* Secondary row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:24}}>
          {[
            {l:'DISTANCE',v:`${dist} km`},
            {l:'TRAFFIC',v:rush?'Heavy':'Clear'},
            {l:'AVG SPEED',v:`${rush?(vehicle?.speedR??0):(vehicle?.speedN??0)} km/h`},
          ].map(s=>(
            <div key={s.l} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 10px',textAlign:'center'}}>
              <p style={{margin:'0 0 4px',fontSize:10,fontWeight:600,color:C.muted,letterSpacing:'0.06em'}}>{s.l}</p>
              <p style={{margin:0,fontSize:13,fontWeight:600,color:C.ink}}>{s.v}</p>
            </div>
          ))}
        </div>

        {/* Compare section */}
        <p style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:'0.08em',margin:'0 0 10px'}}>OTHER OPTIONS</p>
        <div style={{display:'flex',flexDirection:'column',gap:1,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',background:C.surface,marginBottom:24}}>
          {VEHICLES.filter(v=>v.id!==vehicle?.id).map((v,i,arr)=>{
            const mins=Math.round((dist/(rush?v.speedR:v.speedN))*60);
            const estFare=Math.round((v.fareBase+dist*v.fareKm)*100)/100;
            return(
              <button key={v.id} onClick={()=>setVehicle(v)}
                style={{display:'flex',alignItems:'center',gap:14,padding:'13px 16px',background:'none',border:'none',borderBottom:i<arr.length-1?`1px solid ${C.border}`:'none',cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'background 0.1s'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background=C.card;}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='none';}}
              >
                <div style={{width:3,height:32,borderRadius:2,background:v.color,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <p style={{margin:0,fontSize:14,fontWeight:500,color:C.ink}}>{v.label}</p>
                  <p style={{margin:'1px 0 0',fontSize:12,color:C.muted}}>{v.sub}</p>
                </div>
                <div style={{textAlign:'right'}}>
                  <p style={{margin:0,fontSize:14,fontWeight:600,color:C.ink}}>{mins} min</p>
                  <p style={{margin:'1px 0 0',fontSize:12,color:C.muted}}>₱{estFare.toFixed(2)}</p>
                </div>
                <svg width="16" height="16" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round"><path d="M6 4l5 4-5 4"/></svg>
              </button>
            );
          })}
        </div>

        {/* Trip detail sheet */}
        <p style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:'0.08em',margin:'0 0 10px'}}>TRIP DETAILS</p>
        <div style={{border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',background:C.surface,marginBottom:24}}>
          {[
            ['Departure',from],
            ['Arrival',to],
            ['Vehicle',vehicle?.label??''],
            ['Route type',vehicle?.sub??''],
            ['Travel time',`${eta} min`],
            ['Est. fare',`₱${fare.toFixed(2)}`],
          ].map(([l,v],i,a)=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 16px',borderBottom:i<a.length-1?`1px solid ${C.border}`:'none'}}>
              <span style={{fontSize:13,color:C.muted}}>{l}</span>
              <span style={{fontSize:13,fontWeight:500,color:C.ink}}>{v}</span>
            </div>
          ))}
        </div>

        <button onClick={()=>{setFrom('');setTo('');setVehicle(null);setScreen('home');}}
          style={{width:'100%',background:C.ink,color:'#fff',border:'none',borderRadius:10,padding:'15px',fontSize:15,fontWeight:600,cursor:'pointer',letterSpacing:'-0.01em',fontFamily:'inherit'}}>
          Plan another trip
        </button>
      </div>

      <div style={{padding:'10px 20px',borderTop:`1px solid ${C.border}`,background:C.surface}}>
        <p style={{margin:0,fontSize:11,color:C.muted,textAlign:'center'}}>Seeded data · Not a live feed</p>
      </div>
    </div>
  );
}
