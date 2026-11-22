/* A single JPEG for the album collage selector. The gallery never mounts a live cover wall. */
(function(){
 'use strict';
 var key='homeview:collage-preview:v1',coverKey='homeview:clock-cover-art:v1',saved='',pending=false,empty='';
 function stored(){
  if(saved)return saved;
  try{var uri=localStorage.getItem(key)||'';if(uri.length<220000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(uri))saved=uri;}catch(ignore){}
  return saved;
 }
 function compose(images,shift,write){
  try{
   var c=document.createElement('canvas');c.width=640;c.height=400;
   var ctx=c.getContext('2d'),n=HV.local(),loaded=0;
   ctx.scale(.5,.5);ctx.fillStyle='#17191d';ctx.fillRect(0,0,1280,800);
   for(var i=0;i<images.length;i++){
    var im=images[i];if(!im||!im.complete||!im.naturalWidth)continue;
    var side=Math.min(im.naturalWidth,im.naturalHeight);
    ctx.drawImage(im,(im.naturalWidth-side)/2,(im.naturalHeight-side)/2,side,side,640+shift.x+(i%7*200-700)*1.08,400+shift.y+(Math.floor(i/7)*200-400)*1.08,216.5,216.5);
    loaded++;
   }
   if(write&&!loaded)return '';
   ctx.fillStyle='rgba(0,0,0,.26)';ctx.fillRect(0,0,1280,800);
   ctx.fillStyle='rgba(255,255,255,.95)';ctx.textAlign='center';ctx.textBaseline='top';
   ctx.font='600 30px sans-serif';ctx.fillText(n.mo+'月'+n.d+'日 '+['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][n.dow],640,78);
   ctx.font='600 132px sans-serif';ctx.fillText(HV.pad(n.h)+':'+HV.pad(n.mi),640,109);
   var uri=c.toDataURL('image/jpeg',.83);
   if(write&&uri.length<220000){saved=uri;try{localStorage.setItem(key,uri);}catch(ignore){}}
   return uri;
  }catch(ignore){return '';}
 }
 function capture(images,shift){return compose(images,shift,true);}
 function prepare(done){
  if(stored()||pending)return;
  var urls=[];try{urls=JSON.parse(localStorage.getItem(coverKey)||'[]');}catch(ignore){}
  if(!Array.isArray(urls))return;
  urls=urls.filter(function(u){return typeof u==='string'&&/^https?:\/\/[a-z0-9.-]+\.music\.126\.net\//i.test(u);}).slice(0,28);
  if(!urls.length)return;
  var imgs=[],remaining=urls.length,settled=false;pending=true;
  var timer=setTimeout(finish,6500);
  function finish(){
   if(settled)return;settled=true;pending=false;clearTimeout(timer);
   if(stored())return;
   var available=imgs.filter(function(im){return im.complete&&im.naturalWidth;});if(!available.length)return;
   var tiles=[];for(var i=0;i<28;i++)tiles.push(available[i%available.length]);
   if(capture(tiles,{x:0,y:0})&&done)done();
  }
  urls.forEach(function(url){
   var im=new Image();imgs.push(im);
   im.onload=im.onerror=function(){if(!--remaining)finish();};
   im.src='/api/frame/netease/art?size=192&url='+encodeURIComponent(url);
  });
 }
 function url(name){
  if(name!=='collage')return '/frame/hv/faces/thumbs/'+name+'.svg?v=1';
  return stored()||(empty||(empty=compose([],{x:0,y:0},false)));
 }
 function custom(name){return name==='photos'||name==='photo'||name==='island'||name==='numerals';}
 function wall(){var value;try{value=JSON.parse(localStorage.getItem('hv-app-wall:lockscreen')||'null');}catch(ignore){}return value||{t:'color',c:'#000000'};}
 function render(container,name){
  container.innerHTML='';if(!custom(name)){var im=new Image();im.alt='';im.draggable=false;im.src=url(name);container.appendChild(im);return;}
  var shell=document.createElement('div'),surface=document.createElement('div');shell.className='clock-custom-preview';surface.className='clock-custom-surface';surface.setAttribute('aria-hidden','true');shell.appendChild(surface);container.appendChild(shell);
  if(name==='numerals'&&window.HVNumerals){HVNumerals.mount(surface);return;}
  if(name==='island'&&window.HVIsland){HVIsland.preview(surface);return;}
  if(name==='photos'||name==='photo'){
   var w=wall(),a=HVWallpaper.appearance(w),n=HV.local();surface.classList.add('clock-wallpaper-preview');surface.style.backgroundImage=a.wall;surface.classList.toggle('is-light',HVWallpaper.isLight(w));var time=document.createElement('b'),date=document.createElement('span');time.textContent=HV.pad(n.h)+':'+HV.pad(n.mi);date.textContent=n.mo+'月'+n.d+'日 '+['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][n.dow];surface.appendChild(time);surface.appendChild(date);return;
  }
 }
 function hydrate(root){Array.prototype.forEach.call((root||document).querySelectorAll('[data-custom-clock-preview]'),function(node){render(node,node.getAttribute('data-custom-clock-preview'));});}
 function prepareCustom(done){return HVJson('/api/hv/app-wallpaper?app=lockscreen').then(function(d){if(d&&d.ok&&d.wallpaper){try{localStorage.setItem('hv-app-wall:lockscreen',JSON.stringify(d.wallpaper));}catch(ignore){}if(done)done();}},function(){});}
 window.HVClockPreview={capture:capture,prepare:prepare,prepareCustom:prepareCustom,render:render,hydrate:hydrate,custom:custom,url:url};
})();
