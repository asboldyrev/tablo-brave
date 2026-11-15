'use strict';

// Bookmarks remain the source of truth; visual settings and website metadata live in extension storage.
const ROOT_NAME = 'Табло Brave';
const el = (id) => document.getElementById(id);

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z"/>',
  layout: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  bookmarks: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  link: '<path d="M7 17 17 7M8 7h9v9"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  settings: '<path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.07 7.07-1.41-1.41M6.34 6.34 4.93 4.93m14.14 0-1.41 1.41M6.34 17.66l-1.41 1.41"/>',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.804A6 6 0 0 0 20.18 12.08c.344-.215.826-.004.805.405"/>',
  cloud: '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 19h11"/>',
  cloudSun: '<path d="M12 2v2m7.07.93-1.41 1.41M22 12h-2M4 12H2m4.34-5.66L4.93 4.93"/><path d="M12 8a4 4 0 0 1 4 4"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 19h11"/>',
  cloudRain: '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 16.25"/><path d="m8 19-1 3m6-3-1 3m6-3-1 3"/>',
  cloudSnow: '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 19h.01M12 21h.01M16 19h.01"/>',
  cloudLightning: '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 16.25"/><path d="m13 17-3 4h3l-1 3 5-6h-3l1-3"/>',
  cloudFog: '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 16.25"/><path d="M5 19h14M7 22h10"/>',
};
function icon(name) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function safeDomain(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./, '') || parsed.protocol.replace(':', '');
  } catch { return 'Сайт'; }
}
function normaliseUrl(value) {
  let url = value.trim();
  if (!url) throw new Error('Укажи адрес сайта.');
  if (/^\/\//.test(url)) url = 'https:' + url;
  if (!/^[a-z][a-z\d+.-]*:/i.test(url) || /^[\w.-]+:\d+(\/|$)/.test(url)) {
    url = /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url) ? 'http://' + url : 'https://' + url;
  }
  let parsed;
  try { parsed = new URL(url); }
  catch { throw new Error('Некорректный адрес. Например: https://example.com'); }
  const allowed = ['http:', 'https:', 'brave:', 'chrome:', 'file:'];
  if (!allowed.includes(parsed.protocol) && url !== 'about:blank') {
    throw new Error('Поддерживаются http(s), brave://, chrome://, file:// и about:blank.');
  }
  if (['http:', 'https:'].includes(parsed.protocol) && !parsed.hostname) {
    throw new Error('В адресе сайта отсутствует домен.');
  }
  return parsed.href;
}
const COLORS = ['#e9edf9','#f5e5de','#e7f0e9','#f8edda','#eee9f8','#e2eef0','#f6e6ed','#e7e9f4'];
function tileColor(value) {
  let hash = 0;
  for (const letter of (value || '')) hash = ((hash << 5) - hash + letter.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}
function favUrl(url) {
  const favicon = new URL(chrome.runtime.getURL('/_favicon/'));
  favicon.searchParams.set('pageUrl', url);
  favicon.searchParams.set('size', '64');
  return favicon.href;
}
function siteVisual(node, mini=false) {
  const meta=appearance[node.id]||{};
  const mode=meta.display||settings.display;
  const label=esc(node.title||safeDomain(node.url));
  const src=meta.iconData||meta.iconUrl||favUrl(node.url);
  const image=`<span class="site-icon"><img draggable="false" loading="lazy" src="${esc(src)}" alt="" /><span class="fallback-letter">${esc((node.title||'?').slice(0,1).toUpperCase())}</span></span>`;
  return `<span class="site-visual mode-${esc(mode)}">${image}<span class="site-label">${label}</span></span>`;
}
// A nested folder has a flat four-colour preview: no recursively rendered
// icons, names or miniature folders. Descendant links only supply colours.
function previewColourForNode(node, depth=0) {
  if (!node || depth>16) return null;
  if (node.url) {
    const color=appearance[node.id]?.color;
    return validHex(color)?color:tileColor(node.url);
  }
  for (const child of (node.children||[])) {
    const color=previewColourForNode(child,depth+1);
    if (color) return color;
  }
  return null;
}
function nestedFolderPreview(folder) {
  return `<span class="nested-folder-placeholder" aria-hidden="true">${Array.from({length:4},(_,i)=>{
    const color=previewColourForNode((folder.children||[])[i]);
    return `<span class="folder-preview-color${color?'':' empty'}"${color?` style="background:${color}"`:''}></span>`;
  }).join('')}</span>`;
}
function smallFolderIcons(folder) {
  return Array.from({length:4},(_,i)=>{
    const child=(folder.children||[])[i];
    if (!child) return '<span class="folder-mini empty"></span>';
    if (!child.url) return `<span class="folder-mini is-nested-folder">${nestedFolderPreview(child)}</span>`;
    const color=previewColourForNode(child);
    return `<span class="folder-mini" style="--mini-color:${color};--mini-ink:${contrastText(color)}">${siteVisual(child,true)}</span>`;
  }).join('');
}
function tileHTML(node) {
  const folder=!node.url;
  const meta=appearance[node.id]||{};
  const color=folder?'#d9d9de':(validHex(meta.color)?meta.color:tileColor(node.url));
  const visual=folder?`<span class="folder-icon">${smallFolderIcons(node)}</span>`:siteVisual(node);
  return `<article class="tile ${folder?'is-folder':'is-site'}" draggable="true" data-id="${esc(node.id)}" data-is-folder="${folder}" title="${esc(node.title)}" style="--site-color:${color};--site-ink:${contrastText(color)}">
    <button type="button" class="tile-main" data-action="open" data-id="${esc(node.id)}" aria-label="Открыть ${folder?'папку':'сайт'}: ${esc(node.title)}">${visual}</button>
    <button type="button" class="tile-more" data-action="menu" data-id="${esc(node.id)}" aria-label="Действия">${icon('more')}</button>
  </article>`;
}

let rootId = null;
let nodeMap = new Map();
let rootNode = null;
let folderPath = [];
let editingMeta={};
let editing = null; // {mode:'create'|'edit'|'move', type:'site'|'folder', nodeId}
let contextId = null;
let draggedId = null;
let draggingFromFolder = false;
let dragExitedFolder = false;
let suppressClickUntil = 0;
let dragOrigin = null;
let addMenuFolderId = null;
let localMetadata = {};
let renderRevision = 0;
let refreshTimer = null;
let toastTimer = null;
let tileSize = 'normal';
let appearance = {};
let settings = {tileSize:'normal', display:'both', background:'bing', shade:25, clock:true, search:true, colorSource:'site', weather:false, weatherPlace:null};
const defaultColor = '#ffffff';
function validHex(value) { return /^#[0-9a-f]{6}$/i.test(value || ''); }
function contrastText(hex) {
  if (!validHex(hex)) return '#202027';
  const rgb=[1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255);
  const luminance=rgb.map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return (luminance[0]*.2126 + luminance[1]*.7152 + luminance[2]*.0722) > .42 ? '#22232b' : '#ffffff';
}
async function saveAppearance() { await chrome.storage.local.set({appearance}); }
function applySettings() {
  document.body.dataset.display=settings.display;
  if(rootNode) render();
  document.body.dataset.size=settings.tileSize;
  document.body.classList.toggle('clock-off',!settings.clock);
  document.body.classList.toggle('search-off',!settings.search);
  document.body.style.setProperty('--shade',String(settings.shade/100));
  el('tileSizeSelect').value=settings.tileSize;
  el('displaySelect').value=settings.display;
  el('backgroundSelect').value=settings.background;
  el('shadeRange').value=settings.shade;
  el('clockToggle').checked=settings.clock;
  el('searchToggle').checked=settings.search;
  el('weatherToggle').checked=Boolean(settings.weather);
  el('weatherCityInput').value=settings.weatherPlace?.name||'';
  el('weatherWidget').hidden=!(settings.weather && settings.weatherPlace);
  if(settings.weather && settings.weatherPlace) renderWeatherFromCache();
  el('colorSourceDefault').value=settings.colorSource||'site';
  el('wallpaper').style.display=settings.background==='plain'?'none':'block';
  el('wallpaperCredit').hidden=settings.background==='plain';
}
async function updateSettings(key,value) {
  settings[key]=value; applySettings();
  await chrome.storage.local.set({tabloSettings:settings});
  if(key==='background' && value==='bing') void loadBingWallpaper();
  if(key==='weather' && value && settings.weatherPlace) void refreshWeather();
}
async function loadBingWallpaper() {
  if(settings.background!=='bing') return;
  try {
    const stored=await chrome.storage.local.get('bingWallpaper');
    const today=new Date().toISOString().slice(0,10);
    let image=stored.bingWallpaper;
    if(!image || image.date!==today) {
      const r=await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ru-RU');
      if(!r.ok) throw Error('Bing unavailable');
      const data=await r.json();const item=data.images?.[0];
      if(!item?.url || !item.url.startsWith('/')) throw Error('Unexpected Bing response');
      image={date:today,url:new URL(item.url,'https://www.bing.com').href,credit:item.copyright||'',creditLink:item.copyrightlink||''};
      await chrome.storage.local.set({bingWallpaper:image});
    }
    const u=new URL(image.url);
    if(u.origin!=='https://www.bing.com') throw Error('Invalid image origin');
    el('wallpaper').style.backgroundImage=`url("${u.href}")`;
    setWallpaperCredit(image);
  } catch { const stored=await chrome.storage.local.get('bingWallpaper'); const previous=stored.bingWallpaper; if(previous?.url?.startsWith('https://www.bing.com/')) {el('wallpaper').style.backgroundImage=`url("${previous.url}")`;setWallpaperCredit(previous);} else {el('wallpaperCredit').textContent='Фон Bing временно недоступен';el('wallpaperCredit').removeAttribute('href');} }
}
function setWallpaperCredit(image) {
  const credit=el('wallpaperCredit');
  credit.textContent=image.credit||'Изображение дня · Bing';
  try {
    const url=new URL(image.creditLink||'');
    if(url.protocol==='https:')credit.href=url.href;
    else credit.removeAttribute('href');
  }catch{credit.removeAttribute('href');}
  if(!credit.hasAttribute('href') && image.url?.startsWith('https://www.bing.com/')) credit.href=image.url;
  credit.title='Открыть изображение Bing';
}
function preferDark() { return window.matchMedia('(prefers-color-scheme: dark)').matches; }
function pickThemeColor(doc) {
  const metas=[...doc.querySelectorAll('meta[name="theme-color" i]')];
  // Match a media-specific theme first; generic is the fallback.
  const matches=metas.filter(meta=>{const media=meta.getAttribute('media');try{return media&&matchMedia(media).matches;}catch{return false;}});
  const general=metas.filter(meta=>!meta.hasAttribute('media'));
  const options=[...matches,...general,...metas].map(meta=>parseColor(meta.getAttribute('content'))).filter(Boolean);
  // Avoid treating a generic white theme as the meaningful brand colour.
  return options.find(color=>!['#ffffff','#000000'].includes(color.toLowerCase()))||options[0]
    ||parseColor(doc.querySelector('meta[name="msapplication-TileColor" i]')?.content);
}
function previewIcon(src) {
  const holder=el('iconPreview');
  if(!holder)return;
  holder.replaceChildren();
  if(!src){holder.textContent='Нет иконки';return;}
  const image=document.createElement('img');image.src=src;image.alt='Иконка сайта';
  image.onerror=()=>{holder.textContent='Иконка недоступна';};
  holder.append(image);
}
function effectiveMetadataFor(url) {
  try {
    const wanted=new URL(url);
    let domainMatch=null;
    for(const [id,node] of nodeMap){
      if(!node.url)continue;
      let candidate;try{candidate=new URL(node.url);}catch{continue;}
      const meta=appearance[id]||{};
      const record={title:node.title,iconData:meta.iconData,iconUrl:meta.iconUrl,color:meta.color};
      if(candidate.href===wanted.href)return record;
      if(candidate.hostname===wanted.hostname && !domainMatch)domainMatch=record;
    }
    return localMetadata[wanted.href]||localMetadata[wanted.origin]||domainMatch;
  }catch{return null;}
}
async function fillFromKnownMetadata(url) {
  const found=effectiveMetadataFor(url);
  if(found){
    if(found.title && !el('titleInput').value.trim())el('titleInput').value=found.title;
    if(validHex(found.color))el('tileColorInput').value=found.color;
    editingMeta={...editingMeta,...found};
    previewIcon(found.iconData||found.iconUrl||favUrl(url));
    return;
  }
  // Open tab data is available with tabs permission, but HTML/theme-color is not.
  try {
    const tabs=await chrome.tabs.query({});
    const target=new URL(url);
    const matching=tabs.find(t=>t.url===url)||tabs.find(t=>{
      try{return new URL(t.url).hostname===target.hostname;}catch{return false;}
    });
    if(matching){
      if(matching.title&&!el('titleInput').value.trim())el('titleInput').value=matching.title;
      if(matching.favIconUrl){editingMeta.iconUrl=matching.favIconUrl;previewIcon(matching.favIconUrl);}
    }
  }catch{/* no available tab data */}
}
function parseColor(input) {
  if (!input) return null;
  const value=input.trim();
  if (/^#[0-9a-f]{3}$/i.test(value)) return '#'+[1,2,3].map(i=>value[i]+value[i]).join('');
  if (validHex(value)) return value;
  const match=value.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (match) return '#'+match.slice(1,4).map(n=>Math.min(255,Number(n)).toString(16).padStart(2,'0')).join('');
  return null;
}
async function loadSiteIcon(url,doc) {
  const icon=doc.querySelector('link[rel~="apple-touch-icon"]')||doc.querySelector('link[rel="icon"]')||doc.querySelector('link[rel="shortcut icon"]');
  const origin=new URL(url).origin;
  const href=new URL(icon?.getAttribute('href')||'/favicon.ico',url);
  if (!['http:','https:'].includes(href.protocol)) return {};
  // Only fetch images from an origin we have explicitly obtained permission for.
  if(href.origin!==origin) return {iconUrl:href.href};
  try {
    const response=await fetch(href.href,{credentials:'omit',signal:AbortSignal.timeout(6500)});
    if(!response.ok) return {iconUrl:href.href};
    const blob=await response.blob();
    if(blob.size>70000 || !/^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(blob.type)) return {iconUrl:href.href};
    const iconData=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);
    });
    return {iconData,iconUrl:href.href};
  } catch { return {iconUrl:href.href}; }
}
// A palette-based colour extractor: ignore transparency, near-white/black and
// neutral pixels, quantize remaining pixels, then favour saturated prominent colours.
// This is our own implementation of the general colour-selection approach; no external code.
async function colorFromIcon(iconData) {
  if(!iconData) return null;
  try {
    const image=new Image();image.src=iconData;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,64,64);
    const pixels=ctx.getImageData(0,0,64,64).data;
    const buckets=new Map();
    for(let i=0;i<pixels.length;i+=4) {
      const [r,g,b,a]=[pixels[i],pixels[i+1],pixels[i+2],pixels[i+3]];
      if(a<150) continue;
      const max=Math.max(r,g,b),min=Math.min(r,g,b),spread=max-min;
      if(max<45 || min>235 || spread<26) continue;
      const key=[r,g,b].map(v=>Math.min(255,Math.round(v/24)*24)).join(',');
      const old=buckets.get(key)||{weight:0,r:0,g:0,b:0};
      const weight=(a/255)*(0.45+spread/255);
      old.weight+=weight;old.r+=r*weight;old.g+=g*weight;old.b+=b*weight;
      buckets.set(key,old);
    }
    const best=[...buckets.values()].sort((a,b)=>b.weight-a.weight)[0];
    if(!best)return null;
    return '#'+['r','g','b'].map(k=>Math.round(best[k]/best.weight).toString(16).padStart(2,'0')).join('');
  } catch {return null;}
}
async function fetchSiteMetadata(url) {
  const parsed=new URL(url);
  if(!['https:','http:'].includes(parsed.protocol)) throw Error('Поддерживаются только HTTP(S)-сайты');
  const origin=parsed.origin+'/*';
  const granted=await chrome.permissions.contains({origins:[origin]}) || await chrome.permissions.request({origins:[origin]});
  if(!granted) throw Error('Разрешение не предоставлено');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try {
    const response=await fetch(url,{signal:controller.signal,credentials:'omit'});
    if(!response.ok)throw Error(`Сайт ответил HTTP ${response.status}`);
    const html=(await response.text()).slice(0,500000);
    const doc=new DOMParser().parseFromString(html,'text/html');
    const theme=pickThemeColor(doc);
    const title=(doc.querySelector('meta[property="og:site_name"]')?.content||doc.querySelector('title')?.textContent||'').trim().slice(0,180);
    const icon=await loadSiteIcon(url,doc);
    const generatedColor=await colorFromIcon(icon.iconData);
    const result={title,color:theme||generatedColor,themeColor:theme,generatedColor,...icon};
    localMetadata[parsed.href]=result;localMetadata[parsed.origin]=result;
    return result;
  }finally{clearTimeout(timer);}
}

async function refreshAllCardData() {
  const button=el('refreshCardDataBtn');button.disabled=true;
  const sites=[...nodeMap.values()].filter(node=>node.url && /^https?:\/\//i.test(node.url));
  let success=0,failed=0;
  // Sequential requests avoid opening a flood of site permission dialogs.
  for(const node of sites) {
    try {
      const data=await fetchSiteMetadata(node.url);
      const old=appearance[node.id]||{};
      const source=old.colorSource||settings.colorSource||'site';
      const color=source==='generated'?data.generatedColor:data.themeColor;
      appearance[node.id]={...old,iconData:data.iconData||old.iconData,iconUrl:data.iconUrl||old.iconUrl,
        themeColor:data.themeColor,generatedColor:data.generatedColor,
        ...(validHex(color)?{color}:{})};
      success++;
    }catch{failed++;}
  }
  await saveAppearance();render();button.disabled=false;
  showToast(`Обновлено карточек: ${success}. Не удалось: ${failed}`);
}

// Open-Meteo: city is chosen explicitly. No device location permissions or automatic lookups.
const WEATHER_TTL_MS=60*60*1000;
let weatherCache=null;
let weatherBusy=false;
function weatherIconForCode(code,day=true) {
  if(code===0) return day?'sun':'moon';
  if(code<=2) return day?'cloudSun':'cloud';
  if(code===3) return 'cloud';
  if(code===45||code===48) return 'cloudFog';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'cloudRain';
  if([71,73,75,77,85,86].includes(code)) return 'cloudSnow';
  if([95,96,99].includes(code)) return 'cloudLightning';
  return 'cloud';
}
function renderWeatherFromCache() {
  const widget=el('weatherWidget');
  const place=settings.weatherPlace;
  widget.hidden=!(settings.weather && place);
  if(widget.hidden)return;
  const data=weatherCache?.placeId===place.id?weatherCache:null;
  const reading=data?.reading;
  if(!reading||!Number.isFinite(reading.temperature_2m)) {
    el('weatherIcon').innerHTML=icon('cloud');
    el('weatherTemperature').textContent='—';
    widget.title=`${place.name}: пока нет данных`;
    return;
  }
  el('weatherIcon').innerHTML=icon(weatherIconForCode(reading.weather_code, reading.is_day===1));
  el('weatherTemperature').textContent=`${Math.round(reading.temperature_2m)}°`;
  widget.title=`Погода · ${place.name}, ${place.country||''} · обновлено ${new Date(data.fetchedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
}
async function refreshWeather(force=false) {
  const place=settings.weatherPlace;
  if(!settings.weather || !place || weatherBusy)return;
  if(!force && weatherCache?.placeId===place.id && Date.now()-weatherCache.fetchedAt<WEATHER_TTL_MS){renderWeatherFromCache();return;}
  weatherBusy=true;
  try {
    const qs=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),current:'temperature_2m,weather_code,is_day',timezone:'auto',temperature_unit:'celsius'});
    const response=await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!Number.isFinite(data.current?.temperature_2m))throw new Error('Температура отсутствует');
    weatherCache={placeId:place.id,fetchedAt:Date.now(),reading:{temperature_2m:data.current.temperature_2m,weather_code:data.current.weather_code,is_day:data.current.is_day}};
    await chrome.storage.local.set({weatherCache});
    el('weatherStatus').textContent=`Обновлено: ${new Date(weatherCache.fetchedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
  } catch(e) { el('weatherStatus').textContent=`Не удалось обновить погоду: ${e.message}`; }
  finally {weatherBusy=false;renderWeatherFromCache();}
}
async function searchWeatherPlaces() {
  const name=el('weatherCityInput').value.trim();
  if(name.length<2) {el('weatherStatus').textContent='Введите хотя бы две буквы названия города.';return;}
  const btn=el('weatherFindBtn');btn.disabled=true;
  el('weatherStatus').textContent='Ищу населённый пункт…';
  try {
    const qs=new URLSearchParams({name,count:'8',language:'ru',format:'json'});
    const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${qs}`);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const places=(data.results||[]).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));
    const select=el('weatherPlaceSelect');select.replaceChildren();
    for(const place of places){
      const opt=document.createElement('option');opt.value=String(place.id);opt.textContent=[place.name,place.admin1,place.country].filter(Boolean).join(', ');
      opt.dataset.place=JSON.stringify({id:place.id,name:place.name,country:place.country,latitude:place.latitude,longitude:place.longitude});select.append(opt);
    }
    select.hidden=!places.length;
    el('weatherSavePlaceBtn').hidden=!places.length;
    el('weatherStatus').textContent=places.length?'Выбери подходящий населённый пункт и нажми «Сохранить».':'Ничего не найдено. Уточни название.';
  }catch(e){el('weatherStatus').textContent=`Не удалось найти город: ${e.message}`;}
  finally{btn.disabled=false;}
}
async function saveWeatherPlace() {
  const selected=el('weatherPlaceSelect').selectedOptions[0];
  if(!selected?.dataset.place)return;
  const place=JSON.parse(selected.dataset.place);
  settings.weatherPlace=place;settings.weather=true;weatherCache=null;
  await chrome.storage.local.set({tabloSettings:settings,weatherCache:null});
  el('weatherPlaceSelect').hidden=true;el('weatherSavePlaceBtn').hidden=true;
  applySettings();el('weatherStatus').textContent=`Выбран: ${place.name}. Загружаю погоду…`;
  await refreshWeather(true);
}
function updateClock() {
  const now=new Date();
  el('clock').textContent=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(now);
  el('today').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(now);
}


function showToast(message) {
  const toast = el('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3400);
}
function indexTree(node) {
  nodeMap.set(node.id, node);
  (node.children || []).forEach(indexTree);
}
function parentOf(nodeId) { return nodeMap.get(nodeId)?.parentId; }
function currentFolderId() { return folderPath.at(-1) || rootId; }
function currentFolder() { return nodeMap.get(currentFolderId()) || rootNode; }
function canMove(nodeId, destinationId) {
  if (!nodeMap.has(nodeId) || !nodeMap.has(destinationId) || nodeId === rootId) return false;
  let id = destinationId;
  while (id) {
    if (id === nodeId) return false;
    id = parentOf(id);
  }
  return true;
}

async function ensureRoot() {
  const stored = await chrome.storage.local.get({rootFolderId:null});
  if (stored.rootFolderId) {
    try {
      const existing = (await chrome.bookmarks.get(stored.rootFolderId))[0];
      if (existing && !existing.url && existing.parentId) return existing.id;
    } catch { /* Deleted outside of extension */ }
  }
  const [tree] = await chrome.bookmarks.getTree();
  const other = tree.children?.find((n) => n.id === '2')
    || tree.children?.find((n) => n.id !== '1' && !n.url)
    || tree.children?.find((n) => !n.url);
  if (!other) throw new Error('Не удалось найти папку для хранения закладок.');
  const found = other.children?.find((n) => n.title === ROOT_NAME && !n.url);
  const root = found || await chrome.bookmarks.create({parentId: other.id, title: ROOT_NAME});
  await chrome.storage.local.set({rootFolderId: root.id});
  return root.id;
}
async function refreshRootFolderChoices() {
  const [tree]=await chrome.bookmarks.getTree();
  const options=[];
  function walk(node,depth){
    if(node.url)return;
    if(node.parentId && node.id!=='0') options.push({id:node.id,label:'　'.repeat(depth)+node.title});
    (node.children||[]).forEach(child=>walk(child,depth+1));
  }
  walk(tree,0);
  const selector=el('rootFolderSelect');
  selector.innerHTML=options.map(option=>`<option value="${esc(option.id)}">${esc(option.label)}</option>`).join('');
  selector.value=rootId;
}
async function refreshTree() {
  const revision = ++renderRevision;
  try {
    let subtree;
    try { subtree = (await chrome.bookmarks.getSubTree(rootId))[0]; }
    catch { rootId = await ensureRoot(); subtree = (await chrome.bookmarks.getSubTree(rootId))[0]; }
    if (revision !== renderRevision) return;
    rootNode = subtree;
    nodeMap = new Map();
    indexTree(subtree);
    // If a folder has been deleted or moved away, close the inaccessible part of the popup.
    const validPath = [];
    let lastParent = rootId;
    for (const id of folderPath) {
      const node = nodeMap.get(id);
      if (!node || node.url || node.parentId !== lastParent) break;
      validPath.push(id);
      lastParent = id;
    }
    folderPath = validPath;
    render();
    void refreshRootFolderChoices();
  } catch (error) {
    showToast(`Не удалось прочитать закладки: ${error.message}`);
  }
}
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { void refreshTree(); }, 70);
}
function addTileHTML() {
 return `<article class="tile add-tile" data-add="true" title="Добавить сайт или папку"><button type="button" class="tile-main" data-action="add" aria-label="Добавить сайт">${icon('plus')}</button></article>`;
}
function openAddMenu(folderId,anchor) {
  addMenuFolderId=folderId;closeContext();
  const menu=el('addMenu');menu.hidden=false;
  const rect=anchor.getBoundingClientRect();
  menu.style.left=`${Math.max(8,Math.min(innerWidth-195,rect.left))}px`;
  menu.style.top=`${rect.bottom+menu.offsetHeight+8<innerHeight?rect.bottom+5:Math.max(8,rect.top-menu.offsetHeight-5)}px`;
}
function closeAddMenu(){el('addMenu').hidden=true;addMenuFolderId=null;}
function render() {
  el('rootGrid').innerHTML = (rootNode.children || []).map(tileHTML).join('')+addTileHTML();
  const count = rootNode.children?.length || 0;
  el('rootCount').textContent = count ? `${count}` : '';
  el('rootEmpty').hidden = true;
  el('rootGrid').hidden = false;

  if (folderPath.length) renderFolder();
  else el('folderOverlay').hidden = true;
}
function renderFolder() {
  const folder = currentFolder();
  if (!folder || folder.id === rootId) { closeFolder(); return; }
  el('folderOverlay').hidden = false;
  el('folderTitle').textContent = folder.title;
  const ancestors=folderPath.slice(0,-1);
  const visible=ancestors.slice(-2);
  el('folderBack').hidden = ancestors.length === 0;
  el('folderBreadcrumbs').innerHTML=(ancestors.length>2?'<span class="crumb-ellipsis" title="Есть более ранние папки">…</span>':'')+visible.map((id,i)=>`<button type="button" class="folder-crumb" data-folder-id="${esc(id)}">${esc(nodeMap.get(id)?.title||'Папка')}</button>`).join('<span class="crumb-separator">›</span>');
  const count = (folder.children || []).length;
  el('folderGrid').innerHTML = (folder.children || []).map(tileHTML).join('')+addTileHTML();
  el('folderEmpty').hidden = true;
  el('folderGrid').hidden = false;

}
function openFolder(nodeId) {
  const node = nodeMap.get(nodeId);
  if (!node || node.url) return;
  closeContext();
  if (node.parentId === currentFolderId()) folderPath.push(nodeId);
  else {
    // Recreate the path when opened outside the current level.
    const path = [];
    let current = node;
    while (current && current.id !== rootId) {
      path.unshift(current.id);
      current = nodeMap.get(current.parentId);
    }
    folderPath = path;
  }
  renderFolder();
}
function closeFolder() {
  folderPath = [];
  el('folderOverlay').hidden = true;
  closeContext();
}
function navigate(id) {
  const node = nodeMap.get(id);
  if (!node) return;
  if (node.url) window.location.assign(node.url);
  else openFolder(id);
}
function closeContext() {
  contextId = null;
  el('contextMenu').hidden = true;
}
function openContext(id, anchor) {
  closeContext();
  const node = nodeMap.get(id);
  if (!node) return;
  contextId = id;
  el('menuOpen').textContent = node.url ? 'Открыть сайт' : 'Открыть папку';
  const menu = el('contextMenu');
  menu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const width = 185;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width + 12));
  const top = rect.bottom + 5 + menu.offsetHeight < window.innerHeight
    ? rect.bottom + 5 : Math.max(8, rect.top - menu.offsetHeight - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
function availableFolders(exceptNodeId = null) {
  const result = [];
  function visit(folder, depth) {
    if (folder.id === exceptNodeId) return;
    result.push({id: folder.id, label: `${'　'.repeat(depth)}${depth ? '↳ ' : ''}${folder.id === rootId ? 'Табло (главная)' : folder.title}`});
    (folder.children || []).filter((node) => !node.url).forEach((child) => visit(child, depth + 1));
  }
  visit(rootNode, 0);
  return result;
}
function openEditor(mode, type, nodeId = null) {
  closeContext();
  const node = nodeId ? nodeMap.get(nodeId) : null;
  if (nodeId && !node) return;
  editing = {mode, type, nodeId};
  const label = type === 'folder' ? 'папку' : 'сайт';
  const title = mode === 'create' ? `Добавить ${label}` : mode === 'move' ? `Переместить ${label}` : `Изменить ${label}`;
  el('editorTitle').textContent = title;
  el('editorEyebrow').textContent = mode === 'create' ? 'НОВЫЙ ЭЛЕМЕНТ' : 'РЕДАКТИРОВАНИЕ';
  el('editorFields').hidden = mode === 'move';
  el('urlField').hidden = type === 'folder';
  el('siteAppearance').hidden = type === 'folder' || mode === 'move';
  el('tileColorInput').value = validHex(appearance[nodeId]?.color) ? appearance[nodeId].color : defaultColor;
  el('colorSourceInput').value=appearance[nodeId]?.colorSource || settings.colorSource || 'site';
  editingMeta={};
  previewIcon(node?.url?(appearance[nodeId]?.iconData||appearance[nodeId]?.iconUrl||favUrl(node.url)):null);
  if(mode==='create'&&type==='site'&&el('urlInput').value.trim())void fillFromKnownMetadata(el('urlInput').value.trim());
  el('titleInput').value = node?.title || '';
  el('urlInput').value = node?.url || '';
  el('urlInput').required = type === 'site' && mode !== 'move';
  el('titleInput').required = mode !== 'move';
  const selection = mode === 'create' ? currentFolderId() : node.parentId;
  el('parentSelect').innerHTML = availableFolders(type === 'folder' ? nodeId : null)
    .map((folder) => `<option value="${esc(folder.id)}" ${folder.id === selection ? 'selected' : ''}>${esc(folder.label)}</option>`).join('');
  el('formError').hidden = true;
  el('formError').textContent = '';
  el('saveEditorBtn').textContent = mode === 'create' ? 'Добавить' : mode === 'move' ? 'Переместить' : 'Сохранить';
  el('saveEditorBtn').disabled = false;
  el('editorOverlay').hidden = false;
  setTimeout(() => { (mode === 'move' ? el('parentSelect') : type==='site' && mode==='create' ? el('urlInput') : el('titleInput')).focus(); }, 0);
}
function closeEditor() {
  editing = null;
  el('editorOverlay').hidden = true;
}
async function submitEditor(event) {
  event.preventDefault();
  if (!editing) return;
  const {mode, type, nodeId} = editing;
  const parentId = el('parentSelect').value;
  const title = el('titleInput').value.trim();
  const errorEl = el('formError');
  errorEl.hidden = true;
  try {
    if (!nodeMap.has(parentId) || (mode !== 'create' && !canMove(nodeId, parentId))) {
      throw new Error('Недопустимая папка назначения.');
    }
    const url = type === 'site' && mode !== 'move' ? normaliseUrl(el('urlInput').value) : null;
    if (mode !== 'move' && !title) throw new Error('Название не должно быть пустым.');
    el('saveEditorBtn').disabled = true;
    if (mode === 'create') {
      const details = {parentId, title};
      if (type === 'site') details.url = url;
      const created=await chrome.bookmarks.create(details);
      if(type==='site') { appearance[created.id]={color:el('tileColorInput').value,colorSource:el('colorSourceInput').value,...editingMeta}; await saveAppearance(); }
      showToast(type === 'folder' ? 'Папка создана' : 'Сайт добавлен');
    } else if (mode === 'move') {
      if (parentId !== parentOf(nodeId)) await chrome.bookmarks.move(nodeId, {parentId});
      showToast('Элемент перемещён');
    } else {
      const changes = {title};
      if (type === 'site') changes.url = url;
      await chrome.bookmarks.update(nodeId, changes);
      if(type==='site') { appearance[nodeId]={...appearance[nodeId],color:el('tileColorInput').value,colorSource:el('colorSourceInput').value,...editingMeta}; await saveAppearance(); }
      if (parentId !== parentOf(nodeId)) await chrome.bookmarks.move(nodeId, {parentId});
      showToast('Изменения сохранены');
    }
    closeEditor();
    await refreshTree();
  } catch (error) {
    errorEl.textContent = error.message || 'Не удалось сохранить изменения.';
    errorEl.hidden = false;
    el('saveEditorBtn').disabled = false;
  }
}
async function deleteNode(id) {
  const node = nodeMap.get(id);
  if (!node) return;
  const descendants = (item) => (item.children || []).reduce((sum, child) => sum + 1 + descendants(child), 0);
  const message = node.url
    ? `Удалить сайт «${node.title}» из Табло и закладок?`
    : `Удалить папку «${node.title}» и все вложенные элементы (${descendants(node)}) из закладок?\n\nЭто действие нельзя отменить в Табло.`;
  if (!window.confirm(message)) return;
  try {
    if (node.url) await chrome.bookmarks.remove(id);
    else await chrome.bookmarks.removeTree(id);
    const removeAppearance=(entry)=>{delete appearance[entry.id];(entry.children||[]).forEach(removeAppearance);};
    removeAppearance(node);await saveAppearance();
    closeContext();
    await refreshTree();
    showToast('Удалено из закладок');
  } catch (error) { showToast('Ошибка удаления: ' + error.message); }
}

function bindGrid(grid) {
  grid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || Date.now()<suppressClickUntil) return;
    if(button.dataset.action==='add'){openEditor('create','site');return;}
    const id = button.dataset.id;
    if (button.dataset.action === 'menu') openContext(id, button);
    else navigate(id);
  });
  grid.addEventListener('contextmenu', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile) return;
    event.preventDefault();
    if(tile.dataset.add){openAddMenu(currentFolderId(),tile);return;}
    openContext(tile.dataset.id, tile);
  });
  grid.addEventListener('load', (event) => {
    if (event.target.matches('.site-icon > img')) event.target.classList.add('is-loaded');
  }, true);
  grid.addEventListener('error', (event) => {
    if (event.target.matches('.site-icon > img')) event.target.style.display = 'none';
  }, true);
  grid.addEventListener('dragstart', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile || !nodeMap.has(tile.dataset.id)) return;
    document.activeElement?.blur?.();
    closeAddMenu();
    draggingFromFolder=grid===el('folderGrid');dragExitedFolder=false;dragOrigin=grid;
    suppressClickUntil=Date.now()+500;
    draggedId = tile.dataset.id;
    event.dataTransfer.setData('text/plain', draggedId);
    event.dataTransfer.effectAllowed = 'move';
    tile.classList.add('dragging');
    closeContext();
  });
  grid.addEventListener('dragend', () => { finishDrag(); });
  grid.addEventListener('dragover', (event) => {
    const tile = event.target.closest('.tile');
    if (!draggedId) return;
    clearDropClasses();
    if (tile?.dataset.add) {event.preventDefault();event.dataTransfer.dropEffect='move';tile.classList.add('drop-inside');}
    else if (tile && draggedId !== tile.dataset.id) {
      const place = dropPlacement(tile, event.clientX);
      const targetId = place === 'inside' ? tile.dataset.id : nodeMap.get(tile.dataset.id).parentId;
      if (canMove(draggedId, targetId)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        tile.classList.add('drop-' + place);
      }
    } else if (!tile && folderPath.length && canMove(draggedId, currentFolderId())) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  });
  grid.addEventListener('dragleave', (event) => {
    if (!grid.contains(event.relatedTarget)) clearDropClasses();
  });
  grid.addEventListener('drop', async (event) => {
    if (!draggedId) return;
    event.preventDefault();
    const tile = event.target.closest('.tile');
    const id = draggedId;
    const exited=dragExitedFolder && grid===el('rootGrid');
    draggedId = null;
    if(exited){try{await moveBookmark(id,rootId);closeFolder();}catch(error){showToast(error.message);}return;}
    clearDropClasses();
    try {
      if (!tile) {
        if (folderPath.length) await moveBookmark(id, currentFolderId());
        return;
      }
      if(tile.dataset.add){await moveBookmark(id,currentFolderId());return;}
      if (tile.dataset.id === id) return;
      const place = dropPlacement(tile, event.clientX);
      const target = nodeMap.get(tile.dataset.id);
      if (place === 'inside') await moveBookmark(id, target.id);
      else {
        // Chromium interprets index as 'insert before the element at this index'
        // using the original sibling order, even when reordering one folder.
        let index=target.index + (place === 'after' ? 1 : 0);
        const moving=nodeMap.get(id);
        if(moving?.parentId===target.parentId && moving.index<index) index--;
        await moveBookmark(id, target.parentId, index);
      }
    } catch (error) { showToast('Не удалось переместить: ' + error.message); }
    finally {finishDrag();}
  });
}
function dropPlacement(tile, pointerX) {
  const rect = tile.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width));
  if (tile.dataset.isFolder === 'true' && fraction >= .23 && fraction <= .77) return 'inside';
  return fraction < .5 ? 'before' : 'after';
}
function finishDrag(){
  draggedId=null;draggingFromFolder=false;dragExitedFolder=false;dragOrigin=null;
  clearDropClasses();
  document.querySelectorAll('.tile.dragging').forEach(n=>n.classList.remove('dragging'));
  document.activeElement?.blur?.();
  el('folderOverlay').classList.remove('drag-outside');
  suppressClickUntil=Date.now()+130;
}
function clearDropClasses() {
  document.querySelectorAll('.drop-inside,.drop-before,.drop-after,.drop-folder')
    .forEach((node) => node.classList.remove('drop-inside','drop-before','drop-after','drop-folder'));
}
async function moveBookmark(id, parentId, index = null) {
  if (!canMove(id, parentId)) throw new Error('Нельзя переместить папку внутрь самой себя.');
  const destination = {parentId};
  if (index !== null) destination.index = Math.max(0,index);
  await chrome.bookmarks.move(id, destination);
  await refreshTree();
  showToast('Плитка перемещена');
}

function initListeners() {
  el('addSiteIcon').innerHTML = icon('plus');
  el('addFolderIcon').innerHTML = icon('folder');
  el('closeEditorBtn').innerHTML = icon('close');
  el('settingsBtn').innerHTML = icon('settings');
  el('settingsClose').innerHTML = icon('close');
  el('weatherFindBtn').innerHTML = icon('search');
  updateClock(); setInterval(updateClock,30000);
  const addSite = () => openEditor('create', 'site');
  const addFolder = () => openEditor('create', 'folder');
  el('addSiteBtn').addEventListener('click', addSite);
  el('firstSiteBtn').addEventListener('click', addSite);
  el('addFolderBtn').addEventListener('click', addFolder);
  el('settingsBtn').addEventListener('click',(event)=>{event.stopPropagation();el('settingsPanel').hidden=!el('settingsPanel').hidden;});
  el('settingsClose').addEventListener('click',()=>{el('settingsPanel').hidden=true;});
  el('refreshCardDataBtn').addEventListener('click',()=>void refreshAllCardData());
  el('weatherToggle').addEventListener('change',()=>{void updateSettings('weather',el('weatherToggle').checked);});
  el('weatherFindBtn').addEventListener('click',()=>void searchWeatherPlaces());
  el('weatherSavePlaceBtn').addEventListener('click',()=>void saveWeatherPlace());
  el('weatherCityInput').addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();void searchWeatherPlaces();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshWeather();});
  setInterval(()=>{if(!document.hidden)void refreshWeather();},60*1000);
  el('colorSourceDefault').addEventListener('change',()=>void updateSettings('colorSource',el('colorSourceDefault').value));
  el('colorSourceInput').addEventListener('change',()=>{const c=editingMeta[el('colorSourceInput').value==='generated'?'generatedColor':'themeColor'];if(validHex(c))el('tileColorInput').value=c;});
  el('rootFolderSelect').addEventListener('change',async()=>{const selected=el('rootFolderSelect').value;const [folder]=await chrome.bookmarks.get(selected);if(folder.url)return;rootId=selected;folderPath=[];await chrome.storage.local.set({rootFolderId:selected});await refreshTree();showToast('Папка Табло изменена');});
  for(const [id,key,prop] of [['tileSizeSelect','tileSize','value'],['displaySelect','display','value'],['backgroundSelect','background','value'],['shadeRange','shade','value'],['clockToggle','clock','checked'],['searchToggle','search','checked']]) {
    el(id).addEventListener('change',()=>void updateSettings(key,key==='shade'?Number(el(id)[prop]):el(id)[prop]));
  }
  el('searchForm').addEventListener('submit',async(event)=>{
    event.preventDefault();const query=el('searchInput').value.trim();if(!query)return;
    const looksUrl=/^(https?:\/\/|localhost(?::\d+)?(?:\/|$)|[\w-]+(?:\.[\w-]+)+(?:[:\/]|$))/i.test(query);
    if(looksUrl){window.location.assign(normaliseUrl(query));return;}
    try{await chrome.search.query({text:query,disposition:'CURRENT_TAB'});}catch(error){showToast('Не удалось открыть поиск: '+error.message);}
  });
  el('fetchMetaBtn').addEventListener('click',async()=>{
    const btn=el('fetchMetaBtn');btn.disabled=true;
    try {
      const result=await fetchSiteMetadata(normaliseUrl(el('urlInput').value));
      if(result.title)el('titleInput').value=result.title;
      const chosen=el('colorSourceInput').value==='generated' ? result.generatedColor : result.themeColor;
      if(validHex(chosen||result.color))el('tileColorInput').value=chosen||result.color;
      editingMeta={iconData:result.iconData,iconUrl:result.iconUrl,themeColor:result.themeColor,generatedColor:result.generatedColor};
      previewIcon(result.iconData||result.iconUrl||favUrl(el('urlInput').value));
      showToast('Данные сайта получены');
    } catch(error){showToast('Не удалось загрузить данные: '+error.message);}
    finally {btn.disabled=false;}
  });
  el('folderBack').innerHTML=icon('back');
  el('folderBack').addEventListener('click',()=>{if(folderPath.length>1){folderPath.pop();renderFolder();}else closeFolder();});
  el('folderBreadcrumbs').addEventListener('click',(event)=>{const crumb=event.target.closest('[data-folder-id]');if(!crumb)return;const idx=folderPath.indexOf(crumb.dataset.folderId);if(idx!==-1){folderPath=folderPath.slice(0,idx+1);renderFolder();}});
  el('folderOverlay').addEventListener('click', (event) => {
    if (event.target === el('folderOverlay')) closeFolder();
  });
  el('closeEditorBtn').addEventListener('click', closeEditor);
  el('cancelEditorBtn').addEventListener('click', closeEditor);
  el('editorOverlay').addEventListener('click', (event) => {
    if (event.target === el('editorOverlay')) closeEditor();
  });
  el('editorForm').addEventListener('submit', (event) => { void submitEditor(event); });
  el('addMenu').addEventListener('click',event=>{
    const button=event.target.closest('[data-add-action]');if(!button)return;
    const folderId=addMenuFolderId;closeAddMenu();
    openEditor('create',button.dataset.addAction);
    if(folderId && [...el('parentSelect').options].some(o=>o.value===folderId))el('parentSelect').value=folderId;
  });
  el('urlInput').addEventListener('change',()=>{
    if(!editing||editing.type!=='site')return;
    try{void fillFromKnownMetadata(normaliseUrl(el('urlInput').value));}catch{}
  });
  el('contextMenu').addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu-action]');
    if (!button || !contextId) return;
    const id = contextId;
    const node = nodeMap.get(id);
    closeContext();
    if (!node) return;
    const action = button.dataset.menuAction;
    if (action === 'open') navigate(id);
    else if (action === 'edit') openEditor('edit', node.url ? 'site' : 'folder', id);
    else if (action === 'move') openEditor('move', node.url ? 'site' : 'folder', id);
    else if (action === 'delete') void deleteNode(id);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!el('addMenu').hidden && !event.target.closest('#addMenu') && !event.target.closest('.add-tile'))closeAddMenu();
    if (!el('settingsPanel').hidden && !event.target.closest('#settingsPanel') && !event.target.closest('#settingsBtn')) el('settingsPanel').hidden=true;
    if (!el('contextMenu').hidden && !event.target.closest('#contextMenu') && !event.target.closest('.tile-more')) closeContext();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!el('editorOverlay').hidden) closeEditor();
    else if (!el('settingsPanel').hidden) el('settingsPanel').hidden=true;
    else if (!el('addMenu').hidden) closeAddMenu();
    else if (!el('contextMenu').hidden) closeContext();
    else if (!el('folderOverlay').hidden) closeFolder();
  });
  bindGrid(el('rootGrid'));
  bindGrid(el('folderGrid'));
  // Dragging beyond the folder panel sends the tile back to the main board.
  document.addEventListener('dragover',event=>{
    if(!draggedId||!draggingFromFolder||dragExitedFolder||el('folderOverlay').hidden)return;
    const panel=el('folderPanel').getBoundingClientRect();
    if(event.clientX<panel.left-15||event.clientX>panel.right+15||event.clientY<panel.top-15||event.clientY>panel.bottom+15){
      event.preventDefault();event.dataTransfer.dropEffect='move';dragExitedFolder=true;
      el('folderOverlay').classList.add('drag-outside');
      el('folderOverlay').hidden=true;
    }else{dragExitedFolder=false;el('folderOverlay').classList.remove('drag-outside');}
  });
  document.addEventListener('drop',async(event)=>{
    if(!draggedId||!draggingFromFolder||!dragExitedFolder)return;
    event.preventDefault();const id=draggedId;draggedId=null;
    try{await moveBookmark(id,rootId);closeFolder();}catch(e){showToast(e.message);}
    finally{finishDrag();}
  });
  document.addEventListener('dragend',()=>{if(dragExitedFolder)closeFolder();finishDrag();},true);
  for (const event of ['onCreated','onChanged','onMoved','onRemoved','onChildrenReordered','onImportEnded']) {
    chrome.bookmarks[event]?.addListener(scheduleRefresh);
  }
}
async function main() {
  initListeners();
  if (!globalThis.chrome?.bookmarks || !chrome.storage) {
    el('rootEmpty').hidden = false;
    el('rootEmpty').querySelector('h2').textContent = 'Открой страницу через расширение Brave';
    return;
  }
  try {
    const stored=await chrome.storage.local.get({appearance:{},tabloSettings:{},weatherCache:null});
    weatherCache=stored.weatherCache;
    appearance=stored.appearance||{};settings={...settings,...stored.tabloSettings};
    applySettings();void loadBingWallpaper();void refreshWeather();
    rootId = await ensureRoot(); await refreshTree();
  }
  catch (error) { showToast('Ошибка запуска: ' + error.message); }
}
void main();