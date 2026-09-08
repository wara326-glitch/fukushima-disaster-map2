const map=L.map("map",{zoomControl:true}).setView([36.5,138.0],5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);
let allHospitals=[],incident=null,incidentMarker=null,routeLayer=null,roadTimes={},roadDistances={};const markers=new Map();

const yes=v=>{const s=String(v??"").trim();return /^(1|有|あり|該当|○|〇|true|TRUE|はい)$/.test(s)||/該当/.test(s)};
const num=v=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:null};
const findKey=(keys,rxs)=>keys.find(k=>rxs.some(r=>r.test(k)));
function findKeys(keys){
 return {
  name:findKey(keys,[/医療機関.*名称/,/施設名/,/^名称$/]),
  pref:findKey(keys,[/都道府県/]),
  address:findKey(keys,[/所在地$/, /住所$/]),
  lat:findKey(keys,[/緯度/]),
  lng:findKey(keys,[/経度/]),
  critical:findKey(keys,[/救命救急センター/]),
  disaster:findKey(keys,[/災害拠点病院/]),
  secondary:findKey(keys,[/二次救急/,/第二次救急/,/病院群輪番/,/共同利用型/]),
  ambulance:findKey(keys,[/救急車.*受入.*件数/,/救急搬送.*受入.*件数/,/救急車による救急患者.*受入/])
 };
}
function category(h){if(h.critical)return"critical";if(h.disaster)return"disaster";return"secondary"}
function color(h){return h.critical?"#ef4444":h.disaster?"#f59e0b":"#3b82f6"}
function visible(h){return (h.critical&&fCritical.checked)||(h.disaster&&fDisaster.checked)||(h.secondary&&fSecondary.checked)}
function label(h){let a=[];if(h.critical)a.push("救命救急センター");if(h.disaster)a.push("災害拠点病院");if(h.secondary)a.push("二次救急（救急車1000台以上/年）");return a.join(" / ")}
function hav(a,b){const R=6371,tr=x=>x*Math.PI/180,dLat=tr(b.lat-a.lat),dLon=tr(b.lng-a.lng),z=Math.sin(dLat/2)**2+Math.cos(tr(a.lat))*Math.cos(tr(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(z))}
function airMin(km){return km/(Number(airSpeed.value)||220)*60+(Number(airOverhead.value)||0)}

function loadStaticData(){
  allHospitals=(typeof NATIONAL_HOSPITALS!=="undefined" && Array.isArray(NATIONAL_HOSPITALS))?NATIONAL_HOSPITALS.map(h=>({...h,pref:h.pref||""})):[];
  if(allHospitals.length){
    status.textContent=`全国データ ${allHospitals.length}施設を読み込みました。`;
    draw();
    const pts=allHospitals.filter(h=>h.lat!=null&&h.lng!=null).map(h=>[h.lat,h.lng]);
    if(pts.length>1) map.fitBounds(pts,{padding:[18,18],maxZoom:6});
  }else{
    status.textContent="全国病院データを更新中です。数分後に再読み込みしてください。";
  }
}
loadStaticData();

async function geocode(h){if(h.lat!=null&&h.lng!=null)return true;try{const q=encodeURIComponent((h.pref? h.pref+" ":"")+h.address+" "+h.name);const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=${q}`,{headers:{"Accept-Language":"ja"}});const j=await r.json();if(!j?.length)return false;h.lat=Number(j[0].lat);h.lng=Number(j[0].lon);return true}catch(e){return false}}
async function ensureNearbyCoords(){
 if(!incident)return;
 const missing=allHospitals.filter(h=>(h.lat==null||h.lng==null)&&visible(h));
 for(let i=0;i<missing.length;i+=5)await Promise.all(missing.slice(i,i+5).map(geocode));
}

function filtered(){
 let a=allHospitals.filter(visible).filter(h=>h.lat!=null&&h.lng!=null).map(h=>({...h,dist:incident?hav(incident,h):null}));
 if(incident){const r=Number(radiusKm.value);if(r<9999)a=a.filter(h=>h.dist<=r);a.sort((x,y)=>(x.dist??1e9)-(y.dist??1e9));}
 else a.sort((x,y)=>(x.address||"").localeCompare((y.address||""),"ja")||x.name.localeCompare(y.name,"ja"));
 return a.slice(0,Number(maxHosp.value));
}
function draw(){
 markers.forEach(m=>map.removeLayer(m));markers.clear();const arr=filtered();
 arr.forEach((h,i)=>{const m=L.circleMarker([h.lat,h.lng],{radius:h.critical?8:7,color:"#fff",weight:1,fillColor:color(h),fillOpacity:.95}).addTo(map).bindPopup(`<b>${h.name}</b><br>${label(h)}<br>${h.address||""}${h.ambulance!=null?"<br>救急車受入 "+h.ambulance.toLocaleString()+"件/年":""}`);markers.set(i,m)});
 render(arr);
}
function render(arr=filtered()){
 const mode=sortMode.value;
 arr=arr.map((h,i)=>({...h,_i:i,road:roadTimes[h.name],roadKm:roadDistances[h.name],air:incident?airMin(h.dist):null}));
 arr.sort((a,b)=>mode==="road"?(a.road??1e9)-(b.road??1e9):mode==="air"?(a.air??1e9)-(b.air??1e9):mode==="name"?a.name.localeCompare(b.name,"ja"):(a.dist??1e9)-(b.dist??1e9));
 hospitalCount.textContent=arr.length;
 results.innerHTML=arr.map(h=>`<div class="result" data-name="${encodeURIComponent(h.name)}"><div class="name"><span class="dot" style="background:${color(h)}"></span>${h.name}</div><div class="meta">${label(h)}<br>${h.address||""}${h.ambulance!=null?"<br>救急車受入 "+h.ambulance.toLocaleString()+"件/年":""}${h.dist!=null?" ・ 直線 "+h.dist.toFixed(1)+"km":""}</div><div class="times"><span class="pill road">陸路 ${h.road!=null?Math.round(h.road)+"分 / "+h.roadKm.toFixed(1)+"km":"未計算"}</span><span class="pill air">空路 ${h.air!=null?"約"+Math.round(h.air)+"分":"未計算"}</span></div></div>`).join("");
 document.querySelectorAll(".result").forEach(el=>el.onclick=()=>showRoute(decodeURIComponent(el.dataset.name)));
}

function setIncident(lat,lng,labelText="発災地点"){incident={lat,lng};if(incidentMarker)map.removeLayer(incidentMarker);incidentMarker=L.marker([lat,lng],{draggable:true}).addTo(map).bindPopup(labelText).openPopup();incidentMarker.on("dragend",e=>{const p=e.target.getLatLng();setIncident(p.lat,p.lng)});incidentText.textContent=`緯度 ${lat.toFixed(5)} / 経度 ${lng.toFixed(5)}`;roadTimes={};roadDistances={};draw()}
map.on("click",e=>setIncident(e.latlng.lat,e.latlng.lng));map.on("contextmenu",e=>setIncident(e.latlng.lat,e.latlng.lng));

async function searchAddress(){const q=addressInput.value.trim();if(!q)return alert("住所・施設名などを入力してください。");addressBtn.disabled=true;searchCandidates.style.display="none";try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=8&countrycodes=jp&q=${encodeURIComponent(q)}`,{headers:{"Accept-Language":"ja"}});const j=await r.json();searchCandidates.innerHTML=j.map((x,i)=>`<div class="candidate" data-i="${i}"><b>${x.display_name.split(",")[0]}</b><div class="small">${x.display_name}</div></div>`).join("");searchCandidates.style.display="block";searchCandidates.querySelectorAll(".candidate").forEach(el=>el.onclick=async()=>{const x=j[Number(el.dataset.i)],lat=Number(x.lat),lng=Number(x.lon);setIncident(lat,lng,x.display_name.split(",")[0]);map.setView([lat,lng],11);incidentText.innerHTML=`<b>${x.display_name.split(",")[0]}</b><br>${x.display_name}`;searchCandidates.style.display="none";await ensureNearbyCoords();draw()})}finally{addressBtn.disabled=false}}
addressBtn.onclick=searchAddress;addressInput.addEventListener("keydown",e=>{if(e.key==="Enter")searchAddress()});
geoBtn.onclick=()=>navigator.geolocation?.getCurrentPosition(async p=>{setIncident(p.coords.latitude,p.coords.longitude,"現在地");map.setView([p.coords.latitude,p.coords.longitude],11);await ensureNearbyCoords();draw()},()=>alert("現在地を取得できませんでした。"));
clearBtn.onclick=()=>{incident=null;if(incidentMarker)map.removeLayer(incidentMarker);incidentMarker=null;incidentText.textContent="未設定";roadTimes={};roadDistances={};map.setView([36.5,138],5);draw()};
[fCritical,fDisaster,fSecondary,radiusKm,maxHosp,sortMode].forEach(x=>x.onchange=draw);[airSpeed,airOverhead].forEach(x=>x.oninput=draw);

async function routeFor(h,geometry=false){const u=`https://router.project-osrm.org/route/v1/driving/${incident.lng},${incident.lat};${h.lng},${h.lat}?overview=${geometry?"full":"false"}&geometries=geojson`;const r=await fetch(u),j=await r.json(),rt=j.routes?.[0];if(!rt)throw 0;return rt}
calcBtn.onclick=async()=>{if(!incident)return alert("先に発災地点を指定してください。");await ensureNearbyCoords();const arr=filtered();roadTimes={};roadDistances={};let done=0;for(let i=0;i<arr.length;i+=4){await Promise.all(arr.slice(i,i+4).map(async h=>{try{const rt=await routeFor(h,false);roadTimes[h.name]=rt.duration/60;roadDistances[h.name]=rt.distance/1000;done++}catch(e){}}));status.textContent=`陸路計算中… ${Math.min(i+4,arr.length)}/${arr.length}`;draw()}status.textContent=`${done}施設の陸路を計算しました。`};
async function showRoute(name){if(!incident)return;const h=allHospitals.find(x=>x.name===name);if(!h)return;try{const rt=await routeFor(h,true);if(routeLayer)map.removeLayer(routeLayer);routeLayer=L.geoJSON(rt.geometry,{style:{weight:5,opacity:.8}}).addTo(map);map.fitBounds(routeLayer.getBounds(),{padding:[30,30]});roadTimes[h.name]=rt.duration/60;roadDistances[h.name]=rt.distance/1000;draw();status.textContent=`${h.name}: 陸路 約${Math.round(rt.duration/60)}分 / ${(rt.distance/1000).toFixed(1)}km`}catch(e){status.textContent="ルート取得に失敗しました。"}}
