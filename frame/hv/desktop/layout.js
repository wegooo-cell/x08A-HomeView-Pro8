/* Pro8 grid and persisted folders; only icons can be grouped. ES5/WebView 72. */
(function(){'use strict';
var root=document.documentElement,container=document.querySelector('.desktop-items'),items=Array.prototype.slice.call(document.querySelectorAll('[data-layout]'));
var toolbar=document.getElementById('layout-toolbar'),hint=document.getElementById('layout-edit'),status=document.getElementById('layout-status');
var KEY='homeview-design:desktop-grid:v5',FKEY='homeview:desktop-folders:v1',DKEY='homeview:desktop-dock:v1',BACKUP='homeview:desktop-before-dock:v1',SINGLE_ROW='homeview:desktop-single-row:v1',COLS=6,ROWS=3,DOCK_ROW=4,CW=172.8,OX=121.6,ROW_Y=[76,249,472],singleRowPending=false;
var LAYOUT_BACKUP='homeview:desktop-layout-backup:v1',currentPage=0,pageNodes=[],pageSwipe=null,pageTimer=0,pageMoveRAF=0,edgeTimer=0,folderHoverTimer=0;
var editing=false,pending=null,drag=null,holdTimer=0,cells={},topZ=3,folders=[],openId='',ignoreClick=0,folderCloseTimer=0,folderAlignTimer=0;
var meta={weather:{c:0,r:0,sx:2,sy:2,w:319,h:319,oy:0},music:{c:4,r:1,sx:1,sy:1,w:146,h:146,oy:0},home:{c:2,r:0,sx:2,sy:2,w:319,h:319,oy:0},photos:{c:4,r:0,sx:2,sy:1,w:319,h:146,oy:0},bilibili:{c:5,r:1,sx:1,sy:1,w:146,h:146,oy:0}};
var apps=["clock","calendar","photos","apps","settings","carplay","music","home","blbl","vinyl","system","files"],appCells=[[2,2],[1,2],[2,2],[3,2],[4,2],[4,2],[2,2],[3,2],[4,2],[5,2],[3,2],[5,2]];
for(var i=0;i<apps.length;i++)meta['app-'+apps[i]]={c:appCells[i][0],r:appCells[i][1],sx:1,sy:1,w:108,h:116,oy:0};
items.forEach(function(item){var id=item.getAttribute('data-layout');if(item.hasAttribute('data-native-shortcut'))meta[id]={c:5,r:2,sx:1,sy:1,w:108,h:116,oy:0};});
var allIds=items.map(function(item){return item.getAttribute('data-layout');}),ids=[],byId={},defaults={};
items.forEach(function(item){var id=item.getAttribute('data-layout'),d=meta[id];byId[id]=item;defaults[id]={c:d.c,r:d.r};item.style.width=d.w+'px';item.style.height=d.h+'px';item.setAttribute('draggable','false');if(item.classList.contains('app'))item.setAttribute('aria-label',item.lastElementChild.textContent);if(item.tagName==='DIV')item.setAttribute('tabindex','0');});
var dock=document.createElement('div');dock.className='desktop-dock';dock.setAttribute('aria-label','常用应用 Dock');container.insertBefore(dock,container.firstChild);
var slot=document.createElement('div');slot.className='layout-drop-slot';slot.hidden=true;container.appendChild(slot);
var modal=document.createElement('div');modal.className='desktop-modal folder-modal';modal.hidden=true;modal.innerHTML='<div class="folder-scrim"></div><div class="folder-dialog" role="dialog" aria-modal="true" aria-label="应用文件夹"><header class="folder-heading"><input id="folder-name" maxlength="24" aria-label="文件夹名称"><button id="folder-close" aria-label="关闭文件夹"><img src="/frame/hv/desktop/assets/ion-close.svg" alt=""><span>完成</span></button></header><section class="folder-sheet ha-frost"><div id="folder-icons"></div><p id="folder-help"></p></section></div>';document.querySelector('.desktop-content').appendChild(modal);
var saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(ignore){}
if(saved.kazumi&&!saved.bilibili)saved.bilibili=saved.kazumi;delete saved.kazumi;
// Drop retired app IDs while keeping saved slots and folders.
try{var migrated=false,retired=['app-timer','app-sports'].concat((window.HV_LAUNCHER_POLICY||{}).retired_layout_ids||[]);retired.forEach(function(id){if(Object.prototype.hasOwnProperty.call(saved,id)){delete saved[id];migrated=true;}});var originalFolders=JSON.parse(localStorage.getItem(FKEY)||'[]');if(Array.isArray(originalFolders)){var keptFolders=[];originalFolders.forEach(function(f){if(f&&Array.isArray(f.children)&&f.children.some(function(id){return retired.indexOf(id)>=0;})){f.children=f.children.filter(function(id){return retired.indexOf(id)<0;});migrated=true;if(!f.children.length){delete saved[f.id];return;}}keptFolders.push(f);});if(migrated){localStorage.setItem(KEY,JSON.stringify(saved));localStorage.setItem(FKEY,JSON.stringify(keptFolders));}}}catch(ignore){}
try{var raw=JSON.parse(localStorage.getItem(FKEY)||'[]'),used={};if(Array.isArray(raw))raw.forEach(function(f){if(!f||!/^folder-[a-z0-9-]+$/.test(f.id)||!Array.isArray(f.children))return;var children=f.children.filter(function(id){if(allIds.indexOf(id)<0||id.indexOf('app-')!==0||used[id])return false;used[id]=true;return true;}).slice(0,9);if(children.length)folders.push({id:f.id,name:String(f.name||'文件夹').slice(0,24),children:children});});}catch(ignore){}
// One extra launcher needs a slot on the full 6×3 desktop. Keep its original apps cell.
if(allIds.indexOf('app-carplay')>=0&&!folders.some(function(f){return f.children.indexOf('app-carplay')>=0;})&&!saved['app-carplay']){
 var appFolder=folders.filter(function(f){return f.children.indexOf('app-apps')>=0;})[0];
 if(appFolder&&appFolder.children.length<9)appFolder.children.push('app-carplay');else if(!appFolder){folders.push({id:'folder-apps',name:'应用',children:['app-apps','app-carplay']});saved['folder-apps']=saved['app-apps']||defaults['app-apps'];}
}
function folder(id){return folders.filter(function(f){return f.id===id;})[0];}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function position(c,r,p){var out={c:c,r:r};if(p>0)out.p=p;return out;}
function pageOf(pos){return pos&&pos.r!==DOCK_ROW?(pos.p||0):0;}
function copy(input){var out={};Object.keys(input).forEach(function(id){if(input[id])out[id]=position(input[id].c,input[id].r,pageOf(input[id]));});return out;}
function isIcon(id){return id.indexOf('app-')===0||!!folder(id);}
function valid(id,pos){var d=meta[id],p=pageOf(pos);if(!d||!pos||!isFinite(pos.c)||!isFinite(pos.r)||pos.c%1||pos.r%1||pos.c<0||pos.r<0||!isFinite(p)||p%1||p<0||p>allIds.length)return false;if(pos.r===DOCK_ROW)return isIcon(id)&&pos.c<8;return pos.c+d.sx<=COLS&&pos.r+d.sy<=ROWS;}
function dockIds(layout){return ids.filter(function(id){return isIcon(id)&&layout[id]&&layout[id].r===DOCK_ROW;}).sort(function(a,b){return layout[a].c-layout[b].c||ids.indexOf(a)-ids.indexOf(b);});}
function dockBox(layout){var count=dockIds(layout).length,w=count?count*100+(count-1)*14+38:0;return {x:(1280-w)/2,y:656,w:w,h:104,count:count};}
// iPad-style columns: icons are centered in their cells; widgets span cells.
function gridInset(id){var d=meta[id];return Math.round((d.sx*CW-d.w)/2);}
function point(id,pos,layout){var d=meta[id]||{sx:1,sy:1,w:108,oy:0};if(pos.r===DOCK_ROW){var box=dockBox(layout||cells);return {x:box.x+19+pos.c*114,y:660};}return {x:OX+pos.c*CW+Math.round((d.sx*CW-d.w)/2),y:ROW_Y[pos.r]+d.oy};}
function nearest(id,x,y){var d=meta[id]||{sx:1,sy:1,w:108,oy:0};if(isIcon(id)&&y+48>=642){var box=dockBox(drag?drag.before:cells);return {c:clamp(Math.round((x-box.x-19)/114),0,7),r:DOCK_ROW};}var page=currentPage,first=0,last=ROWS-d.sy,ys=ROW_Y,r=first,distance=Infinity;for(var n=first;n<=last;n++){var delta=Math.abs(y-ys[n]-d.oy);if(delta<distance){r=n;distance=delta;}}return position(clamp(Math.round((x-OX-Math.round((d.sx*CW-d.w)/2))/CW),0,COLS-d.sx),r,page);}
function icon(id){var node=byId[id].querySelector('.app-icon').cloneNode(true);node.removeAttribute('id');node.classList.remove('app-icon');node.classList.add('folder-mini');return node;}
function rebuild(){
 var grouped={};folders.forEach(function(f){f.children.forEach(function(id){grouped[id]=true;});});ids=allIds.filter(function(id){byId[id].hidden=!!grouped[id];return !grouped[id];});
 Array.prototype.forEach.call(container.querySelectorAll('[data-folder]'),function(n){if(!folder(n.getAttribute('data-folder'))){delete byId[n.getAttribute('data-layout')];n.parentNode.removeChild(n);}});
 folders.forEach(function(f){var node=byId[f.id];meta[f.id]={c:3,r:2,sx:1,sy:1,w:108,h:116,oy:0};if(!node){node=document.createElement('button');node.className='app layout-item desktop-folder';node.setAttribute('data-layout',f.id);node.setAttribute('data-folder',f.id);node.style.width='108px';node.style.height='116px';node.innerHTML='<span class="app-icon folder-preview ha-frost"></span><span class="folder-label"></span>';container.appendChild(node);byId[f.id]=node;}var preview=node.querySelector('.folder-preview');preview.innerHTML='';f.children.slice(0,9).forEach(function(id){preview.appendChild(icon(id));});node.querySelector('.folder-label').textContent=f.name;node.setAttribute('aria-label',f.name+'，'+f.children.length+' 个应用');ids.push(f.id);});
}
rebuild();
// A single local migration, with an on-device backup of only layout data.
// r=4 is the dock lane; original widget cells and folder contents stay intact.
// v98 adds a second icon row. Existing dock icons move from logical row 3
// to 4 once; subsequent user placements in row 3 remain regular grid icons.
try{if(!localStorage.getItem('homeview:desktop-ipad-grid:v1')){if(localStorage.getItem(DKEY)){if(!localStorage.getItem('homeview:desktop-before-ipad-grid:v1'))localStorage.setItem('homeview:desktop-before-ipad-grid:v1',JSON.stringify({cells:saved,folders:folders}));ids.forEach(function(id){if(isIcon(id)&&saved[id]&&saved[id].r===3)saved[id]={c:saved[id].c,r:DOCK_ROW};});}localStorage.setItem('homeview:desktop-ipad-grid:v1','1');}}catch(ignore){}
var migrateDock=false;try{migrateDock=!localStorage.getItem(DKEY);}catch(ignore){}
if(migrateDock){
 try{if(!localStorage.getItem(BACKUP))localStorage.setItem(BACKUP,JSON.stringify({cells:saved,folders:folders}));}catch(ignore){}
 ['app-music','app-home','app-photos','app-settings'].filter(function(id){return ids.indexOf(id)>=0;}).forEach(function(id,index){saved[id]={c:index,r:DOCK_ROW};});
 var upperWidgets=ids.filter(function(id){return !isIcon(id);}).every(function(id){var p=saved[id]||defaults[id];return p.r+meta[id].sy<=2;});
 var gridIcons=ids.filter(function(id){return isIcon(id)&&(!saved[id]||saved[id].r!==DOCK_ROW);});
 if(upperWidgets&&gridIcons.length<=COLS){gridIcons.sort(function(a,b){var x=saved[a]||defaults[a]||meta[a],y=saved[b]||defaults[b]||meta[b];return x.r-y.r||x.c-y.c;});gridIcons.forEach(function(id,index){saved[id]={c:index,r:2};});}
}
// v102 folds the two ordinary rows into one, retaining their reading order.
// A fuller old grid spills into free Dock slots rather than hiding any app.
// Row 4 stays reserved for Dock so old migration markers remain unambiguous.
try{if(!localStorage.getItem(SINGLE_ROW)){
 if(!localStorage.getItem('homeview:desktop-before-single-row:v1'))localStorage.setItem('homeview:desktop-before-single-row:v1',JSON.stringify({cells:saved,folders:folders}));
 var oldDock=dockIds(saved),oneRow=ids.filter(function(id){return isIcon(id)&&oldDock.indexOf(id)<0;});
 oneRow.sort(function(a,b){var an=(a==='app-blbl'||a==='app-vinyl')&&!saved[a],bn=(b==='app-blbl'||b==='app-vinyl')&&!saved[b];if(an!==bn)return an?1:-1;var x=saved[a]||defaults[a]||meta[a],y=saved[b]||defaults[b]||meta[b];return x.r-y.r||x.c-y.c||ids.indexOf(a)-ids.indexOf(b);});
 oneRow.forEach(function(id,index){saved[id]=index<COLS?{c:index,r:2}:{c:oldDock.length+index-COLS,r:DOCK_ROW};});
 singleRowPending=true;
}}catch(ignore){}
// Keep every unaffected slot. A fixed drop displaces only intersecting items;
// those try the vacated slot, nearby cells, then another page. No backtracking.
function pack(fixedId,fixedPos,preferred){
 var result={},used={},pending=[];
 function free(id,pos){if(!valid(id,pos)||pos.r===DOCK_ROW)return false;var d=meta[id],p=pageOf(pos);for(var y=pos.r;y<pos.r+d.sy;y++)for(var x=pos.c;x<pos.c+d.sx;x++)if(used[p+':'+y+':'+x])return false;return true;}
 function mark(id,pos){result[id]=position(pos.c,pos.r,pageOf(pos));var d=meta[id],p=pageOf(pos);for(var y=pos.r;y<pos.r+d.sy;y++)for(var x=pos.c;x<pos.c+d.sx;x++)used[p+':'+y+':'+x]=true;}
 if(fixedId&&!valid(fixedId,fixedPos))return null;
 var docked=dockIds(preferred).filter(function(id){return id!==fixedId;});if(fixedId&&fixedPos.r===DOCK_ROW)docked.splice(clamp(fixedPos.c,0,docked.length),0,fixedId);docked.splice(8);docked.forEach(function(id,index){result[id]={c:index,r:DOCK_ROW};});
 if(fixedId&&fixedPos.r!==DOCK_ROW)mark(fixedId,fixedPos);
 ids.forEach(function(id){if(result[id])return;var want=preferred[id];if(free(id,want))mark(id,want);else pending.push(id);});
 pending.sort(function(a,b){return meta[b].sx*meta[b].sy-meta[a].sx*meta[a].sy||ids.indexOf(a)-ids.indexOf(b);});
 pending.forEach(function(id){var old=fixedId&&preferred[fixedId],want=preferred[id]||meta[id];if(old&&free(id,old)){mark(id,old);return;}var pages=[pageOf(want)],max=lastPage(preferred)+1;for(var p=0;p<=max;p++)if(pages.indexOf(p)<0)pages.push(p);for(var n=0;n<pages.length;n++){var candidates=[],d=meta[id];for(var r=0;r<=ROWS-d.sy;r++)for(var c=0;c<=COLS-d.sx;c++)candidates.push(position(c,r,pages[n]));candidates.sort(function(a,b){return Math.abs(a.c-want.c)+Math.abs(a.r-want.r)-Math.abs(b.c-want.c)-Math.abs(b.r-want.r)||a.r-b.r||a.c-b.c;});for(var k=0;k<candidates.length;k++)if(free(id,candidates[k])){mark(id,candidates[k]);return;}}});
 return Object.keys(result).length===ids.length?result:null;
}
// Preserve the old four-row page data before fitting its last row into the
// common widget grid. Valid positions and every shortcut stay intact.
try{if(Object.keys(saved).some(function(id){return saved[id]&&saved[id].r===3;})&&!localStorage.getItem('homeview:desktop-before-free-grid:v1'))localStorage.setItem('homeview:desktop-before-free-grid:v1',JSON.stringify({version:1,cells:saved,folders:folders}));}catch(ignore){}

// New entries use free cells; if a saved one-row desktop is full, append only
// the newly added entry to Dock rather than falling back to overlapping cells.
var extraRow=ids.filter(function(id){return isIcon(id)&&(!saved[id]||saved[id].r!==DOCK_ROW);}),extraDock=dockIds(saved);
['app-blbl','app-vinyl','app-system','app-files'].forEach(function(id){if(ids.indexOf(id)>=0&&!saved[id]&&extraRow.length>COLS&&extraDock.length<8){saved[id]={c:extraDock.length,r:DOCK_ROW};extraDock.push(id);extraRow.splice(extraRow.indexOf(id),1);}});
// Reserve existing positions before allocating the new system and file entries.
['app-system','app-files'].forEach(function(id){
 if(ids.indexOf(id)<0||saved[id])return;
 var taken={};ids.forEach(function(other){if(other!==id&&saved[other]&&isIcon(other))taken[saved[other].r+':'+saved[other].c]=true;});
 for(var c=0;c<COLS;c++)if(!taken['2:'+c]){saved[id]={c:c,r:2};return;}
 for(var d=0;d<8;d++)if(!taken[DOCK_ROW+':'+d]){saved[id]={c:d,r:DOCK_ROW};return;}
});
var preferred={};ids.forEach(function(id){preferred[id]=valid(id,saved[id])?saved[id]:defaults[id]||{c:4,r:2};});cells=pack(null,null,preferred);
if(!cells){
 try{var raw=localStorage.getItem(LAYOUT_BACKUP);if(raw){var recovered=cleanBackup(JSON.parse(raw));folders=recovered.folders;rebuild();cells=pack(null,null,recovered.cells);}}catch(ignore){}
 if(!cells){try{localStorage.setItem('homeview:desktop-unrecovered:v1',JSON.stringify({cells:saved,folders:folders}));}catch(ignore){}cells=defaultArrangement();}
}

function backupLayout(){try{localStorage.setItem(LAYOUT_BACKUP,JSON.stringify({version:1,at:Date.now(),cells:copy(cells),folders:JSON.parse(JSON.stringify(folders))}));status.textContent='已备份图标位置和文件夹';return true;}catch(ignore){status.textContent='存储空间不足，未修改布局';return false;}}
function cleanBackup(data){
 if(!data||data.version!==1||!data.cells||typeof data.cells!=='object'||Array.isArray(data.cells)||!Array.isArray(data.folders))throw Error('布局备份无效');
 var used={},groups={},clean=[];
 data.folders.forEach(function(f){if(!f||!/^folder-[a-z0-9-]+$/.test(f.id)||groups[f.id]||!Array.isArray(f.children)||f.children.length>9)throw Error('文件夹备份无效');groups[f.id]=true;var children=[];f.children.forEach(function(id){if(typeof id!=='string'||id.indexOf('app-')!==0||used[id])throw Error('文件夹备份无效');used[id]=true;if(allIds.indexOf(id)>=0)children.push(id);});if(children.length)clean.push({id:f.id,name:String(f.name||'文件夹').slice(0,24),children:children});});
 var result={};Object.keys(data.cells).forEach(function(id){if(allIds.indexOf(id)<0&&!clean.some(function(f){return f.id===id;}))return;var pos=data.cells[id],icon=id.indexOf('app-')===0||id.indexOf('folder-')===0,d=icon?{sx:1,sy:1}:meta[id],p=pos&&pos.p||0;if(!pos||typeof pos.c!=='number'||typeof pos.r!=='number'||pos.c%1||pos.r%1||pos.c<0||pos.r<0||typeof p!=='number'||p%1||p<0||p>allIds.length||pos.r===DOCK_ROW&&(!icon||pos.c>7)||pos.r!==DOCK_ROW&&(pos.c+d.sx>COLS||pos.r+d.sy>ROWS)&&!(icon&&p>0&&pos.r===3&&pos.c<COLS))throw Error('位置备份无效');result[id]=position(pos.c,pos.r,p);});
 return {cells:result,folders:clean,at:+data.at||0};
}
function restoreLayout(){
 if(drag)return false;var raw,data;try{raw=localStorage.getItem(LAYOUT_BACKUP);if(!raw)throw Error('没有可用的布局备份');data=cleanBackup(JSON.parse(raw));}catch(error){status.textContent=error.message||'布局备份不可用';return false;}
 closeFolder(true);var previousFolders=folders,previousCells=copy(cells);folders=data.folders;rebuild();var preferred=copy(previousCells);Object.keys(data.cells).forEach(function(id){preferred[id]=data.cells[id];});var next=pack(null,null,preferred);
 if(!next){folders=previousFolders;rebuild();apply(previousCells);status.textContent='当前快捷方式较多，请先整理后恢复';return false;}
 cells=next;apply(cells);save();status.textContent='已恢复布局，账号和内容保持';return true;
}
function defaultArrangement(){
 var members=['app-apps','app-carplay'].filter(function(id){return allIds.indexOf(id)>=0;});folders=[];
 for(var start=0;start<members.length;start+=9)folders.push({id:start?'folder-shortcuts-'+start:'folder-apps',name:start?'我的应用 '+(Math.floor(start/9)+1):'应用',children:members.slice(start,start+9)});
 rebuild();var preferred=copy(defaults),dock=['app-music','app-home','app-photos','app-settings'].filter(function(id){return ids.indexOf(id)>=0;});dock.forEach(function(id,index){preferred[id]={c:index,r:DOCK_ROW};});
 var row=ids.filter(function(id){return isIcon(id)&&dock.indexOf(id)<0;});row.sort(function(a,b){return (defaults[a]||meta[a]).c-(defaults[b]||meta[b]).c;});row.forEach(function(id,index){preferred[id]=index<COLS?{c:index,r:2}:position((index-COLS)%COLS,Math.floor((index-COLS)/COLS)%ROWS,1+Math.floor((index-COLS)/(COLS*ROWS)));});return pack(null,null,preferred);
}
function resetLayout(){if(!backupLayout())return;var oldFolders=JSON.parse(JSON.stringify(folders)),oldCells=copy(cells);closeFolder(true);var next=defaultArrangement();if(!next){folders=oldFolders;rebuild();cells=oldCells;apply(cells);status.textContent='当前应用较多，已保留原布局';return;}cells=next;apply(cells);save();status.textContent='已还原默认排列，可用恢复布局撤回';}
function freeShortcutSlot(){var used={};ids.forEach(function(id){var pos=cells[id],d=meta[id];if(!pos||pos.r===DOCK_ROW)return;for(var r=pos.r;r<pos.r+d.sy;r++)for(var c=pos.c;c<pos.c+d.sx;c++)used[pageOf(pos)+':'+r+':'+c]=true;});var order=[currentPage];for(var p=0;p<=lastPage(cells)+1;p++)if(order.indexOf(p)<0)order.push(p);for(var n=0;n<order.length;n++){var page=order[n];for(var row=0;row<ROWS;row++)for(var col=0;col<COLS;col++)if(!used[page+':'+row+':'+col])return position(col,row,page);}}
function addShortcut(node,wanted){
 if(drag||pending||!node)return false;var id=node.getAttribute('data-layout'),pos=wanted||freeShortcutSlot();if(!pos||meta[id])return false;
 meta[id]={c:pos.c,r:pos.r,sx:1,sy:1,w:108,h:116,oy:0};defaults[id]=pos;byId[id]=node;allIds.push(id);items.push(node);node.style.width='108px';node.style.height='116px';node.setAttribute('draggable','false');node.setAttribute('aria-label',node.lastElementChild.textContent);container.appendChild(node);rebuild();var preferred=copy(cells);preferred[id]=pos;var next=pack(wanted?id:null,wanted||null,preferred);
 if(!next){allIds.splice(allIds.indexOf(id),1);items.splice(items.indexOf(node),1);node.parentNode.removeChild(node);delete byId[id];delete defaults[id];delete meta[id];rebuild();return false;}
 cells=next;apply(cells);save();return true;
}
function placeShortcut(id,pos){if(drag||!byId[id]||!isIcon(id)||!valid(id,pos))return false;var beforeFolders=JSON.parse(JSON.stringify(folders)),before=copy(cells),preferred=copy(cells);folders=folders.filter(function(f){if(f.children.indexOf(id)<0)return true;preferred[id]=preferred[f.id];f.children=f.children.filter(function(child){return child!==id;});if(f.children.length===1){preferred[f.children[0]]=preferred[f.id];delete preferred[f.id];return false;}return f.children.length>0;});rebuild();var next=pack(id,pos,preferred);if(!next){folders=beforeFolders;rebuild();apply(before);return false;}cells=next;apply(cells);save();return true;}
function removeShortcut(id){
 if(drag||!byId[id]||!byId[id].hasAttribute('data-native-shortcut'))return false;
 closeFolder(true);var preferred=copy(cells),element=byId[id];
 folders=folders.filter(function(f){if(f.children.indexOf(id)<0)return true;f.children=f.children.filter(function(child){return child!==id;});if(f.children.length===1){preferred[f.children[0]]=preferred[f.id];delete preferred[f.id];return false;}if(!f.children.length){delete preferred[f.id];return false;}return true;});
 allIds.splice(allIds.indexOf(id),1);items.splice(items.indexOf(element),1);element.parentNode.removeChild(element);delete byId[id];delete meta[id];delete defaults[id];delete preferred[id];rebuild();cells=pack(null,null,preferred)||preferred;apply(cells);save();return true;
}
function lastPage(layout){var max=0;Object.keys(layout).forEach(function(id){max=Math.max(max,pageOf(layout[id]));});return max;}
var nav=document.createElement('div');nav.className='desktop-page-nav';nav.setAttribute('aria-label','桌面页面');container.parentNode.appendChild(nav);
function pageNode(index){if(!pageNodes[index]){var node=document.createElement('section');node.className='desktop-page';node.setAttribute('data-desktop-page-index',index);node.setAttribute('aria-label',index?'桌面第 '+(index+1)+' 页':'主页面');container.insertBefore(node,dock);pageNodes[index]=node;}return pageNodes[index];}
function pageCount(){return Math.max(lastPage(cells)+1,drag?currentPage+1:1);}
function renderPages(offset){var count=pageCount();for(var p=0;p<pageNodes.length;p++){var node=pageNodes[p];if(!node)continue;var draggedPage=!!(drag&&node.contains(drag.item)),shown=p<count&&(draggedPage||Math.abs(p-currentPage)<=1||!!(pageSwipe&&p===pageSwipe.to));node.style.zIndex=draggedPage?'1000':'';if(node.hidden!==!shown)node.hidden=!shown;var aria=p===currentPage?'false':'true';if(node.getAttribute('aria-hidden')!==aria)node.setAttribute('aria-hidden',aria);node.style.transform='translate3d('+((p-currentPage)*1280+(offset||0))+'px,0,0)';}nav.hidden=count===1;if(root.getAttribute('data-desktop-page')!==String(currentPage))root.setAttribute('data-desktop-page',currentPage);if(nav.hvState===currentPage+':'+count)return;nav.hvState=currentPage+':'+count;var html='';for(var n=Math.max(0,currentPage-3);n<Math.min(count,currentPage+4);n++)html+='<button class="desktop-page-dot'+(n===currentPage?' on':'')+'" data-desktop-go="'+n+'" aria-label="桌面第 '+(n+1)+' 页" aria-current="'+(n===currentPage?'page':'false')+'"></button>';nav.innerHTML=html;}
function pageChanged(){if(window.HVWallpaper)requestAnimationFrame(HVWallpaper.align);document.dispatchEvent(new CustomEvent('hv-desktop-page',{detail:{page:currentPage,count:pageCount()}}));}
function goPage(index,dragging){if(pageSwipe)return false;var limit=dragging?lastPage(drag.before)+1:lastPage(cells);index=clamp(index,0,limit);if(index===currentPage)return false;currentPage=index;pageNode(index);renderPages();pageChanged();return true;}
function apply(layout,skip){var box=dockBox(layout);dock.hidden=!box.count;dock.style.left=box.x+'px';dock.style.width=box.w+'px';dock.style.setProperty('--dock-glass-x',-box.x+'px');if(!drag)currentPage=Math.min(currentPage,lastPage(layout));ids.forEach(function(id){if(id===skip||!layout[id])return;var pos=layout[id],parent=pos.r===DOCK_ROW?container:pageNode(pageOf(pos));if(byId[id].parentNode!==parent)parent.appendChild(byId[id]);var p=point(id,pos,layout);byId[id].classList.toggle('is-docked',pos.r===DOCK_ROW);byId[id].style.left=p.x+'px';byId[id].style.top=p.y+'px';});renderPages();if(window.HVWallpaper)requestAnimationFrame(HVWallpaper.align);}
function beginPageSwipe(delta){var to=currentPage+delta;if(editing||drag||pageSwipe||to<0||to>=pageCount())return false;clearTimeout(pageTimer);pageSwipe={to:to,p:0,delta:delta};pageNode(to);root.classList.add('desktop-paging');renderPages();return true;}
function paintPageSwipe(){if(!pageSwipe)return;var offset=-pageSwipe.delta*pageSwipe.p*1280;pageNodes[currentPage].style.transform='translate3d('+offset+'px,0,0)';pageNodes[pageSwipe.to].style.transform='translate3d('+((pageSwipe.to-currentPage)*1280+offset)+'px,0,0)';}
function movePageSwipe(value){if(pageSwipe&&!pageSwipe.finishing){pageSwipe.p=clamp(value,0,1);if(!pageMoveRAF)pageMoveRAF=requestAnimationFrame(function(){pageMoveRAF=0;paintPageSwipe();});}}
function stopPageAnimations(current){clearTimeout(current.timer);if(current.animations)current.animations.forEach(function(animation){animation.cancel();});pageNodes.forEach(function(node){if(node)node.style.transition='';});if(pageMoveRAF)cancelAnimationFrame(pageMoveRAF);pageMoveRAF=0;}
function cancelPageSwipe(){if(!pageSwipe)return;var current=pageSwipe;pageSwipe=null;stopPageAnimations(current);root.classList.remove('desktop-paging');renderPages();pageChanged();}
function finishPageSwipe(commit){if(!pageSwipe||pageSwipe.finishing)return;var current=pageSwipe;current.finishing=true;if(pageMoveRAF)cancelAnimationFrame(pageMoveRAF);pageMoveRAF=0;paintPageSwipe();var duration=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches?0:80;
 function complete(){if(pageSwipe!==current)return;pageSwipe=null;if(commit)currentPage=current.to;stopPageAnimations(current);root.classList.remove('desktop-paging');renderPages();pageChanged();}
 if(!duration){complete();return;}var target=commit?1:0,offset=-current.delta*target*1280,pages=[currentPage,current.to],start=performance.now();current.animations=[];
 // WebView 72 needs an explicit shared start time to avoid pending page animations.
 pages.forEach(function(index){var node=pageNodes[index],to='translate3d('+((index-currentPage)*1280+offset)+'px,0,0)';if(typeof node.animate==='function'){var animation=node.animate([{transform:node.style.transform},{transform:to}],{duration:duration,easing:'cubic-bezier(.333333,1,.666667,1)',fill:'forwards'});animation.startTime=start;current.animations.push(animation);}else{node.style.transition='transform '+duration+'ms ease-out';requestAnimationFrame(function(){if(pageSwipe===current)node.style.transform=to;});}});
 if(current.animations.length)current.animations[0].onfinish=complete;current.timer=setTimeout(complete,duration+70);
}
nav.addEventListener('click',function(e){var button=e.target.closest('[data-desktop-go]');if(button&&!drag)goPage(+button.getAttribute('data-desktop-go'));});
function save(){try{localStorage.setItem(KEY,JSON.stringify(cells));localStorage.setItem(FKEY,JSON.stringify(folders));localStorage.setItem(DKEY,'1');if(singleRowPending){localStorage.setItem(SINGLE_ROW,'1');singleRowPending=false;}status.textContent='已保存 · 拖入或拖出 Dock 调整常用应用';document.dispatchEvent(new Event('hv-layout-saved'));}catch(ignore){status.textContent='存储空间不足，暂未保存';}}
apply(cells);
// Commit saved coordinates before making the first desktop frame visible.
// This runs before the data/music scripts; no API or font request gates layout.
void container.offsetWidth;
root.setAttribute('data-desktop-layout','ready');
container.setAttribute('aria-busy','false');
save();
function bridgeHold(){try{var b=window.HVClockBridge||parent.HVClockBridge;if(b)b.hold();}catch(ignore){}}
function cancelHold(){clearTimeout(holdTimer);holdTimer=0;pending=null;}
function enter(){editing=true;root.classList.add('layout-editing');toolbar.hidden=false;hint.hidden=true;status.textContent='拖动图标或组件排列 · 拖至边缘换页';bridgeHold();}
function leave(){cancelHold();if(drag){var cancelled=drag;cells=drag.before;currentPage=drag.originPage;drag.item.classList.remove('is-dragging');drag=null;if(cancelled.external)cancelled.item.parentNode.removeChild(cancelled.item);stopEdge();apply(cells);}clearTarget();slot.hidden=true;save();editing=false;ignoreClick=0;root.classList.remove('layout-editing');toolbar.hidden=true;hint.hidden=false;}
function showSlot(id,pos,layout){var d=meta[id]||{w:108,h:116},p=point(id,pos,layout);slot.hidden=false;slot.style.left=p.x+'px';slot.style.top=p.y+'px';slot.style.width=(pos.r===DOCK_ROW?100:d.w)+'px';slot.style.height=(pos.r===DOCK_ROW?96:d.h)+'px';}
// Keep the touch target in its page until release; WebView 72 cancels reparented touches.
function begin(item,e){var id=item.getAttribute('data-layout'),p=point(id,cells[id]);drag={item:item,id:id,pointer:e.pointerId,x:e.clientX,y:e.clientY,left:p.x,top:p.y,before:copy(cells),preview:copy(cells),candidate:position(cells[id].c,cells[id].r,pageOf(cells[id])),target:'',targetAt:0,moved:false,originPage:currentPage};item.style.zIndex=++topZ;item.classList.add('is-dragging');renderPages();bridgeHold();try{root.setPointerCapture(e.pointerId);}catch(ignore){}showSlot(id,cells[id]);}
function clearTarget(){clearTimeout(folderHoverTimer);folderHoverTimer=0;dock.classList.remove('is-target');Array.prototype.forEach.call(container.querySelectorAll('.folder-target'),function(n){n.classList.remove('folder-target');});}
function hoverTarget(x,y){if(!drag||drag.id==='app-system'||drag.id.indexOf('app-')!==0)return '';var found='';ids.some(function(id){if(!drag.before[id]||drag.before[id].r!==DOCK_ROW&&pageOf(drag.before[id])!==currentPage||id==='app-system'||id===drag.id||id.indexOf('app-')!==0&&!folder(id)||folder(id)&&folder(id).children.length>=9)return false;var p=point(id,drag.before[id]);if(Math.abs(x-(p.x+54))<43&&Math.abs(y-(p.y+48))<43){found=id;return true;}return false;});return found;}
function merge(id,target,before){var f=folder(target),pos=before[target];if(f)f.children.push(id);else{f={id:'folder-'+Date.now().toString(36),name:'文件夹',children:[target,id]};folders.push(f);}rebuild();var preferred=copy(before);preferred[f.id]=pos;cells=pack(f.id,pos,preferred)||pack(null,null,preferred);apply(cells);save();}
function closeFolder(fast){
 ignoreClick=0;clearTimeout(folderCloseTimer);clearTimeout(folderAlignTimer);
 if(openId){var f=folder(openId),name=document.getElementById('folder-name').value.trim();if(f&&name&&name!==f.name){f.name=name.slice(0,24);rebuild();apply(cells);save();}}
 openId='';modal.classList.remove('is-open');root.classList.remove('folder-open');
 if(fast===true||window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)modal.hidden=true;
 else folderCloseTimer=setTimeout(function(){if(!openId)modal.hidden=true;},180);
}
function openFolder(id){
 var f=folder(id);if(!f)return;clearTimeout(folderCloseTimer);clearTimeout(folderAlignTimer);openId=id;
 document.getElementById('folder-name').value=f.name;document.getElementById('folder-name').readOnly=!editing;modal.classList.toggle('is-editing',editing);
 var list=document.getElementById('folder-icons');list.innerHTML='';
 f.children.forEach(function(child){var b=document.createElement('button');b.className='folder-child';b.setAttribute('data-folder-child',child);b.appendChild(byId[child].querySelector('.app-icon').cloneNode(true));var text=document.createElement('span');text.textContent=byId[child].querySelector('span:last-child').textContent;b.appendChild(text);b.onclick=function(){if(editing)return;closeFolder(true);byId[child].click();};list.appendChild(b);});
 document.getElementById('folder-help').textContent=editing?'轻点名称重命名 · 拖出图标移回桌面':'';
 modal.hidden=false;root.classList.add('folder-open');if(window.HVWallpaper)HVWallpaper.align();
 requestAnimationFrame(function(){if(openId===id)modal.classList.add('is-open');});
 folderAlignTimer=setTimeout(function(){if(openId&&window.HVWallpaper)HVWallpaper.align();},240);bridgeHold();
}
function extract(id){var f=folder(openId),beforeFolders=JSON.parse(JSON.stringify(folders)),before=copy(cells),preferred=copy(cells),pos=cells[f.id];f.children.splice(f.children.indexOf(id),1);preferred[id]=pos;if(f.children.length===1){preferred[f.children[0]]=pos;folders.splice(folders.indexOf(f),1);}else if(!f.children.length)folders.splice(folders.indexOf(f),1);rebuild();var next=pack(null,null,preferred);if(!next&&pos.r===DOCK_ROW){preferred[id]={c:clamp(pos.c,0,5),r:2};next=pack(null,null,preferred);}if(!next){folders=beforeFolders;rebuild();cells=before;apply(cells);document.getElementById('folder-help').textContent='桌面和 Dock 已满，请先合并其他图标腾出位置';return false;}closeFolder(true);cells=next;apply(cells);save();return true;}
modal.querySelector('.folder-scrim').onclick=closeFolder;document.getElementById('folder-close').onclick=closeFolder;
var childDrag=null;
modal.addEventListener('pointerdown',function(e){var b=e.target.closest('[data-folder-child]');if(!b)return;childDrag={id:b.getAttribute('data-folder-child'),pointer:e.pointerId,x:e.clientX,y:e.clientY};if(!editing){cancelHold();holdTimer=setTimeout(function(){enter();openFolder(openId);ignoreClick=Date.now()+400;},450);}},true);
document.addEventListener('pointerdown',function(e){
 if(e.button&&e.button!==0||root.getAttribute('data-scene')!=='desktop'||root.classList.contains('native-app-open')||root.classList.contains('native-app-motion')||document.querySelector('.desktop-modal:not([hidden])')||e.target.closest('.layout-toolbar,.desktop-page-nav,#layout-edit,.shortcut-remove,input,textarea,select'))return;
 var item=e.target.closest('[data-layout]');if(editing){if(item){begin(item,e);e.preventDefault();e.stopPropagation();}return;}
 pending={item:item,id:e.pointerId,x:e.clientX,y:e.clientY};holdTimer=setTimeout(function(){if(!pending)return;var start=pending;pending=null;holdTimer=0;enter();ignoreClick=Date.now()+500;if(start.item)begin(start.item,{pointerId:start.id,clientX:start.x,clientY:start.y});},450);
},true);
function stopEdge(){clearTimeout(edgeTimer);edgeTimer=0;if(drag)drag.edge=0;}
function trackEdge(){if(!drag)return;var side=drag.lastX<48?-1:drag.lastX>1232?1:0;if(drag.lastY>638||drag.lastY<58)side=0;if(side===drag.edge)return;stopEdge();if(!side)return;drag.edge=side;edgeTimer=setTimeout(function turn(){edgeTimer=0;if(!drag||drag.edge!==side)return;var max=lastPage(drag.before)+1,next=currentPage+side;if(next<0||next>max)return;if(goPage(next,true)){drag.target='';clearTarget();updateDrag();}if(drag&&drag.edge===side)edgeTimer=setTimeout(turn,750);},650);}
function startExternal(item,e,source){if(drag||pending||!item)return false;var previousEditing=editing;enter();var ghost=document.createElement('div');ghost.className='app layout-item is-dragging external-shortcut-drag';ghost.style.width='108px';ghost.style.height='116px';ghost.appendChild(source.querySelector('.app-icon').cloneNode(true));var label=document.createElement('span');label.textContent=item.name;ghost.appendChild(label);container.appendChild(ghost);drag={external:true,record:item,wasEditing:previousEditing,item:ghost,id:'app-external',pointer:e.pointerId,x:e.clientX,y:e.clientY,left:e.clientX-54,top:e.clientY-48,lastX:e.clientX,lastY:e.clientY,before:copy(cells),preview:copy(cells),originPage:currentPage,candidate:nearest('app-external',e.clientX-54,e.clientY-48),target:'',moved:true};ghost.style.zIndex=1000;try{root.setPointerCapture(e.pointerId);}catch(ignore){}updateDrag();return true;}
function updateDrag(){if(!drag)return;var d=meta[drag.id]||{w:108,h:116},dx=drag.lastX-drag.x,dy=drag.lastY-drag.y,x=clamp(drag.left+dx,16,1280-d.w-16),y=clamp(drag.top+dy,57,800-d.h-20),candidate=nearest(drag.id,x,y);if(Math.abs(dx)+Math.abs(dy)>8)drag.moved=true;
 if(drag.external){drag.candidate=candidate;showSlot(drag.id,candidate,cells);}else{
 var target=hoverTarget(x+54,y+48);if(target!==drag.target){clearTarget();drag.target=target;drag.targetAt=Date.now();if(target){var held=drag;folderHoverTimer=setTimeout(function(){if(drag!==held||drag.target!==target)return;byId[target].classList.add('folder-target');apply(drag.before,drag.id);slot.hidden=true;},400);}}
 var previous=drag.preview[drag.id];if(!previous||candidate.c!==previous.c||candidate.r!==previous.r||pageOf(candidate)!==pageOf(previous)){var next=pack(drag.id,candidate,drag.before);if(next){drag.preview=next;drag.candidate=candidate;apply(next,drag.id);showSlot(drag.id,next[drag.id],next);dock.classList.toggle('is-target',candidate.r===DOCK_ROW);}}
 if(target&&Date.now()-drag.targetAt>=400){apply(drag.before,drag.id);slot.hidden=true;}
 }

 var parentPage=pageNodes.indexOf(drag.item.parentNode),pageOffset=parentPage<0?0:(parentPage-currentPage)*1280;drag.item.style.left=Math.round(x-pageOffset)+'px';drag.item.style.top=Math.round(y)+'px';trackEdge();}
document.addEventListener('pointermove',function(e){
 if(childDrag&&childDrag.pointer===e.pointerId){var child=childDrag;if(Math.abs(e.clientX-child.x)+Math.abs(e.clientY-child.y)>18){cancelHold();if(editing&&extract(child.id)){begin(byId[child.id],e);drag.left=e.clientX-54;drag.top=e.clientY-48;drag.moved=true;}childDrag=null;}}
 if(pending&&pending.id===e.pointerId&&Math.abs(e.clientX-pending.x)+Math.abs(e.clientY-pending.y)>10)cancelHold();if(!drag||drag.pointer!==e.pointerId)return;drag.lastX=e.clientX;drag.lastY=e.clientY;updateDrag();e.preventDefault();e.stopPropagation();
},{capture:true,passive:false});
function end(e,cancel){var tap=pending&&pending.id===e.pointerId?pending.item:null;cancelHold();childDrag=null;if(!drag||drag.pointer!==e.pointerId){if(!cancel&&tap&&folder(tap.getAttribute('data-layout'))){openFolder(tap.getAttribute('data-layout'));ignoreClick=Date.now()+400;e.preventDefault();e.stopPropagation();}return;}stopEdge();var d=drag;drag=null;d.item.classList.remove('is-dragging');clearTarget();slot.hidden=true;ignoreClick=Date.now()+350;
 if(d.external){d.item.parentNode.removeChild(d.item);if(cancel){currentPage=d.originPage;apply(cells);if(!d.wasEditing)leave();}else if(window.HVDesktopShortcuts){HVDesktopShortcuts.pin(d.record,{position:d.candidate,quiet:true});apply(cells);}e.preventDefault();e.stopPropagation();return;}
 if(cancel)currentPage=d.originPage;
 if(!cancel&&d.target&&Date.now()-d.targetAt>=400)merge(d.id,d.target,d.before);else{cells=cancel?d.before:d.preview;apply(cells);save();if(!cancel&&!d.moved&&folder(d.id))openFolder(d.id);}e.preventDefault();e.stopPropagation();}
document.addEventListener('pointerup',function(e){end(e,false);},true);document.addEventListener('pointercancel',function(e){end(e,true);},true);
document.addEventListener('click',function(e){var remove=e.target.closest('[data-remove-shortcut]');if(remove&&editing){e.preventDefault();e.stopImmediatePropagation();if(window.HVDesktopShortcuts)HVDesktopShortcuts.remove(remove.getAttribute('data-remove-shortcut'));return;}var f=e.target.closest('[data-folder]');if(f&&!editing){e.preventDefault();e.stopImmediatePropagation();if(Date.now()>=ignoreClick)openFolder(f.getAttribute('data-folder'));return;}if((editing||Date.now()<ignoreClick)&&e.target.closest('[data-layout]')){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('dragstart',function(e){if(editing||pending)e.preventDefault();},true);
document.addEventListener('contextmenu',function(e){if(root.getAttribute('data-scene')!=='desktop'||root.classList.contains('native-app-open')||document.querySelector('.desktop-modal:not([hidden])'))return;e.preventDefault();cancelHold();enter();});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(!modal.hidden)closeFolder();else if(editing)leave();return;}if(!editing)return;var item=e.target.closest('[data-layout]');if(!item||!/^Arrow(Up|Down|Left|Right)$/.test(e.key))return;var id=item.getAttribute('data-layout'),d=meta[id],old=cells[id],r=old.r;if(r===DOCK_ROW){if(e.key==='ArrowUp')r=ROWS-1;}else{r=clamp(r+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0),0,ROWS-d.sy);if(isIcon(id)&&old.r===ROWS-1&&e.key==='ArrowDown')r=DOCK_ROW;}var next=position(clamp(old.c+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0),0,r===DOCK_ROW?7:COLS-d.sx),r,r===DOCK_ROW?0:pageOf(old));cells=pack(id,next,cells)||cells;apply(cells);save();e.preventDefault();});
function interrupted(){cancelHold();childDrag=null;if(drag)end({pointerId:drag.pointer,preventDefault:function(){},stopPropagation:function(){}},true);if(pageSwipe)cancelPageSwipe();}
window.addEventListener('blur',interrupted);document.addEventListener('visibilitychange',function(){if(document.hidden)interrupted();});document.addEventListener('lostpointercapture',function(e){if(e.target===root&&drag&&drag.pointer===e.pointerId)interrupted();});
hint.onclick=enter;document.getElementById('layout-done').onclick=leave;
document.getElementById('layout-wallpaper').onclick=function(){leave();var url='/frame/hv/background/?target=desktop';if(window.HVDesktopHost)HVDesktopHost.open(url);else location.href=url;};
document.getElementById('layout-reset').onclick=resetLayout;document.getElementById('layout-backup').onclick=backupLayout;document.getElementById('layout-restore').onclick=restoreLayout;
window.HVDesktopLayout={backup:backupLayout,restore:restoreLayout,canAddShortcut:function(){return !drag;},addShortcut:addShortcut,placeShortcut:placeShortcut,startExternal:startExternal,pages:{current:function(){return currentPage;},count:pageCount,go:goPage,swipe:{begin:beginPageSwipe,move:movePageSwipe,finish:finishPageSwipe}},removeShortcut:removeShortcut,enter:enter,back:function(){if(openId){closeFolder();return true;}if(editing){leave();return true;}return false;},state:function(){return {editing:editing,page:currentPage,pageCount:pageCount(),cells:copy(cells),dock:dockIds(cells),folders:JSON.parse(JSON.stringify(folders))};}};
})();
