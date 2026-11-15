'use client';
import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {Route,Milestone,Footprints,Bike,Search,ArrowUpRight,ChevronRight,Download,RefreshCw} from 'lucide-react';
import {boxesMeet,distanceLabel,featureRouteKind,matchesRouteFilter,osmFeatureUrl,readTransport,roadVisible,roadWidth,routeGroup,transportBounds,transportId,transportName,type TransportFeature,type TransportCollection} from '../lib/transport';

type Bundle={roads:TransportCollection;routes:TransportCollection;metadata:any};
const empty:TransportCollection={type:'FeatureCollection',features:[]};
function textNode(tag:string,text:string){const el=document.createElement(tag);el.textContent=text;return el;}
function popup(f:TransportFeature,locale='uz'){
 const en:Record<string,string>={'Asosiy avtomobil yo‘li':'Main road','Alpinizm yo‘nalishi':'Mountaineering route','Tog‘ so‘qmog‘i':'Trail segment','Tog‘ piyoda marshruti':'Hiking route','Piyoda marshruti':'Walking route','OSMdagi manba ↗':'OSM source ↗','OSMdagi yozuv; holat va kirish joyida tekshiriladi.':'OSM record; check conditions and access locally.','xaritadagi qism':'mapped section','Qoplama:':'Surface:','OSM kirish belgisi:':'OSM access tag:','OSM qiyinlik belgisi:':'OSM difficulty tag:'};
 const ru:Record<string,string>={'Asosiy avtomobil yo‘li':'Основная дорога','Alpinizm yo‘nalishi':'Альпинистский маршрут','Tog‘ so‘qmog‘i':'Участок тропы','Tog‘ piyoda marshruti':'Пеший горный маршрут','Piyoda marshruti':'Пеший маршрут','OSMdagi manba ↗':'Источник OSM ↗','OSMdagi yozuv; holat va kirish joyida tekshiriladi.':'Запись OSM; состояние и доступ уточняются на месте.','xaritadagi qism':'участок на карте','Qoplama:':'Покрытие:','OSM kirish belgisi:':'Тег доступа OSM:','OSM qiyinlik belgisi:':'Тег сложности OSM:'};
 const translated=(v:string)=>Object.entries(locale==='en'?en:locale==='ru'?ru:{}).reduce((s,[a,b])=>s.replaceAll(a,b),v);
 const node=(tag:string,value:string)=>textNode(tag,translated(value));
 const p=f.properties,root:any=document.createElement('div');root.className='transport-popup';
 root.append(node('small',(p.route||p.kind==='trail')?featureRouteKind(f).label:'Asosiy avtomobil yo‘li'),textNode('strong',locale==='uz'?transportName(f):p['name:'+locale]||p.name||transportName(f)));
 if(p.name&&p.name!==transportName(f))root.append(node('small',p.name));
 if(p.ref&&p.ref!==p.name)root.append(node('span',p.ref));
 if(p.from||p.to)root.append(node('p',[p.from,p.to].filter(Boolean).join(' → ')));
 if(p.lengthKm!=null)root.append(node('p',`${distanceLabel(Number(p.lengthKm))} · xaritadagi qism`));
 if(p.surface)root.append(node('small',`Qoplama: ${p.surface}`));
 if(p.state==='proposed')root.append(node('small','OSMda taklif etilgan marshrut sifatida belgilangan.'));
 if(p.access&&p.access!=='yes')root.append(node('small',`OSM kirish belgisi: ${p.access}`));
 if(p.sac_scale)root.append(node('small',`OSM qiyinlik belgisi: ${p.sac_scale}`));
 if(p.route||p.kind==='trail')root.append(node('small','OSMdagi yozuv; holat va kirish joyida tekshiriladi.'));
 const url=osmFeatureUrl(f);if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=translated('OSMdagi manba ↗');root.append(a);}return root;
}
export function useTransport(mapRef:RefObject<any>,active:boolean,regionId:string,locale='uz'){
 const [bundle,setBundle]=useState<Bundle|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [roadsOn,setRoadsOn]=useState(true),[routesOn,setRoutesOn]=useState(true),[group,setGroup]=useState('all'),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
 const rendererRef=useRef<{map:any;roads:any;roadHits:any;routes:any}|null>(null);
 useEffect(()=>{
  if(!active||bundle)return;const c=new AbortController();setError('');
  const read=async(path:string)=>{const r=await fetch('/transport/'+path,{signal:c.signal});if(!r.ok)throw new Error('Yo‘llar ma’lumoti yuklanmadi.');return r.json();};
  Promise.all([read('roads.geojson'),read('routes.geojson'),read('metadata.json')]).then(([roads,routes,metadata])=>setBundle({roads:readTransport(roads),routes:readTransport(routes),metadata})).catch(e=>{if(e.name!=='AbortError')setError('Yo‘llar va marshrutlar yuklanmadi. Qayta urinib ko‘ring.');});
  return()=>c.abort();
 },[active,attempt,bundle]);
 const regionRoads=useMemo(()=>(bundle?.roads||empty).features.filter(f=>regionId==='all'||f.properties.regionIds?.includes(regionId)),[bundle,regionId]);
 const regionRoutes=useMemo(()=>(bundle?.routes||empty).features.filter(f=>regionId==='all'||f.properties.regionIds?.includes(regionId)),[bundle,regionId]);
 const visibleRoutes=useMemo(()=>regionRoutes.filter(f=>matchesRouteFilter(f,group)&&(!search||(transportName(f)+' '+(f.properties.name||'')+' '+(f.properties.ref||'')+' '+(f.properties.from||'')+' '+(f.properties.to||'')).toLocaleLowerCase().includes(search.toLocaleLowerCase()))),[regionRoutes,group,search]);
 useEffect(()=>{if(group!=='all'&&!regionRoutes.some(f=>matchesRouteFilter(f,group)))setGroup('all');},[regionRoutes,group]);
 useEffect(()=>{if(selected&&!visibleRoutes.some(f=>transportId(f)===selected))setSelected('');},[visibleRoutes,selected]);
 useEffect(()=>{
  const m=mapRef.current;if(!active||!m||!bundle)return;const L=window.L;
  for(const [name,z] of [['transportRoads',460],['transportRoadHits',465],['transportRoutes',470]] as const){if(!m.getPane(name))m.createPane(name);m.getPane(name).style.zIndex=z;}
  // Keep renderers for the life of the Leaflet map. Replacing them during a
  // zoom can leave a queued Leaflet redraw referencing a destroyed canvas.
  if(!rendererRef.current||rendererRef.current.map!==m)rendererRef.current={map:m,roads:L.canvas({pane:'transportRoads',padding:.3}),roadHits:L.svg({pane:'transportRoadHits',padding:.3}),routes:L.svg({pane:'transportRoutes',padding:.3})};
  const roadRenderer=rendererRef.current.roads,roadHitRenderer=rendererRef.current.roadHits,routeRenderer=rendererRef.current.routes;
  m.getPane('transportRoads').style.pointerEvents='none';
  const roadGroup=L.layerGroup().addTo(m),routeLayer=L.layerGroup().addTo(m);
  const narrow=m.getSize().x<700,popupOptions={maxWidth:280,autoPanPaddingTopLeft:narrow?[20,110]:[30,180],autoPanPaddingBottomRight:narrow?[20,300]:[315,350]};
  let drawing=false;
  const draw=()=>{
   if(drawing||m._popup?.isOpen())return;drawing=true;
   roadGroup.clearLayers();routeLayer.clearLayers();const z=m.getZoom(),b=m.getBounds().pad(.2),box=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
   const roads=roadsOn?regionRoads.filter(f=>roadVisible(f,z)&&boxesMeet(transportBounds(f),box)):[];
   if(roads.length){
    L.geoJSON({type:'FeatureCollection',features:roads},{renderer:roadRenderer,interactive:false,style:(f:TransportFeature)=>({color:'#fffdf8',weight:roadWidth(f,z)+2,opacity:.85,lineCap:'round'})}).addTo(roadGroup);
    L.geoJSON({type:'FeatureCollection',features:roads},{renderer:roadRenderer,interactive:false,style:(f:TransportFeature)=>({color:f.properties.highway?.startsWith('primary')?'#798b9a':'#4d667b',weight:roadWidth(f,z),opacity:.95,lineCap:'round'})}).addTo(roadGroup);
    if(z>=9)L.geoJSON({type:'FeatureCollection',features:roads},{renderer:roadHitRenderer,style:{color:'#4d667b',weight:10,opacity:0},onEachFeature:(f:TransportFeature,l:any)=>{l.bindPopup(()=>popup(f,locale),popupOptions);l.bindTooltip(f.properties.ref||transportName(f),{sticky:true,className:'transport-road-tip'});}}).addTo(roadGroup);
   }
   const routes=routesOn?visibleRoutes.filter(f=>(f.properties.kind!=='trail'||z>=9)&&boxesMeet(transportBounds(f),box)):[];
   for(const f of routes){const chosen=selected===transportId(f),color=featureRouteKind(f).color;
    L.geoJSON(f,{renderer:routeRenderer,interactive:false,style:{color:'#fffdf8',weight:chosen?9:7,opacity:.95,lineCap:'round'}}).addTo(routeLayer);
    L.geoJSON(f,{renderer:routeRenderer,className:'transport-route-line',style:{color,weight:chosen?5:3.5,opacity:1,dashArray:f.properties.state==='proposed'?'2 8':'8 5',lineCap:'round'},onEachFeature:(_:any,line:any)=>{line.bindPopup(()=>popup(f,locale),popupOptions);line.bindTooltip(transportName(f),{sticky:true,className:'transport-route-tip'});line.on('add',()=>{const el=line.getElement();el?.setAttribute('role','button');el?.setAttribute('aria-label','Xaritadagi yo‘nalish: '+transportName(f));el?.setAttribute('tabindex','0');});line.on('keydown',(e:any)=>{if(['Enter',' '].includes(e.originalEvent.key)){e.originalEvent.preventDefault();line.openPopup();}});}}).addTo(routeLayer);
   }
   drawing=false;
  };
  draw();m.on('moveend',draw);m.on('popupclose',draw);m.attributionControl.addAttribution('Yo‘llar / marshrutlar © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ODbL');
  return()=>{m.off('moveend',draw);m.off('popupclose',draw);roadGroup.remove();routeLayer.remove();};
 },[active,bundle,roadsOn,routesOn,regionRoads,visibleRoutes,selected,mapRef,locale]);
 const focus=(f:TransportFeature)=>{setRoutesOn(true);setSelected(transportId(f));const m=mapRef.current;if(m){const b=transportBounds(f),narrow=m.getSize().x<700;m.fitBounds([[b[1],b[0]],[b[3],b[2]]],{paddingTopLeft:narrow?[25,120]:[60,110],paddingBottomRight:narrow?[25,280]:[320,120],maxZoom:14});}};
 return {bundle,error,retry:()=>setAttempt(v=>v+1),roadsOn,setRoadsOn,routesOn,setRoutesOn,group,setGroup,search,setSearch,selected,regionRoads,regionRoutes,visibleRoutes,focus};
}
type TransportState=ReturnType<typeof useTransport>;
export function TransportQuick({state,onOpen}:{state:TransportState;onOpen:()=>void}){
 return <div className="transport-quick"><label><input type="checkbox" checked={state.roadsOn} onChange={e=>state.setRoadsOn(e.target.checked)}/><Milestone size={13}/>Yo‘llar</label><label><input type="checkbox" checked={state.routesOn} onChange={e=>state.setRoutesOn(e.target.checked)}/><Route size={13}/>Marshrutlar</label><button onClick={onOpen} aria-label="Yo‘llar va marshrutlar bo‘limini ochish"><ChevronRight size={15}/></button></div>;
}
export function TransportLegend({state}:{state:TransportState}){
 return <div className="legend-card transport-map-legend"><div className="legend-heading"><b>YO‘LLAR VA MARSHRUTLAR</b><span>OSM</span></div><div className="transport-legend-row"><i className="road-sample"/><span>Asosiy avtomobil yo‘llari</span><small>{state.roadsOn?'Yoqilgan':'O‘chirilgan'}</small></div><div className="transport-legend-row"><i style={{borderColor:'#bf622c'}}/><span>Piyoda marshrut va so‘qmoq</span><small>{state.routesOn?'Yoqilgan':'O‘chirilgan'}</small></div><div className="transport-legend-row"><i style={{borderColor:'#8262ab'}}/><span>Alpinizm yo‘nalishlari</span></div><p>Marshrutni ro‘yxatdan tanlang yoki xaritadagi chiziqqa bosing. OSM holati: 27.10.2026.</p></div>;
}
export function TransportPanel({state,regionName,onFocus}:{state:TransportState;regionName:string;onFocus:()=>void}){
 const s=state,sourceDate=s.bundle?.metadata?.sourceSnapshot;
 const [limit,setLimit]=useState(40);
 useEffect(()=>setLimit(40),[s.search,s.group,regionName]);
 const relationCount=s.regionRoutes.filter(f=>f.properties.kind==='route').length,trailCount=s.regionRoutes.length-relationCount;
 return <div className="side-body transport-panel">
  <div className="transport-heading"><span className="eyebrow">YO‘LGA CHIQISH</span><h2>Yo‘llar va marshrutlar</h2><p>Asosiy yo‘llar, OSMdagi marshrutlar va tog‘ so‘qmoqlari.</p><small>So‘qmoqlar yaqinlashtirganda ochiladi.</small></div>
  <div className="transport-switches"><label><span className="transport-symbol road"><Milestone size={20}/></span><span><b>Asosiy yo‘llar</b><small>Magistral va birlamchi yo‘llar</small></span><input aria-label="Asosiy yo‘llarni ko‘rsatish" type="checkbox" checked={s.roadsOn} onChange={e=>s.setRoadsOn(e.target.checked)}/></label><label><span className="transport-symbol route"><Route size={20}/></span><span><b>Turistik marshrutlar</b><small>Marshrutlar va tog‘ so‘qmoqlari</small></span><input aria-label="Turistik marshrutlarni ko‘rsatish" type="checkbox" checked={s.routesOn} onChange={e=>s.setRoutesOn(e.target.checked)}/></label></div>
  {!s.bundle&&!s.error&&<p className="transport-message" role="status">OSM ma’lumotlari yuklanmoqda…</p>}
  {s.error&&<div className="transport-message error" role="alert">{s.error}<button onClick={s.retry}><RefreshCw size={14}/>Qayta urinish</button></div>}
  {s.bundle&&<><div className="transport-summary"><div><b>{relationCount}</b><small>marshrut</small></div><div><b>{trailCount}</b><small>so‘qmoq bo‘lagi</small></div><span>{regionName}<small>{s.regionRoads.length.toLocaleString()} ta yo‘l bo‘lagi</small></span></div><div className="transport-key"><span><i className="road-sample"/>Asosiy yo‘l</span><span><i style={{borderColor:'#bf622c'}}/>Piyoda</span>{s.regionRoutes.some(f=>routeGroup(f)==='cycle')&&<span><i style={{borderColor:'#167f88'}}/>Velo</span>}<span><i style={{borderColor:'#8262ab'}}/>Alpinizm</span></div><div className="search-input"><Search size={16}/><input aria-label="Marshrut nomini qidirish" placeholder="Marshrut nomini qidiring…" value={s.search} onChange={e=>s.setSearch(e.target.value)}/></div><div className="transport-filters" aria-label="Marshrut turi">{[['all','Barchasi',Route],['route','Marshrut',Route],['trail','So‘qmoq',Footprints],['alpine','Alpinizm',Milestone]].filter(([id])=>id==='all'||s.regionRoutes.some(f=>matchesRouteFilter(f,String(id)))).map(([id,label,Icon]:any)=><button key={id} aria-pressed={s.group===id} className={s.group===id?'selected':''} onClick={()=>s.setGroup(id)}><Icon size={12}/>{label}</button>)}</div><div className="transport-route-list">{s.visibleRoutes.slice(0,limit).map(f=><button className={'transport-route-card '+(s.selected===transportId(f)?'selected':'')} key={transportId(f)} onClick={()=>{s.focus(f);onFocus();}}><span className="route-card-marker" style={{background:featureRouteKind(f).color+'18',color:featureRouteKind(f).color}}>{routeGroup(f)==='cycle'?<Bike size={18}/>:routeGroup(f)==='walk'?<Footprints size={18}/>:<Route size={18}/>}</span><span><small style={{color:featureRouteKind(f).color}}>{featureRouteKind(f).label}</small><b>{transportName(f)}</b><em>{f.properties.lengthKm!=null?`${distanceLabel(Number(f.properties.lengthKm))} · xaritadagi qism`:'OSM geometriyasi'}{f.properties.state==='proposed'?' · taklif etilgan':''}</em></span><ArrowUpRight size={14}/></button>)}{s.visibleRoutes.length>limit&&<button className="transport-more" onClick={()=>setLimit(v=>v+40)}>Yana {Math.min(40,s.visibleRoutes.length-limit)} tasini ko‘rsatish <ChevronRight size={13}/></button>}{!s.visibleRoutes.length&&<div className="transport-empty"><Route size={24}/><b>Marshrut topilmadi</b><p>Filtrni o‘zgartiring yoki boshqa hududni tanlang. OSMda yo‘nalish qayd etilmaganligi u yerda turizm imkoniyati yo‘qligini bildirmaydi.</p></div>}</div><div className="transport-source"><b>© OpenStreetMap · ODbL</b><p>Marshrut — OSMdagi yo‘nalish; so‘qmoq — alohida chiziq bo‘lagi. So‘qmoqlar avtomatik birlashtirilmagan. Marshrutlar to‘liq yoki uzluksiz bo‘lmasligi mumkin; holat va kirish joyida tekshiriladi. Viloyatlararo yo‘llar tanlangan hududdan tashqariga davom etishi mumkin.</p>{sourceDate&&<small>Manba holati: {String(sourceDate).slice(0,10)}</small>}<a href="/transport/metadata.json" target="_blank" rel="noreferrer">Manba va qamrov <ArrowUpRight size={12}/></a><div><a href="/transport/roads.geojson" download><Download size={12}/>Yo‘llar GeoJSON</a><a href="/transport/routes.geojson" download><Download size={12}/>Marshrutlar GeoJSON</a></div></div></>}
 </div>;
}
