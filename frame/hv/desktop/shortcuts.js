/* Native shortcuts retain the single HomeView runtime. No reloads, installs or enable operations. ES5. */
(function(){'use strict';
var key='homeview:desktop-shortcuts:v1',records=[],installed={},pendingMissing={},handlingMissing=false,epoch=0,container=document.querySelector('.desktop-items');
var builtins={'dev.pro8.homeview.direct':'launcher','dev.pro8.blbl':'app-blbl','dev.pro8.vinyl':'app-vinyl','com.shihab.diplay':'app-carplay'};
function hidden(pkg){return ((window.HV_LAUNCHER_POLICY||{}).hidden_packages||[]).indexOf(pkg)>=0;}
function valid(pkg){return typeof pkg==='string'&&pkg.length<=255&&/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(pkg);}
function id(pkg){return 'app-native-'+pkg;}
function toast(text){if(window.HV)HV.toast(text);}
function store(next){try{localStorage.setItem(key,JSON.stringify({version:1,items:next}));records=next;return true;}catch(ignore){toast('存储空间不足，暂未保存快捷方式');return false;}}
function changed(){document.dispatchEvent(new Event('hv-shortcuts-change'));}
function node(record){var element=document.createElement('div');element.className='app layout-item native-shortcut';element.setAttribute('data-layout',id(record.package));element.setAttribute('data-native-shortcut',record.package);element.setAttribute('role','button');element.tabIndex=0;
  var remove=document.createElement('button');remove.className='shortcut-remove';remove.setAttribute('data-remove-shortcut',record.package);remove.setAttribute('aria-label','移除'+record.name+'的快捷方式');remove.textContent='×';element.appendChild(remove);
  var image=document.createElement('img');image.className='app-icon';image.alt='';image.src='/api/hv/installed-apps/icon?package='+encodeURIComponent(record.package);image.onerror=function(){image.onerror=null;image.src='/frame/hv/desktop/assets/public-apps.svg';};element.appendChild(image);
  var label=document.createElement('span');label.textContent=record.name;element.appendChild(label);return element;
}
try{var saved=JSON.parse(localStorage.getItem(key)||'null'),used={};if(saved&&saved.version===1&&Array.isArray(saved.items))saved.items.forEach(function(record){if(!record||!valid(record.package)||hidden(record.package)||used[record.package]||builtins[record.package])return;used[record.package]=true;records.push({package:record.package,name:String(record.name||record.package).slice(0,48)});});}catch(ignore){}
if(container)records.forEach(function(record){container.appendChild(node(record));});
function state(pkg){if(builtins[pkg]&&(builtins[pkg]==='launcher'||document.querySelector('[data-layout="'+builtins[pkg]+'"]')))return 'builtin';return records.some(function(record){return record.package===pkg;})?'pinned':'available';}
function pin(item,options){
  options=options||{};
  if(!item||!valid(item.package)||hidden(item.package)||!item.launchable||!item.enabled){toast('此应用没有可用的启动入口');return false;}
  if(state(item.package)!=='available')return options.position?HVDesktopLayout.placeShortcut(builtins[item.package]||id(item.package),options.position):true;
  if(!window.HVDesktopLayout||!HVDesktopLayout.canAddShortcut()){toast('请先结束当前拖动');return false;}
  var previous=records.slice(),record={package:item.package,name:String(item.name||item.package).slice(0,48)};
  if(!store(records.concat([record])))return false;
  if(!HVDesktopLayout.addShortcut(node(record),options.position)){store(previous);toast('暂时无法添加，请先结束拖动');return false;}
  if(!options.quiet)toast('已添加到桌面');changed();return true;
}
function remove(pkg,quiet){
  if(state(pkg)!=='pinned'||!window.HVDesktopLayout)return false;
  var previous=records.slice(),next=records.filter(function(record){return record.package!==pkg;});
  if(!store(next))return false;
  if(!HVDesktopLayout.removeShortcut(id(pkg))){store(previous);return false;}
  if(!quiet)toast('已移除快捷方式');changed();return true;
}
function refresh(){if(!window.HVJson)return;var request=++epoch;HVJson('/api/hv/installed-apps').then(function(data){
  if(request!==epoch||data.ok!==true||!Array.isArray(data.items)||!data.items.length)return;
  document.dispatchEvent(new CustomEvent('hv-installed-apps',{detail:data}));
  installed={};data.items.forEach(function(item){if(valid(item.package))installed[item.package]=item;});
  records.slice().forEach(function(record){var item=installed[record.package];if(!item){if(!remove(record.package,true))pendingMissing[record.package]=true;return;}delete pendingMissing[record.package];var element=document.querySelector('[data-native-shortcut="'+record.package+'"]');if(element){element.classList.toggle('shortcut-disabled',!item.enabled||!item.launchable);element.querySelector('.app-icon').src='/api/hv/installed-apps/icon?package='+encodeURIComponent(record.package)+'&v='+encodeURIComponent(data.revision);}});
  changed();
},function(){});}
document.addEventListener('click',function(event){var element=event.target.closest('[data-native-shortcut]');if(!element||event.target.closest('[data-remove-shortcut]')||document.documentElement.classList.contains('layout-editing'))return;var pkg=element.getAttribute('data-native-shortcut');var item=installed[pkg];if(!/Pro8HomeView\/1/.test(navigator.userAgent)){toast('请在 Pro8 上打开应用');return;}location.href='pro8://'+(item&&(!item.enabled||!item.launchable)?'app-details':'installed-app')+'?package='+encodeURIComponent(pkg);});
document.addEventListener('keydown',function(event){if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-native-shortcut]')&&!document.documentElement.classList.contains('layout-editing')){event.preventDefault();event.target.click();}});
window.HVDesktopShortcuts={pin:pin,remove:remove,state:state,refresh:refresh,snapshot:function(){return records.map(function(record){return {package:record.package,name:record.name};});}};
document.addEventListener('hv-layout-saved',function(){if(handlingMissing)return;handlingMissing=true;Object.keys(pendingMissing).forEach(function(pkg){if(remove(pkg,true)||state(pkg)!=='pinned')delete pendingMissing[pkg];});handlingMissing=false;});
document.addEventListener('hv-native-refresh',refresh);window.addEventListener('load',refresh);
})();
