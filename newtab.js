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
function smallFolderIcons(folder) {
  const children = folder.children || [];
  return Array.from({length: 4}, (_, index) => {
    const child = children[index];
    if (!child) return '<span class="folder-mini"></span>';
    if (child.url) {
      return `<span class="folder-mini"><img src="${esc(favUrl(child.url))}" alt="" /></span>`;
    }
    return `<span class="folder-mini">${icon('folder')}</span>`;
  }).join('');
}
function tileHTML(node) {
  const folder=!node.url;
  const meta=appearance[node.id]||{};
  const color=folder?'#d9d9de':(validHex(meta.color)?meta.color:'#ffffff');
  const displayIcon=folder
    ? `<div class="tile-icon folder-icon">${smallFolderIcons(node)}</div>`
    : `<div class="tile-icon"><img src="${esc(favUrl(node.url))}" alt="" /><span class="fallback-letter">${esc((node.title||safeDomain(node.url)).slice(0,1).toUpperCase())}</span></div>`;
  return `<article class="tile ${folder?'is-folder':'is-site'}" draggable="true" data-id="${esc(node.id)}" data-is-folder="${folder}" title="${esc(node.title)}" style="--site-color:${color};--site-ink:${contrastText(color)}">
    <button type="button" class="tile-main" data-action="open" data-id="${esc(node.id)}" aria-label="Открыть ${folder?'папку':'сайт'}: ${esc(node.title)}">
      ${displayIcon}<div class="tile-info"><div class="tile-title">${esc(node.title||safeDomain(node.url))}</div></div>
    </button>
    <button type="button" class="tile-more" data-action="menu" data-id="${esc(node.id)}" aria-label="Действия">${icon('more')}</button>
  </article>`;
}

let rootId = null;
let nodeMap = new Map();
let rootNode = null;
let folderPath = [];
let editing = null; // {mode:'create'|'edit'|'move', type:'site'|'folder', nodeId}
let contextId = null;
let draggedId = null;
let renderRevision = 0;
let refreshTimer = null;
let toastTimer = null;
let tileSize = 'normal';
let appearance = {};
let settings = {tileSize:'normal', display:'both', background:'bing', shade:25, clock:true, search:true};
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
  el('wallpaper').style.display=settings.background==='plain'?'none':'block';
  el('wallpaperCredit').hidden=settings.background==='plain';
}
async function updateSettings(key,value) {
  settings[key]=value; applySettings();
  await chrome.storage.local.set({tabloSettings:settings});
  if(key==='background' && value==='bing') void loadBingWallpaper();
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
      if(!item?.url || !item.url.startsWith('/th?id=')) throw Error('Unexpected Bing response');
      image={date:today,url:new URL(item.url,'https://www.bing.com').href,credit:item.copyright||''};
      await chrome.storage.local.set({bingWallpaper:image});
    }
    const u=new URL(image.url);
    if(u.origin!=='https://www.bing.com') throw Error('Invalid image origin');
    el('wallpaper').style.backgroundImage=`url("${u.href}")`;
    el('wallpaperCredit').textContent=image.credit;
  } catch { el('wallpaperCredit').textContent='Фон Bing временно недоступен'; }
}
async function fetchSiteMetadata(url) {
  const parsed=new URL(url);
  if(!['https:','http:'].includes(parsed.protocol)) throw Error('Поддерживаются только HTTP(S)-сайты');
  const origin=parsed.origin+'/*';
  const granted=await chrome.permissions.contains({origins:[origin]}) || await chrome.permissions.request({origins:[origin]});
  if(!granted) throw Error('Разрешение не предоставлено');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  try {
    const response=await fetch(url,{signal:controller.signal,credentials:'omit'});
    if(!response.ok) throw Error('Сайт не ответил');
    const html=(await response.text()).slice(0,400000);
    const doc=new DOMParser().parseFromString(html,'text/html');
    const theme=doc.querySelector('meta[name="theme-color"]')?.getAttribute('content');
    const og=doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    const title=(og||doc.querySelector('title')?.textContent||'').trim().slice(0,180);
    return {title,color:validHex(theme)?theme:null};
  } finally { clearTimeout(timer); }
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
  } catch (error) {
    showToast(`Не удалось прочитать закладки: ${error.message}`);
  }
}
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { void refreshTree(); }, 70);
}
function render() {
  el('rootGrid').innerHTML = (rootNode.children || []).map(tileHTML).join('');
  const count = rootNode.children?.length || 0;
  el('rootCount').textContent = count ? `${count}` : '';
  el('rootEmpty').hidden = count !== 0;
  el('rootGrid').hidden = count === 0;
  el('helpTip').hidden = count === 0;
  if (folderPath.length) renderFolder();
  else el('folderOverlay').hidden = true;
}
function renderFolder() {
  const folder = currentFolder();
  if (!folder || folder.id === rootId) { closeFolder(); return; }
  el('folderOverlay').hidden = false;
  el('folderTitle').textContent = folder.title;
  const count = (folder.children || []).length;
  el('folderSummary').textContent = count === 1 ? '1 элемент' : `${count} элементов`;
  el('folderGrid').innerHTML = (folder.children || []).map(tileHTML).join('');
  el('folderEmpty').hidden = count !== 0;
  el('folderGrid').hidden = count === 0;
  const crumbs = [{id: rootId, title: 'Табло'}, ...folderPath.map((id) => ({id, title: nodeMap.get(id)?.title || 'Папка'}))];
  el('breadcrumbs').innerHTML = crumbs.map((crumb, i) => `${i ? '<span class="crumb-chevron">›</span>' : ''}<button type="button" class="crumb ${i === crumbs.length - 1 ? 'active' : ''}" data-folder-id="${esc(crumb.id)}" title="${esc(crumb.title)}">${esc(crumb.title)}</button>`).join('');
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
  el('autoColorInput').checked = appearance[nodeId]?.autoColor !== false;
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
  setTimeout(() => { (mode === 'move' ? el('parentSelect') : el('titleInput')).focus(); }, 0);
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
      if(type==='site') { appearance[created.id]={color:el('tileColorInput').value,autoColor:el('autoColorInput').checked}; await saveAppearance(); }
      showToast(type === 'folder' ? 'Папка создана' : 'Сайт добавлен');
    } else if (mode === 'move') {
      if (parentId !== parentOf(nodeId)) await chrome.bookmarks.move(nodeId, {parentId});
      showToast('Элемент перемещён');
    } else {
      const changes = {title};
      if (type === 'site') changes.url = url;
      await chrome.bookmarks.update(nodeId, changes);
      if(type==='site') { appearance[nodeId]={color:el('tileColorInput').value,autoColor:el('autoColorInput').checked}; await saveAppearance(); }
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
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === 'menu') openContext(id, button);
    else navigate(id);
  });
  grid.addEventListener('contextmenu', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile) return;
    event.preventDefault();
    openContext(tile.dataset.id, tile);
  });
  grid.addEventListener('load', (event) => {
    if (event.target.matches('.tile-icon > img')) event.target.classList.add('is-loaded');
  }, true);
  grid.addEventListener('error', (event) => {
    if (event.target.matches('.tile-icon > img')) event.target.style.display = 'none';
  }, true);
  grid.addEventListener('dragstart', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile || !nodeMap.has(tile.dataset.id)) return;
    draggedId = tile.dataset.id;
    event.dataTransfer.setData('text/plain', draggedId);
    event.dataTransfer.effectAllowed = 'move';
    tile.classList.add('dragging');
    closeContext();
  });
  grid.addEventListener('dragend', () => { draggedId = null; clearDropClasses(); });
  grid.addEventListener('dragover', (event) => {
    const tile = event.target.closest('.tile');
    if (!draggedId) return;
    clearDropClasses();
    if (tile && draggedId !== tile.dataset.id) {
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
    draggedId = null;
    clearDropClasses();
    try {
      if (!tile) {
        if (folderPath.length) await moveBookmark(id, currentFolderId());
        return;
      }
      if (tile.dataset.id === id) return;
      const place = dropPlacement(tile, event.clientX);
      const target = nodeMap.get(tile.dataset.id);
      if (place === 'inside') await moveBookmark(id, target.id);
      else {
        // Chromium interprets index as 'insert before the element at this index'
        // using the original sibling order, even when reordering one folder.
        const index = target.index + (place === 'after' ? 1 : 0);
        await moveBookmark(id, target.parentId, index);
      }
    } catch (error) { showToast('Не удалось переместить: ' + error.message); }
  });
}
function dropPlacement(tile, pointerX) {
  const rect = tile.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width));
  if (tile.dataset.isFolder === 'true' && fraction >= .23 && fraction <= .77) return 'inside';
  return fraction < .5 ? 'before' : 'after';
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
function bindBreadcrumbDrop() {
  el('breadcrumbs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-folder-id]');
    if (!button) return;
    const targetId = button.dataset.folderId;
    if (targetId === rootId) { closeFolder(); return; }
    const index = folderPath.indexOf(targetId);
    if (index >= 0) { folderPath = folderPath.slice(0, index + 1); renderFolder(); }
  });
  el('breadcrumbs').addEventListener('dragover', (event) => {
    const crumb = event.target.closest('[data-folder-id]');
    if (crumb && draggedId && canMove(draggedId, crumb.dataset.folderId)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearDropClasses();
      crumb.classList.add('drop-folder');
    }
  });
  el('breadcrumbs').addEventListener('drop', async (event) => {
    const crumb = event.target.closest('[data-folder-id]');
    if (!crumb || !draggedId) return;
    event.preventDefault();
    const id = draggedId;
    draggedId = null;
    clearDropClasses();
    try { await moveBookmark(id, crumb.dataset.folderId); }
    catch (error) { showToast(error.message); }
  });
}

function initListeners() {
  el('addSiteIcon').innerHTML = icon('plus');
  el('addFolderIcon').innerHTML = icon('folder');
  el('closeFolderBtn').innerHTML = icon('close');
  el('closeEditorBtn').innerHTML = icon('close');
  updateClock(); setInterval(updateClock,30000);
  const addSite = () => openEditor('create', 'site');
  const addFolder = () => openEditor('create', 'folder');
  el('addSiteBtn').addEventListener('click', addSite);
  el('firstSiteBtn').addEventListener('click', addSite);
  el('addFolderBtn').addEventListener('click', addFolder);
  el('folderAddSiteBtn').addEventListener('click', addSite);
  el('folderAddFolderBtn').addEventListener('click', addFolder);
  el('settingsBtn').addEventListener('click',()=>{el('settingsPanel').hidden=!el('settingsPanel').hidden;});
  el('settingsClose').addEventListener('click',()=>{el('settingsPanel').hidden=true;});
  for(const [id,key,prop] of [['tileSizeSelect','tileSize','value'],['displaySelect','display','value'],['backgroundSelect','background','value'],['shadeRange','shade','value'],['clockToggle','clock','checked'],['searchToggle','search','checked']]) {
    el(id).addEventListener('change',()=>void updateSettings(key,key==='shade'?Number(el(id)[prop]):el(id)[prop]));
  }
  el('searchForm').addEventListener('submit',(event)=>{
    event.preventDefault();const query=el('searchInput').value.trim();if(!query)return;
    const looksUrl=/^(https?:\/\/|localhost(?::\d+)?(?:\/|$)|[\w-]+(?:\.[\w-]+)+(?:[:\/]|$))/i.test(query);
    window.location.assign(looksUrl?normaliseUrl(query):'https://www.google.com/search?q='+encodeURIComponent(query));
  });
  el('fetchMetaBtn').addEventListener('click',async()=>{
    const btn=el('fetchMetaBtn');btn.disabled=true;
    try {
      const result=await fetchSiteMetadata(normaliseUrl(el('urlInput').value));
      if(result.title)el('titleInput').value=result.title;
      if(result.color && el('autoColorInput').checked)el('tileColorInput').value=result.color;
      showToast('Данные сайта получены');
    } catch(error){showToast('Не удалось загрузить данные: '+error.message);}
    finally {btn.disabled=false;}
  });
  el('closeFolderBtn').addEventListener('click', closeFolder);
  el('folderOverlay').addEventListener('click', (event) => {
    if (event.target === el('folderOverlay')) closeFolder();
  });
  el('closeEditorBtn').addEventListener('click', closeEditor);
  el('cancelEditorBtn').addEventListener('click', closeEditor);
  el('editorOverlay').addEventListener('click', (event) => {
    if (event.target === el('editorOverlay')) closeEditor();
  });
  el('editorForm').addEventListener('submit', (event) => { void submitEditor(event); });
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
    if (!el('contextMenu').hidden && !event.target.closest('#contextMenu') && !event.target.closest('.tile-more')) closeContext();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!el('editorOverlay').hidden) closeEditor();
    else if (!el('contextMenu').hidden) closeContext();
    else if (!el('folderOverlay').hidden) closeFolder();
  });
  bindGrid(el('rootGrid'));
  bindGrid(el('folderGrid'));
  bindBreadcrumbDrop();
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
    const stored=await chrome.storage.local.get({appearance:{},tabloSettings:{}});
    appearance=stored.appearance||{};settings={...settings,...stored.tabloSettings};
    applySettings();void loadBingWallpaper();
    rootId = await ensureRoot(); await refreshTree();
  }
  catch (error) { showToast('Ошибка запуска: ' + error.message); }
}
void main();
