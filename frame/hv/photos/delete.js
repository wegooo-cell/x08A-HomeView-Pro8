/* Confirmed deletion of locally imported photos only. ES5. */
(function(){'use strict';var P=HVPhotos,U=AppUI,selecting=false,selected={},busy=false,pending=[],fromViewer=false,press=null,pressTimer=0,suppressClickUntil=0;
var modal=document.createElement('div');modal.className='ui-modal photo-delete-modal';modal.id='photo-delete-modal';modal.hidden=true;
modal.innerHTML='<div class="ui-scrim" data-delete-cancel></div><section class="ui-sheet ha-frost photo-delete-sheet" role="dialog" aria-modal="true" aria-labelledby="photo-delete-title"><h2 id="photo-delete-title"></h2><p>将从 HomeView 相册中删除，图片文件夹中的对应照片也会删除。</p><p id="photo-delete-error" role="status"></p><footer><button class="soft-button" data-delete-cancel>取消</button><button class="danger-button" id="photo-delete-confirm">删除照片</button></footer></section>';document.body.appendChild(modal);
function local(p){return !!p&&/^import-[0-9a-f]{16}$/.test(p.id);}
function ids(){return P.items().filter(function(p){return local(p)&&selected[p.id];}).map(function(p){return p.id;});}
function decorate(){
 var all=P.items(),picked=ids();document.getElementById('photos-select').textContent=selecting?'取消':'选择';document.getElementById('photos-select').setAttribute('aria-pressed',String(selecting));document.getElementById('photos-select').disabled=busy||!all.some(local);
 var del=document.getElementById('photos-delete');del.hidden=!selecting;del.disabled=busy||!picked.length;del.textContent='删除'+(picked.length?'（'+picked.length+'）':'');
 if(selecting)document.getElementById('photos-slideshow').disabled=true;
 Array.prototype.forEach.call(document.querySelectorAll('[data-photo]'),function(tile){var id=tile.getAttribute('data-photo'),can=all.some(function(p){return p.id===id&&local(p);}),mark=tile.querySelector('.photo-select-mark');tile.classList.toggle('photo-selected',!!selected[id]);tile.classList.toggle('photo-selecting',selecting&&can);if(selecting)tile.setAttribute('aria-pressed',String(!!selected[id]));else tile.removeAttribute('aria-pressed');if(selecting&&can&&!mark){mark=document.createElement('span');mark.className='photo-select-mark';mark.setAttribute('aria-hidden','true');tile.appendChild(mark);}if(mark){mark.hidden=!selecting;mark.textContent=selected[id]?'✓':'';}});
 document.getElementById('photo-delete-current').hidden=!local(P.current());
}
function reset(){selecting=false;selected={};decorate();document.getElementById('photos-slideshow').disabled=!document.querySelector('[data-photo]');}
function ask(list,viewer){if(busy||!list.length)return;pending=list.slice();fromViewer=viewer;P.closeViewer();document.getElementById('photo-delete-title').textContent='删除 '+pending.length+' 张照片？';document.getElementById('photo-delete-error').textContent='';U.open('photo-delete-modal');if(window.HVWallpaper)HVWallpaper.align();}
document.getElementById('photos-select').onclick=function(){if(busy)return;if(selecting)reset();else{selecting=true;decorate();}};
document.getElementById('photos-delete').onclick=function(){ask(ids(),false);};
document.getElementById('photo-delete-current').onclick=function(){var p=P.current();if(local(p))ask([p.id],true);};
var gallery=document.getElementById('photo-gallery');
function cancelPress(){clearTimeout(pressTimer);pressTimer=0;press=null;}
function selectHeld(tile){if(busy)return;var id=tile.getAttribute('data-photo'),p=P.items().filter(function(x){return x.id===id;})[0];if(!local(p))return;selecting=true;selected[id]=true;suppressClickUntil=Date.now()+700;decorate();}
gallery.addEventListener('pointerdown',function(e){cancelPress();suppressClickUntil=0;if(busy||e.isPrimary===false||e.button&&e.button!==0)return;var tile=e.target.closest('[data-photo]');if(!tile)return;press={id:e.pointerId,x:e.clientX,y:e.clientY,tile:tile};pressTimer=setTimeout(function(){if(!press)return;var tile=press.tile;cancelPress();selectHeld(tile);},500);});
gallery.addEventListener('pointermove',function(e){if(press&&press.id===e.pointerId&&Math.abs(e.clientX-press.x)+Math.abs(e.clientY-press.y)>12)cancelPress();},{passive:true});
gallery.addEventListener('scroll',cancelPress,{passive:true});
document.addEventListener('pointerup',cancelPress,true);document.addEventListener('pointercancel',cancelPress,true);window.addEventListener('blur',cancelPress);document.addEventListener('visibilitychange',function(){if(document.hidden)cancelPress();});
gallery.addEventListener('contextmenu',function(e){var tile=e.target.closest('[data-photo]');if(!tile)return;e.preventDefault();cancelPress();selectHeld(tile);});
gallery.addEventListener('dragstart',function(e){e.preventDefault();});
gallery.addEventListener('click',function(e){var tile=e.target.closest('[data-photo]');if(!tile)return;if(Date.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();return;}if(!selecting)return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;var id=tile.getAttribute('data-photo'),p=P.items().filter(function(x){return x.id===id;})[0];if(!local(p))return;if(selected[id])delete selected[id];else selected[id]=true;decorate();},true);
['photos-all','photos-favorites','photos-recent'].forEach(function(id){document.getElementById(id).addEventListener('click',function(){if(selecting){selected={};decorate();}});});
modal.addEventListener('click',function(e){if(e.target.closest('[data-delete-cancel]')&&!busy)U.close();});
document.addEventListener('app-modal-close',function(e){if(e.detail!=='photo-delete-modal')return;if(fromViewer&&!busy){fromViewer=false;P.restoreViewer();}});
document.addEventListener('keydown',function(e){if(busy&&!modal.hidden&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}},true);
['photos-all','photos-favorites','photos-recent'].forEach(function(id){document.getElementById(id).addEventListener('click',function(){selected={};},true);});
document.addEventListener('hv-back',function(e){if(busy&&!modal.hidden){e.preventDefault();return;}if(selecting&&modal.hidden&&!P.viewerOpen()){reset();e.preventDefault();}});
document.getElementById('photo-delete-confirm').onclick=function(){
 if(busy)return;busy=true;var wanted=pending.slice();modal.classList.add('is-deleting');this.disabled=true;modal.querySelector('[data-delete-cancel].soft-button').disabled=true;
 HV.post('/api/frame/photos/delete',{ids:wanted,confirmed:true}).then(function(d){if(d.ok===false)throw new Error(d.error||'照片未能删除');var removed=(d.removed||[]).filter(function(id){return wanted.indexOf(id)>=0;}),restore=fromViewer;fromViewer=false;P.remove(removed);removed.forEach(function(id){delete selected[id];});U.close();if(restore)P.restoreViewer();try{localStorage.setItem('homeview:album-updated',String(Date.now()));parent.document.dispatchEvent(new Event('hv-album-updated'));}catch(ignore){}HV.toast(d.cleanup_pending?'已从相册移除，部分文件未清理':'已删除 '+removed.length+' 张照片');}).catch(function(e){document.getElementById('photo-delete-error').textContent=e.message||'照片未能删除';}).then(function(){busy=false;modal.classList.remove('is-deleting');document.getElementById('photo-delete-confirm').disabled=false;modal.querySelector('[data-delete-cancel].soft-button').disabled=false;decorate();});
};
window.HVPhotoDelete={decorate:decorate};decorate();
})();
