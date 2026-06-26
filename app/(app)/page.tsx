'use client';
import { useState } from 'react';

const C = {
  bg:       'var(--color-bg)',
  surface:  'var(--color-surface)',
  card:     'var(--color-card)',
  cardEl:   'var(--color-card-el)',
  border:   'var(--color-border)',
  muted:    'var(--color-muted)',
  body:     'var(--color-body)',
  ink:      'var(--color-ink)',
  accent:   'var(--color-accent)',
  green:    'var(--color-green)',
  blue:     'var(--color-blue)',
  glass:    'var(--color-glass)',
  glassBorder: 'var(--color-glass-border)',
};

/* Vibrant mode colors matching new design system */
const VEHICLES = [
  { id:'bus',     label:'EDSA Bus',    sub:'Carousel rapid bus', speedN:22, speedR:12, fareBase:13, fareKm:2.2,  color:'#F97316' },
  { id:'jeepney', label:'Jeepney',     sub:'Katipunan route',    speedN:18, speedR:10, fareBase:11, fareKm:1.8,  color:'#EAB308' },
  { id:'uv',      label:'UV Express',  sub:'Air-conditioned van', speedN:28, speedR:16, fareBase:18, fareKm:3.2,  color:'#10B981' },
  { id:'mrt',     label:'MRT / LRT',   sub:'Fastest — rail only', speedN:45, speedR:40, fareBase:15, fareKm:1.5,  color:'#6366F1' },
];

const STOPS_EDSA = ['Monumento','Balintawak','Trinoma','Quezon Ave','Cubao','Ortigas','Guadalupe','Magallanes','Taft Ave'];
const STOPS_KATIP = ['Katipunan LRT2','Ateneo Gate','UP Diliman','Balara','Tandang Sora'];
const ALL_STOPS = [...STOPS_EDSA, ...STOPS_KATIP];

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

const GLOBAL = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
body{font-family:'Inter',system-ui,sans-serif;}
select{-webkit-appearance:none;}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.fade-in{animation:fadeIn 0.3s ease both;}
`;

function NavBar({onBack,label}:{onBack?:()=>void;label?:string}){
  return(
    <div style={{height:56,background:C.surface,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',padding:'0 20px',gap:12,flexShrink:0}}>
      {onBack&&(
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',padding:'6px 0',display:'flex',alignItems:'center',gap:4,color:C.ink}}>
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 4l-7 6 7 6"/></svg>
        </button>
      )}
      {!onBack && (
        <div style={{display:'flex',alignItems:'baseline'}}>
          <span style={{fontSize:20,fontWeight:800,letterSpacing:'-0.04em',background:'var(--gradient-primary)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Para</span>
          <span style={{fontSize:20,fontWeight:800,letterSpacing:'-0.04em',color:C.ink}}>Po</span>
        </div>
      )}
      {onBack&&<span style={{fontSize:15,fontWeight:700,color:C.ink,letterSpacing:'-0.01em'}}>{label||'ParaPo'}</span>}
      {!onBack&&<span style={{fontSize:10,fontWeight:700,color:'#6366F1',background:'rgba(99,102,241,0.1)',borderRadius:20,padding:'2px 8px',letterSpacing:'0.05em'}}>BETA</span>}
    </div>
  );
}

export default function DesignD(){
  const [screen,setScreen]=useState<Screen>('home');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [vehicle,setVehicle]=useState<Vehicle|null>(null);
  const [rush,setRush]=useState(()=>{const h=new Date().getHours();return(h>=7&&h<=9)||(h>=17&&h<=19);});
  const [dist,setDist]=useState(0);

  const eta=vehicle?Math.round((dist/(rush?vehicle.speedR:vehicle.speedN))*60):0;
  const fare=vehicle?Math.round((vehicle.fareBase+dist*vehicle.fareKm)*100)/100:0;

  /* ── HOME ─────────────────────────────────────────────────────────────── */
  if(screen==='home') return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:C.bg,fontFamily:'Inter,system-ui,sans-serif'}}>
      <style>{GLOBAL}</style>
      <NavBar/>
      <div style={{padding:'20px 20px 0',background:C.surface,borderBottom:`1px solid ${C.border}`}}>
        <p style={{fontSize:22,fontWeight:800,color:C.ink,letterSpacing:'-0.03em',margin:'0 0 4px'}}>Where are you headed?</p>
        <p style={{fontSize:13,color:C.muted,margin:'0 0 20px'}}>Compare routes · 2024 PH fare rates</p>

        {/* From / To */}
        <div style={{border:`1.5px solid ${C.border}`,borderRadius:14,background:C.surface,overflow:'hidden',marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',padding:'0 14px',gap:10,borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:10,height:10,borderRadius:'50%',border:'2.5px solid #10B981',background:C.surface,flexShrink:0}}/>
            <select value={from} onChange={e=>setFrom(e.target.value)} style={{flex:1,background:'transparent',border:'none',outline:'none',padding:'14px 0',fontSize:15,color:from?C.ink:C.muted,fontFamily:'inherit',fontWeight:from?600:400,cursor:'pointer'}}>
              <option value="">From stop</option>
              {ALL_STOPS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{display:'flex',alignItems:'center',padding:'0 14px',gap:10}}>
            <div style={{width:10,height:10,borderRadius:3,background:'#6366F1',flexShrink:0}}/>
            <select value={to} onChange={e=>setTo(e.target.value)} style={{flex:1,background:'transparent',border:'none',outline:'none',padding:'14px 0',fontSize:15,color:to?C.ink:C.muted,fontFamily:'inherit',fontWeight:to?600:400,cursor:'pointer'}}>
              <option value="">To stop</option>
              {ALL_STOPS.map(s=><option key={s}>{s}</option>)}
            </select>
            <button onClick={()=>{const t=from;setFrom(to);setTo(t);}} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,padding:'5px 7px',cursor:'pointer',color:C.muted,display:'flex',alignItems:'center'}}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5l4-4 4 4M11 9l-4 4-4-4"/></svg>
            </button>
          </div>
        </div>

        {/* Rush toggle */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:12,background:rush?'rgba(99,102,241,0.06)':C.card,border:`1px solid ${rush?'rgba(99,102,241,0.2)':C.border}`,marginBottom:20,transition:'all 0.2s'}}>
          <div>
            <p style={{margin:0,fontSize:14,fontWeight:600,color:C.ink}}>Rush hour</p>
            <p style={{margin:0,fontSize:12,color:C.muted}}>7–9 am · 5–7 pm</p>
          </div>
          <button onClick={()=>setRush(!rush)} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:8,padding:0}}>
            <div style={{width:44,height:26,borderRadius:13,background:rush?'#6366F1':C.border,position:'relative',transition:'background 0.2s',flexShrink:0}}>
              <div style={{width:20,height:20,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:rush?21:3,transition:'left 0.2s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)'}}/>
            </div>
          </button>
        </div>

        <button
          onClick={()=>{if(from&&to&&from!==to){setDist(getDist(from,to));setScreen('pick');}}}
          disabled={!from||!to||from===to}
          style={{width:'100%',border:'none',borderRadius:12,padding:'15px',fontSize:15,fontWeight:700,letterSpacing:'-0.01em',cursor:from&&to&&from!==to?'pointer':'default',marginBottom:24,transition:'all 0.15s',fontFamily:'inherit',
            background:from&&to&&from!==to?'var(--gradient-primary)':C.card,
            color:from&&to&&from!==to?'#fff':C.muted,
            boxShadow:from&&to&&from!==to?'0 4px 20px rgba(99,102,241,0.35)':'none',
          }}
        >
          See transport options
        </button>
      </div>

      {/* Corridors list */}
      <div style={{flex:1,padding:'20px 20px 32px'}}>
        <p style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:'0.08em',margin:'0 0 12px'}}>AVAILABLE CORRIDORS</p>
        <div style={{display:'flex',flexDirection:'column',gap:1,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',background:C.surface}}>
          {[
            {label:'EDSA Carousel',sub:'Monumento → Taft Ave',stops:9,color:'#F97316'},
            {label:'Katipunan Jeepney',sub:'Katipunan LRT2 → Tandang Sora',stops:5,color:'#6366F1'},
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
        <p style={{margin:0,fontSize:10,color:C.muted,textAlign:'center'}}>Seeded data · Not a live feed</p>
      </div>
    </div>
  );

  /* ── PICK ─────────────────────────────────────────────────────────────── */
  if(screen==='pick') return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:C.bg,fontFamily:'Inter,system-ui,sans-serif'}}>
      <style>{GLOBAL}</style>
      <NavBar onBack={()=>setScreen('home')} label="Choose transport"/>
      {/* Trip strip */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'12px 20px',display:'flex',alignItems:'center',gap:10}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,flexShrink:0}}>
          <div style={{width:8,height:8,borderRadius:'50%',border:'2px solid #10B981',background:C.surface}}/>
          <div style={{width:1,height:16,background:C.border}}/>
          <div style={{width:8,height:8,borderRadius:2,background:'#6366F1'}}/>
        </div>
        <div style={{flex:1}}>
          <p style={{margin:0,fontSize:14,fontWeight:500,color:C.ink}}>{from}</p>
          <p style={{margin:'4px 0 0',fontSize:14,fontWeight:500,color:C.ink}}>{to}</p>
        </div>
        <div style={{textAlign:'right'}}>
          <p style={{margin:0,fontSize:13,fontWeight:700,color:C.ink}}>{dist} km</p>
          <p style={{margin:'2px 0 0',fontSize:12,color:rush?'#6366F1':C.green,fontWeight:600}}>{rush?'Rush':'Normal'}</p>
        </div>
      </div>
      <div style={{flex:1,padding:'16px 20px 32px',overflowY:'auto'}}>
        <p style={{fontSize:13,color:C.muted,margin:'0 0 16px'}}>Tap a vehicle to see your full route</p>
        <div className="fade-in" style={{display:'flex',flexDirection:'column',gap:10}}>
          {VEHICLES.map(v=>{
            const spd=rush?v.speedR:v.speedN;
            const mins=Math.round((dist/spd)*60);
            const estFare=Math.round((v.fareBase+dist*v.fareKm)*100)/100;
            return(
              <button key={v.id} onClick={()=>{setVehicle(v);setScreen('result');}}
                style={{background:C.card,border:`1.5px solid ${C.border}`,borderRadius:14,padding:0,cursor:'pointer',textAlign:'left',display:'block',overflow:'hidden',transition:'all 0.15s',fontFamily:'inherit'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor=v.color;(e.currentTarget as HTMLButtonElement).style.boxShadow=`0 0 0 1px ${v.color}40`;}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor=C.border;(e.currentTarget as HTMLButtonElement).style.boxShadow='none';}}
              >
                <div style={{height:3,background:v.color,borderRadius:'14px 14px 0 0'}}/>
                <div style={{display:'flex',alignItems:'center',gap:0}}>
                  <div style={{flex:1,padding:'14px 16px',display:'flex',alignItems:'center',gap:14}}>
                    <div style={{minWidth:56,flexShrink:0}}>
                      <p style={{margin:0,fontSize:30,fontWeight:800,color:C.ink,letterSpacing:'-0.04em',lineHeight:1}}>{mins}</p>
                      <p style={{margin:'2px 0 0',fontSize:11,color:C.muted}}>min</p>
                    </div>
                    <div style={{width:1,height:40,background:C.border,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <p style={{margin:0,fontSize:15,fontWeight:700,color:C.ink}}>{v.label}</p>
                      <p style={{margin:'2px 0 0',fontSize:12,color:C.muted}}>{v.sub}</p>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <p style={{margin:0,fontSize:16,fontWeight:800,color:v.color}}>₱{estFare.toFixed(2)}</p>
                      <p style={{margin:'2px 0 0',fontSize:11,color:C.muted}}>est. fare</p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p style={{fontSize:11,color:C.muted,margin:'20px 0 0',lineHeight:1.6}}>
          Seeded / simulated data. Fares are estimates only.
        </p>
      </div>
    </div>
  );

  /* ── RESULT ────────────────────────────────────────────────────────────── */
  return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:C.bg,fontFamily:'Inter,system-ui,sans-serif'}}>
      <style>{GLOBAL}</style>
      <NavBar onBack={()=>setScreen('pick')} label={vehicle?.label}/>
      <div style={{height:3,background:vehicle?.color}}/>

      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'12px 20px',display:'flex',alignItems:'center',gap:12}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,flexShrink:0}}>
          <div style={{width:8,height:8,borderRadius:'50%',border:'2px solid #10B981',background:C.surface}}/>
          <div style={{width:1,height:16,background:C.border}}/>
          <div style={{width:8,height:8,borderRadius:2,background:'#6366F1'}}/>
        </div>
        <div style={{flex:1}}>
          <p style={{margin:0,fontSize:14,color:C.ink,fontWeight:500}}>{from}</p>
          <p style={{margin:'4px 0 0',fontSize:14,color:C.ink,fontWeight:500}}>{to}</p>
        </div>
        <button onClick={()=>setScreen('pick')} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 12px',fontSize:12,color:C.body,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Change</button>
      </div>

      <div style={{flex:1,padding:'20px',overflowY:'auto'}} className="fade-in">
        {/* Big ETA / Fare */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:'16px'}}>
            <p style={{margin:'0 0 6px',fontSize:10,fontWeight:700,color:C.muted,letterSpacing:'0.06em'}}>ETA</p>
            <div style={{display:'flex',alignItems:'baseline',gap:4}}>
              <span style={{fontSize:44,fontWeight:800,color:C.ink,letterSpacing:'-0.04em',lineHeight:1}}>{eta}</span>
              <span style={{fontSize:14,color:C.muted}}>min</span>
            </div>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:'16px'}}>
            <p style={{margin:'0 0 6px',fontSize:10,fontWeight:700,color:C.muted,letterSpacing:'0.06em'}}>FARE</p>
            <p style={{margin:0,fontSize:32,fontWeight:800,color:vehicle?.color??C.accent,letterSpacing:'-0.03em',lineHeight:1}}>₱{fare.toFixed(2)}</p>
            <p style={{margin:'4px 0 0',fontSize:11,color:C.muted}}>estimated</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:20}}>
          {[
            {l:'DISTANCE',v:`${dist} km`},
            {l:'TRAFFIC',v:rush?'Heavy':'Clear'},
            {l:'AVG SPEED',v:`${rush?(vehicle?.speedR??0):(vehicle?.speedN??0)} km/h`},
          ].map(s=>(
            <div key={s.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 10px',textAlign:'center'}}>
              <p style={{margin:'0 0 4px',fontSize:9,fontWeight:700,color:C.muted,letterSpacing:'0.06em'}}>{s.l}</p>
              <p style={{margin:0,fontSize:14,fontWeight:700,color:C.ink}}>{s.v}</p>
            </div>
          ))}
        </div>

        {/* Other options */}
        <p style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:'0.08em',margin:'0 0 10px'}}>OTHER OPTIONS</p>
        <div style={{display:'flex',flexDirection:'column',gap:1,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',background:C.surface,marginBottom:20}}>
          {VEHICLES.filter(v=>v.id!==vehicle?.id).map((v,i,arr)=>{
            const mins=Math.round((dist/(rush?v.speedR:v.speedN))*60);
            const estFare=Math.round((v.fareBase+dist*v.fareKm)*100)/100;
            return(
              <button key={v.id} onClick={()=>setVehicle(v)}
                style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',background:'none',border:'none',borderBottom:i<arr.length-1?`1px solid ${C.border}`:'none',cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}
              >
                <div style={{width:3,height:32,borderRadius:2,background:v.color,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <p style={{margin:0,fontSize:14,fontWeight:600,color:C.ink}}>{v.label}</p>
                  <p style={{margin:'1px 0 0',fontSize:12,color:C.muted}}>{v.sub}</p>
                </div>
                <div style={{textAlign:'right'}}>
                  <p style={{margin:0,fontSize:14,fontWeight:700,color:C.ink}}>{mins} min</p>
                  <p style={{margin:'1px 0 0',fontSize:12,color:v.color,fontWeight:600}}>₱{estFare.toFixed(2)}</p>
                </div>
                <svg width="16" height="16" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round"><path d="M6 4l5 4-5 4"/></svg>
              </button>
            );
          })}
        </div>

        {/* Trip details */}
        <p style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:'0.08em',margin:'0 0 10px'}}>TRIP DETAILS</p>
        <div style={{border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',background:C.surface,marginBottom:20}}>
          {[
            ['Departure',from],['Arrival',to],['Vehicle',vehicle?.label??''],
            ['Route type',vehicle?.sub??''],['Travel time',`${eta} min`],['Est. fare',`₱${fare.toFixed(2)}`],
          ].map(([l,v],i,a)=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:i<a.length-1?`1px solid ${C.border}`:'none',background:C.surface}}>
              <span style={{fontSize:13,color:C.muted}}>{l}</span>
              <span style={{fontSize:13,fontWeight:600,color:C.ink}}>{v}</span>
            </div>
          ))}
        </div>

        <button onClick={()=>{setFrom('');setTo('');setVehicle(null);setScreen('home');}}
          style={{width:'100%',border:'none',borderRadius:12,padding:'15px',fontSize:15,fontWeight:700,cursor:'pointer',letterSpacing:'-0.01em',fontFamily:'inherit',background:'var(--gradient-primary)',color:'#fff',boxShadow:'0 4px 20px rgba(99,102,241,0.35)'}}>
          Plan another trip
        </button>
        <p style={{fontSize:10,color:C.muted,textAlign:'center',marginTop:16}}>Seeded data · Not a live feed</p>
      </div>
    </div>
  );
}
