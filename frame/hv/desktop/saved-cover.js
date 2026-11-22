/* Keep one small, decoded cover per desktop widget. ES5. */
(function(){
 'use strict';
 function SavedCover(key,node,paint){
  var ready=null,pending='',generation=0;
  try{
   var raw=localStorage.getItem(key);
   if(raw&&raw.length<150000){
    var once=JSON.parse(raw);
    if(once.item&&typeof once.item.id==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(once.src))ready=once;
   }
  }catch(ignore){}
  function show(record){
   if(node.getAttribute('src')!==record.src)node.src=record.src;
   node.hidden=false;paint(record.item);
  }
  function save(probe,item,version){
   if(version!==generation)return;
   try{
    var canvas=document.createElement('canvas'),scale=Math.min(1,224/Math.max(probe.naturalWidth,probe.naturalHeight));
    canvas.width=Math.max(1,Math.round(probe.naturalWidth*scale));canvas.height=Math.max(1,Math.round(probe.naturalHeight*scale));
    canvas.getContext('2d').drawImage(probe,0,0,canvas.width,canvas.height);
    var src=canvas.toDataURL('image/jpeg',.8);
    localStorage.setItem(key,JSON.stringify({item:item,src:src}));
    ready={item:item,src:src};
   }catch(ignore){}
  }
  this.restore=function(){if(ready){show(ready);return ready.item;}return null;};
  this.update=function(item,url){
   if(!item||!url)return;
   if(ready&&ready.item.id===item.id){
    if(pending){++generation;pending='';}
    if(JSON.stringify(ready.item)!==JSON.stringify(item)){
     ready.item=item;
     if(ready.src.indexOf('data:image/jpeg;')===0)try{localStorage.setItem(key,JSON.stringify(ready));}catch(ignore){}
    }
    show(ready);return;
   }
   if(pending===url)return;
   pending=url;var version=++generation,probe=new Image();
   probe.onload=function(){
    if(version!==generation)return;
    pending='';ready={item:item,src:url};show(ready);
    if(window.requestIdleCallback)requestIdleCallback(function(){save(probe,item,version);},{timeout:800});
    else setTimeout(function(){save(probe,item,version);},100);
   };
   probe.onerror=function(){if(version===generation)pending='';};
   probe.src=url;
  };
 }
 window.HVSavedCover=SavedCover;
})();
