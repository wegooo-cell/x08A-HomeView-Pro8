/* Desktop album slideshow. Decode the incoming thumbnail before changing cards. */
(function(){
  'use strict';
  var interval=5*60*1000,key='homeview:desktop-photo:v1',widget=document.getElementById('photo-open');
  var layers=widget.querySelectorAll('img'),urls=[],front=null,current='',due=0,loading='',failed={},resume=null,sample=false;
  try{resume=JSON.parse(localStorage.getItem(key)||'null');}catch(ignore){}
  function thumbnail(p){
    if(!p||p.kind==='video'||typeof p.url!=='string'||p.url.indexOf('/api/frame/photo/')!==0)return '';
    try{
      var u=new URL(p.url,location.origin);if(u.origin!==location.origin||u.pathname.indexOf('/api/frame/photo/')!==0)return '';
      u.searchParams.set('w','640');return u.pathname+u.search;
    }catch(ignore){return '';}
  }
  function caption(){
    widget.querySelector('.photo-caption small').textContent=sample?'示例相册':'回忆';
    widget.querySelector('.photo-caption b').textContent=sample?'风景示例':'我的照片';
  }
  function shown(node,url,retainedAt){
    if(url!==loading)return;
    loading='';if(urls.indexOf(url)<0){node.removeAttribute('src');tick();return;}
    var old=front,at=retainedAt||Date.now();
    front=node;current=url;due=at+interval;resume=null;
    if(old)old.classList.remove('photo-top');
    node.classList.add('photo-top','photo-visible');widget.classList.remove('is-empty');caption();
    if(old){var previousSrc=old.getAttribute('src');setTimeout(function(){
      if(front!==old&&old.getAttribute('src')===previousSrc&&loading!==previousSrc){
        old.classList.remove('photo-visible');old.removeAttribute('src');
      }
    },300);}
    try{if(!sample)localStorage.setItem(key,JSON.stringify({url:url,at:at}));}catch(ignore){}
  }
  function tick(){
    if(window.HVDesktopLayout&&HVDesktopLayout.pages.current()>0||!HV.canWork()||!urls.length||loading)return;
    var now=Date.now(),i=urls.indexOf(current),keep=0,start=(i+1)%urls.length;
    if(i>=0&&(now<due||urls.length===1))return;
    if(!front&&resume&&typeof resume.at==='number'&&resume.at>0&&resume.at<=now){
      var saved=urls.indexOf(resume.url);
      if(saved>=0){keep=now-resume.at<interval?resume.at:0;start=keep?saved:(saved+1)%urls.length;}
    }
    for(var n=0;n<urls.length;n++){
      var pos=(start+n)%urls.length,url=urls[pos];
      if(url===current||failed[url]>now)continue;
      var node=front===layers[0]?layers[1]:layers[0],retainedAt=pos===start?keep:0;
      loading=url;
      node.classList.remove('photo-top','photo-visible');
      node.onload=function(){node.onload=node.onerror=null;HV.deferUI('desktop-photo-ready',function(){shown(node,url,retainedAt);});};
      node.onerror=function(){node.onload=node.onerror=null;loading='';failed[url]=Date.now()+60000;node.removeAttribute('src');tick();};
      node.src=url;return;
    }
  }
  function update(data){
    var items=data.photos||data.media||[],next=[];
    if(!Array.isArray(items))return;
    items.forEach(function(item){var url=thumbnail(item);if(url&&next.indexOf(url)<0)next.push(url);});
    urls=next;
    Object.keys(failed).forEach(function(url){if(next.indexOf(url)<0)delete failed[url];});
    sample=data.sample===true||/(^|[\\/])samples[\\/]photos[\\/]?$/.test(data.folder||'');
    if(front&&urls.length)caption();
    if(!urls.length){
      current='';due=0;front=null;loading='';widget.classList.add('is-empty');
      Array.prototype.forEach.call(layers,function(img){img.onload=img.onerror=null;img.classList.remove('photo-visible','photo-top');img.removeAttribute('src');});
      widget.querySelector('.photo-caption small').textContent='连接照片来源';
      widget.querySelector('.photo-caption b').textContent='你的照片';
    }
    tick();
  }
  window.HVPhotoWidget={update:update,tick:tick};
})();
