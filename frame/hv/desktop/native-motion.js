/* Bounded native textures during motion; the actual application/audio stays alive. ES5. */
(function(){'use strict';
var capability='',bridge=window.HomeViewMotion,sequence=0,job=null,root=document.documentElement;
function available(){return !!(capability&&bridge)&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);}
function restore(){root.classList.remove('native-motion-snapshot');root.classList.remove('native-snapshot-pending');}
function call(name,args){try{bridge[name].apply(bridge,[capability].concat(args));return true;}catch(ignore){return false;}}
function discard(){if(!job)return;var old=job;job=null;clearTimeout(old.timer);restore();call('release',[old.id,!!(window.HVDesktopHost&&HVDesktopHost.view())]);}
function start(opening,frame,ready,done,fail){
 if(!available())return false;discard();
 var id=++sequence;job={id:id,frame:frame,ready:ready,done:done,fail:fail,opening:opening};
 root.classList.add('native-snapshot-pending');
 job.timer=setTimeout(function(){receive(id,'fail');},2800);
 if(!call('prepare',[id,opening])){discard();return false;}return true;
}
function capture(){if(!job)return;var current=job;
 function wait(){if(job!==current)return;
  if(current.frame.hvReady){
   // Java waits for the actual WebView draw/window submission. JS rAF alone
   // can run before the target iframe pixels have reached the window surface.
   call('capture',[current.id]);
  }else setTimeout(wait,30);
 }wait();
}
function receive(id,stage){
 var current=job;if(!current||current.id!==id)return;
 if(stage==='background'){current.ready('background');return;}
 if(stage==='ready'){clearTimeout(current.timer);current.timer=setTimeout(function(){receive(id,'fail');},1200);root.classList.add('native-motion-snapshot');current.ready('ready');return;}
 if(stage==='done'){
  job=null;clearTimeout(current.timer);restore();current.done();call('release',[id,!!(window.HVDesktopHost&&HVDesktopHost.view())]);return;
 }
 if(stage==='fail'){
  job=null;clearTimeout(current.timer);restore();call('release',[id,!!(window.HVDesktopHost&&HVDesktopHost.view())]);if(current.fail)current.fail();
 }
}
window.HVNativeMotion={connect:function(key){if(typeof key==='string'&&key.length<=64)capability=key;},available:available,receive:receive,
 start:start,capture:capture,cancel:discard,
 cacheHome:function(){if(available()&&!job)call('cacheHome',[]);},
 move:function(a,alpha){if(job)call('move',[job.id,a[0],a[1],a[2],a[3],alpha==null?1:alpha]);},
 finish:function(a,alpha,duration){if(job)call('finish',[job.id,a[0],a[1],a[2],a[3],alpha==null?1:alpha,duration||300]);},
 dissolve:function(a,alpha){if(job)call('dissolve',[job.id,a[0],a[1],alpha]);},
 recentState:function(){try{return capability&&bridge?JSON.parse(bridge.recentState(capability)):null;}catch(ignore){return null;}},
 closeRecent:function(id){try{return capability&&bridge?JSON.parse(bridge.closeRecent(capability,id)):null;}catch(ignore){return null;}},
 stats:function(){try{return JSON.parse(bridge.stats(capability));}catch(ignore){return {};}}
};
})();
