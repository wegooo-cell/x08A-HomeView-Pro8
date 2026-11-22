/* iOS-like press feedback: small icon brightness and a bounded widget shade. ES5. */
(function(){'use strict';if(window.HVPressFeedback)return;
var active=null,shade=null,position='',pointer=null,x=0,y=0;
function clear(){if(!active)return;active.classList.remove('hv-pressed-icon');if(shade&&shade.parentNode)shade.parentNode.removeChild(shade);if(position!==null)active.style.position=position;active=null;shade=null;pointer=null;}
function blocked(){var root=document.documentElement;return root.classList.contains('layout-editing')||root.classList.contains('desktop-paging')||root.classList.contains('native-app-motion')||root.classList.contains('native-app-transition');}
function surface(target){
  if(!target||!target.closest||target.closest('input,textarea,select,[disabled],[aria-disabled="true"],.shortcut-remove'))return null;
  var control=target.closest('.home-mini-toggle,.music-controls button');if(control)return {node:control,image:false};
  var icon=target.closest('.app,.folder-child,.app-tile,.sy-open');if(icon){var image=icon.querySelector('.app-icon')||icon.querySelector('img');if(image)return {node:image,image:true};}
  var widget=target.closest('.widget');return widget?{node:widget,image:false}:null;
}
function down(e){if(blocked()||e.button&&e.button!==0||e.isPrimary===false)return;clear();var result=surface(e.target);if(!result)return;active=result.node;pointer=e.pointerId;x=e.clientX;y=e.clientY;position=null;
  if(result.image)active.classList.add('hv-pressed-icon');
  else{position=active.style.position;if(getComputedStyle(active).position==='static')active.style.position='relative';shade=document.createElement('span');shade.className='hv-press-shade';shade.setAttribute('aria-hidden','true');active.appendChild(shade);}
}
document.addEventListener('pointerdown',down,{capture:true,passive:true});
document.addEventListener('pointermove',function(e){if(active&&e.pointerId===pointer&&(Math.abs(e.clientX-x)>10||Math.abs(e.clientY-y)>10))clear();},{capture:true,passive:true});
['pointerup','pointercancel','lostpointercapture'].forEach(function(type){document.addEventListener(type,clear,true);});
window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);document.addEventListener('hv-work-change',clear);
new MutationObserver(function(){if(active&&blocked())clear();}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
window.HVPressFeedback={clear:clear};
})();
