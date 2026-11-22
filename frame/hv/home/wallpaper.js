/* Independent per-app, desktop and fixed lock-screen backgrounds. ES5. */
(function(){'use strict';
var scopes=[['home','家庭'],['calendar','日历'],['photos','相册'],['apps','应用'],['system','系统应用'],['files','文件'],['clock','时钟'],['timer','计时器'],['weather','天气'],['settings','设置'],['faces','表盘选择'],['lockscreen','壁纸锁屏'],['lounge','信息锁屏'],['desktop','桌面']],names={},route=(location.pathname.match(/^\/frame\/hv\/([^/]+)\//)||[])[1],picker=route==='background',requested=(location.search.match(/[?&]target=([a-z]+)(?:&|$)/)||[])[1];
scopes.forEach(function(x){names[x[0]]=x[1];});
var scope=document.body.getAttribute('data-wallpaper-scope')||(picker?(names[requested]?requested:'home'):names[route]?route:'desktop'),desktop=scope==='desktop',key=keyFor(scope),endpoint=endpointFor(scope),base='/frame/hv/home/assets/',themes={blue:{t:'builtin',id:'blue'}},current=defaultFor(scope),scrollTimer,signature='',revision=0,boot=null,paintEpoch=0;
function keyFor(target){return target==='desktop'?'hv-desktop-wall':'hv-app-wall:'+target;}
function endpointFor(target){return target==='desktop'?'/api/hv/desktop-wallpaper':'/api/hv/app-wallpaper?app='+target;}
function defaultFor(target){return target==='desktop'?themes.blue:{t:'color',c:target==='lounge'?'#000000':'#e6e7eb'};}
function neutral(c){var values=[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];return Math.max.apply(null,values)-Math.min.apply(null,values)<9;}

function normalize(s,target){target=target||scope;if(!s)return defaultFor(target);if(!s.t&&s.id)s=Object.assign({},s,{t:s.id==='custom'?'custom':'builtin'});if(s.t==='builtin'&&themes[s.id])return themes[s.id];if(s.t==='auto')return target==='desktop'?{t:'auto'}:defaultFor(target);if(s.t==='color'&&/^#[0-9a-f]{6}$/i.test(s.c||''))return {t:'color',c:s.c};if(s.t==='album'&&/^import-[0-9a-f]{16}$/.test(s.id||''))return {t:'album',id:s.id,name:'相册壁纸',revision:Math.max(0,+s.revision||0)};if(s.t==='image'&&/^[a-zA-Z0-9_.-]{1,120}$/.test(s.id||''))return {t:'image',id:s.id};if(s.t==='custom'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s.image||'')&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s.soft||'')&&s.image.length<1100000&&s.soft.length<160000)return {t:'custom',image:s.image,soft:s.soft,name:'自定义壁纸'};return defaultFor(target);}
function appearance(s){var image,soft;if(s.t==='builtin'){image='/frame/hv/desktop/assets/default-wallpaper.png';soft='/frame/hv/desktop/assets/default-wallpaper-soft.webp';}else if(s.t==='album'){var rev=s.revision?'?rev='+encodeURIComponent(s.revision):'';image='/api/frame/photo/'+s.id+'.wall.webp'+rev;soft='/api/frame/photo/'+s.id+'.soft.webp'+rev;}else if(s.t==='image'){image='/frame/hv/wallpapers/'+encodeURIComponent(s.id);soft=image;}else if(s.t==='custom'){image=s.image;soft=s.soft;}if(image)return {wall:'url("'+image+'")',soft:'url("'+soft+'")',image:image};var c=s.t==='color'?s.c:(function(){var h=HV.local().h;return h<5||h>=21?'#202b55':h<10?'#c5825c':h<17?'#d89436':'#765079';})();var fill=neutral(c)?'linear-gradient('+c+','+c+')':HV.gradientFor(c);return {wall:fill,soft:fill,image:null};}
function isLight(s){if(s.t!=='color')return false;var c=s.c,r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16);return r===g&&g===b?r>140:r*.2126+g*.7152+b*.0722>205;}
function align(){
 var positions=Array.prototype.map.call(document.querySelectorAll('.ha-frost'),function(e){
  var r=e.getBoundingClientRect(),page=e.closest('.desktop-page');if(page){var origin=page.getBoundingClientRect();r={width:r.width,height:r.height,left:r.left-origin.left,top:r.top-origin.top};}
  return r.width&&r.height?[e,-Math.round(r.left)+'px',-Math.round(r.top)+'px']:null;
 });
 positions.forEach(function(p){
  if(!p||p[0].glassX===p[1]&&p[0].glassY===p[2])return;
  p[0].style.setProperty('--glass-x',p[1]);p[0].style.setProperty('--glass-y',p[2]);
  p[0].glassX=p[1];p[0].glassY=p[2];
 });
}
function apply(s){s=normalize(s);var sig=JSON.stringify(s),root=document.documentElement;if(sig===signature&&s.t!=='auto'&&!root.hasAttribute('data-wallpaper-pending'))return Promise.resolve();var token=++paintEpoch,a=appearance(s);current=s;root.setAttribute('data-wallpaper-pending','true');
 function commit(ready){if(token!==paintEpoch||!ready)return;signature=sig;root.style.setProperty('--ha-wall',a.wall);root.style.setProperty('--ha-soft',a.soft);root.setAttribute('data-home-wallpaper',s.t==='builtin'?s.id:s.t);root.setAttribute('data-wallpaper-tone',isLight(s)?'light':'dark');root.setAttribute('data-wallpaper-neutral',s.t==='color'&&neutral(s.c)?'true':'false');root.removeAttribute('data-wallpaper-pending');align();document.dispatchEvent(new CustomEvent('ha-wallpaper-change',{detail:s}));}
 if(!a.image){commit(true);return Promise.resolve();}return preload(a.image).then(commit);
}
function cache(s){try{localStorage.setItem(key,JSON.stringify(normalize(s)));}catch(ignore){}}
function load(){if(boot)return boot;if(HV.canWork&&!HV.canWork()){HV.deferUI('wallpaper-load',load);return Promise.resolve();}var version=revision;return HVJson(endpoint).then(function(d){if(version===revision&&d&&d.ok&&d.wallpaper){cache(d.wallpaper);HV.deferUI('wallpaper-apply',function(){if(version===revision)apply(d.wallpaper);});}},function(){});}
function saveFor(target,s){if(!names[target])return Promise.reject(new Error('请选择应用'));s=normalize(s,target);return HV.post(endpointFor(target),s).then(function(d){if(!d||!d.ok)throw new Error('背景未保存，请重试');try{localStorage.setItem(keyFor(target),JSON.stringify(s));}catch(ignore){}if(target===scope){revision++;apply(s);}return s;});}
function save(s){return saveFor(scope,s);}

function importFile(file){return new Promise(function(resolve,reject){if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))return reject(new Error('请选择 JPG、PNG 或 WebP 图片'));if(file.size>12*1024*1024)return reject(new Error('请选择小于 12 MB 的图片'));var url=URL.createObjectURL(file),im=new Image();function done(){URL.revokeObjectURL(url);}im.onerror=function(){done();reject(new Error('无法读取这张图片，请换一张试试'));};im.onload=function(){try{if(im.naturalWidth<80||im.naturalHeight<80)throw new Error('图片太小，请选择更清晰的图片');var c=document.createElement('canvas'),ctx;c.width=1280;c.height=800;ctx=c.getContext('2d');var scale=Math.max(1280/im.naturalWidth,800/im.naturalHeight),w=im.naturalWidth*scale,h=im.naturalHeight*scale;ctx.drawImage(im,(1280-w)/2,(800-h)/2,w,h);var data=c.toDataURL('image/jpeg',.82);if(data.length>1050000)data=c.toDataURL('image/jpeg',.6);var tiny=document.createElement('canvas');tiny.width=80;tiny.height=50;tiny.getContext('2d').drawImage(c,0,0,80,50);var soft=document.createElement('canvas');soft.width=320;soft.height=200;var sc=soft.getContext('2d');if('filter' in sc)sc.filter='blur(4px)';sc.drawImage(tiny,-6,-4,332,208);done();if(data.length>1100000)throw new Error('图片细节过多，请选择更简洁的壁纸');resolve({t:'custom',image:data,soft:soft.toDataURL('image/jpeg',.8)});}catch(e){done();reject(e);}};im.src=url;});}
function fromPhoto(p){if(/^import-[0-9a-f]{16}$/.test(p.id||''))return Promise.resolve({t:'album',id:p.id,name:'相册壁纸'});var url=p.url||p.src||'';if(!/^\/api\/frame\/photo\/[A-Za-z0-9%_.-]+(?:\?[A-Za-z0-9=&%_.-]*)?$/.test(url))return Promise.reject(new Error('这张照片暂时不能设为壁纸'));return fetch(url).then(function(r){if(!r.ok)throw new Error('照片未能加载');return r.blob();}).then(importFile).then(function(s){s.name='相册壁纸';return s;});}
function cached(){
 try{return JSON.parse((localStorage.getItem(key)||(desktop&&localStorage.getItem('hv-wall')))||'null');}
 catch(ignore){return null;}
}
function preload(image){
 if(!image)return Promise.resolve(true);
 return new Promise(function(resolve){var probe=new Image(),done=false,timeout=setTimeout(function(){finish(false);},8000);
 function finish(ok){if(done)return;done=true;clearTimeout(timeout);resolve(ok);}
 probe.onload=function(){if(probe.decode)probe.decode().then(function(){finish(true);},function(){finish(false);});else finish(true);};probe.onerror=function(){finish(false);};probe.src=image;
 });
}
if(desktop&&window.hvDesktopWallpaperRequest){
 var initialRevision=revision;
 boot=window.hvDesktopWallpaperRequest.then(function(data){var value=data&&data.ok&&data.wallpaper?data.wallpaper:cached();if(!value)return;if(revision!==initialRevision)return;if(data&&data.ok)cache(value);return apply(value);}).then(function(){document.documentElement.removeAttribute('data-desktop-wallpaper');boot=null;load();});
}else{var first=cached();if(first)apply(first);load();}
window.addEventListener('storage',function(e){if(e.key===key)try{revision++;apply(JSON.parse(e.newValue));}catch(ignore){}});
document.addEventListener('scroll',function(){clearTimeout(scrollTimer);scrollTimer=setTimeout(align,100);},true);
document.addEventListener('app-visibility',function(e){if(e.detail)load();});
// Settings already broadcasts storage changes immediately. Static wallpapers
// do not need a full JSON/file round trip every fifteen seconds.
setInterval(function(){if(HV.canWork())load();},300000);
setInterval(function(){if(current.t==='auto'&&HV.canWork())apply(current);},60000);
function entry(){if(document.body.getAttribute('data-wallpaper-entry')==='off'||picker||desktop||scope==='lockscreen'||scope==='settings'||document.getElementById('ha-wallpaper'))return;var tools=document.querySelector('.heading-tools'),b=document.createElement('button');b.id='app-background-open';b.className='head-action app-background-open';b.textContent='背景';b.setAttribute('aria-label','设置'+names[scope]+'背景');b.onclick=function(){HV.navigate('/frame/hv/background/?target='+scope);};if(tools)tools.appendChild(b);else{b.className+=' wallpaper-floating';if(scope==='weather')b.className+=' weather-wallpaper-entry';document.body.appendChild(b);}}
entry();
window.HVWallpaper=window.HVHomeWallpaper={isLight:isLight,scope:scope,scopes:scopes,name:names[scope],saveFor:saveFor,get:function(){return current;},save:save,load:load,align:align,importFile:importFile,fromPhoto:fromPhoto,appearance:appearance,themes:themes};
})();
