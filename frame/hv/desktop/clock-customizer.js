/* Selected video reference -> Numerals editing, ES5. Local design preferences only. */
(function(){
  'use strict';
  var KEY='homeview:clock-numerals:v1',LEGACY='homeview-design:numerals:v1',ASSETS='/frame/hv/desktop/assets/',Q=new URLSearchParams(location.search);
  var styles=[['minimal','简约'],['full','经典'],['ticks','刻度'],['quarters','数字']];
  var colors=[['blue','晴蓝','#6899d4','#050909','#fff4d9'],['green','薄荷','#9ab9a2','#244433','#f8f3e8'],['orange','珊瑚','#df8868','#602d21','#fff5e5'],['yellow','麦黄','#dbc479','#544421','#fff9e8'],['pink','浅粉','#d6adb9','#633d4e','#fff4ec'],['graphite','石墨','#4d535e','#171b23','#f5f3ec']];
  var fonts=[['rounded','默认','"HV Clock PingFang","HV PingFang SC",sans-serif',200],['system','标准','"HV Clock PingFang","HV PingFang SC",sans-serif',400],['light','纤细','"HV Clock PingFang","HV PingFang SC",sans-serif',100]];
  var handNames=[['classic','经典'],['slim','纤细'],['bold','实心']];
  var layer=null,preview=null,draft=null,tab='style',focusBefore=null,timer=null,opened=false,onCloseCallback=null;
  function copy(o){return {style:o.style,color:o.color,font:o.font,hands:o.hands};}
  function item(list,id){for(var i=0;i<list.length;i++)if(list[i][0]===id)return list[i];return list[0];}
  function valid(list,id,fallback){for(var i=0;i<list.length;i++)if(list[i][0]===id)return id;return fallback;}
  function read(){var s={};try{s=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(LEGACY)||'{}')||{};}catch(ignore){}return {style:valid(styles,s.style,'quarters'),color:valid(colors,s.color,'blue'),font:valid(fonts,s.font,'rounded'),hands:valid(handNames,s.hands,'classic')};}
  function svg(tag,attrs){var n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(var k in attrs)n.setAttribute(k,attrs[k]);return n;}
  function build(root,cfg,thumb){
    root.classList.add('num-surface');root.innerHTML='';root._numThumb=!!thumb;
    var dial=svg('svg',{'class':'nm',viewBox:'0 0 200 200','aria-hidden':'true'}),ticks=svg('g',{'class':'num-ticks'}),digits=svg('g',{'class':'num-digits'});
    for(var i=0;i<60;i++){
      var anchor=svg('g',{transform:'translate(100 100) rotate('+(i*6)+')'}),edge=svg('g',{transform:'translate(0 -96)'}),grow=svg('g',{'class':'num-tick-grow','data-tick':i});
      grow.appendChild(svg('line',{x1:0,y1:0,x2:0,y2:i%5?4.2:9.5,'stroke-width':i%5?.55:1.35,'stroke-linecap':'round'}));edge.appendChild(grow);anchor.appendChild(edge);ticks.appendChild(anchor);
    }
    for(var n=1;n<=12;n++){
      var pos=svg('g',{'class':'num-digit','data-number':n}),size=svg('g',{'class':'num-digit-size'}),text=svg('text',{x:0,y:21.4,'text-anchor':'middle','font-size':64});text.textContent=n;size.appendChild(text);pos.appendChild(size);digits.appendChild(pos);
    }
    dial.appendChild(ticks);dial.appendChild(digits);
    var date=svg('text',{'class':'num-date'});dial.appendChild(date);
    var center=svg('g',{transform:'translate(100 100)','class':'num-hands'});
    ['hour','minute','second'].forEach(function(name){var rot=svg('g',{'class':'num-'+name});if(name!=='second')rot.appendChild(svg('line',{'class':'num-hand-stem',x1:0,y1:0,x2:0,y2:-25,'stroke-linecap':'round'}));var shape=svg('line',{'class':name==='second'?'num-hand-line':'num-hand-body',x1:0,y1:name==='second'?13:-21,x2:0,y2:-50,'stroke-linecap':'round'});rot.appendChild(shape);center.appendChild(rot);});
    center.appendChild(svg('circle',{'class':'num-hub',cx:0,cy:0,r:2.95}));center.appendChild(svg('circle',{'class':'num-pin',cx:0,cy:0,r:1}));dial.appendChild(center);root.appendChild(dial);
    apply(root,cfg,true);root.tick=function(){tick(root);};root.fast=true;tick(root);return root;
  }
  function apply(root,cfg,initial){
    root._numConfig=copy(cfg);var col=item(colors,cfg.color),font=item(fonts,cfg.font),mono=root._numThumb,ink=mono?'#b9b9bd':col[3],hands=mono?'#eee':col[4];
    root.style.backgroundColor=mono?'#171719':col[2];root.setAttribute('data-numerals-style',cfg.style);root.setAttribute('data-numerals-color',cfg.color);root.setAttribute('data-numerals-font',cfg.font);root.setAttribute('data-numerals-hands',cfg.hands);
    var digits=root.querySelectorAll('.num-digit');
    for(var i=0;i<digits.length;i++){
      var n=+(digits[i].getAttribute('data-number')),angle=n*Math.PI/6,quarter=n%3===0,r=cfg.style==='ticks'?68:80,x=100+Math.sin(angle)*r,y=100-Math.cos(angle)*r,size=cfg.style==='ticks'?21.5:25.2,visible=cfg.style!=='minimal';
      if(cfg.style==='quarters'){visible=quarter;size=116;r=65;x=100+Math.sin(angle)*r;y=104;if(n===12){x=85.5;y=52;}if(n===6){x=98;y=153;}if(n===12)x=89.5;if(n===3)x+=.2;y+=.8;}
      digits[i].style.transform='translate('+x.toFixed(3)+'px,'+y.toFixed(3)+'px)';digits[i].style.opacity=visible?'1':'0';digits[i].querySelector('.num-digit-size').style.transform='scale('+((size/64)*(cfg.style==='quarters'?(n===3?.92:n===6||n===9?1.058:1):1)).toFixed(5)+','+((size/64)*(cfg.style==='quarters'?.98:1)).toFixed(5)+')';
      var text=digits[i].querySelector('text');text.style.fill=ink;text.style.fontFamily=font[2];text.style.fontWeight=font[3];text.style.stroke=cfg.font==='rounded'?ink:'none';text.style.strokeWidth=cfg.font==='rounded'?'.16':'0';text.style.strokeLinejoin='round';
      /* PingFang uses tabular advances. Set only the large 12 explicitly so 1 never collides with 9. */
      if(n===12){if(cfg.style==='quarters'){text.style.letterSpacing='0';if(!text.querySelector('tspan')){text.textContent='';var one=svg('tspan',{x:-9.6,textLength:43,lengthAdjust:'spacingAndGlyphs'}),two=svg('tspan',{x:10.9,textLength:37.6,lengthAdjust:'spacingAndGlyphs'});one.textContent='1';two.textContent='2';text.appendChild(one);text.appendChild(two);}}else{text.style.letterSpacing='';if(text.querySelector('tspan'))text.textContent='12';}}
    }
    var ticks=root.querySelectorAll('.num-tick-grow');
    for(var j=0;j<ticks.length;j++){var major=j%5===0,on=cfg.style==='ticks'||cfg.style==='minimal'&&major;ticks[j].style.transform='scaleY('+(on?1:0)+')';ticks[j].style.opacity=on?(major?'1':'.6'):'0';ticks[j].querySelector('line').style.stroke=ink;}
    var date=root.querySelector('.num-date'),corner=cfg.style==='quarters'||cfg.style==='minimal';date.setAttribute('text-anchor',corner?'start':'middle');date.style.transform=corner?'translate(-48px,190px)':'translate(100px,62px)';date.style.fill=ink;
    var hour=root.querySelector('.num-hour .num-hand-body'),minute=root.querySelector('.num-minute .num-hand-body'),second=root.querySelector('.num-second line'),thin=cfg.hands==='slim',bold=cfg.hands==='bold';
    hour.setAttribute('y1',bold?-4:thin?-18:-21);hour.setAttribute('y2',-46);minute.setAttribute('y1',bold?-4:thin?-18:-21);minute.setAttribute('y2',-82);
    hour.style.stroke=minute.style.stroke=thin?'#fff':hands;hour.setAttribute('stroke-width',thin?3.3:bold?8.5:7.2);minute.setAttribute('stroke-width',thin?2.5:bold?7.4:7.2);
    var stems=root.querySelectorAll('.num-hand-stem');for(var s=0;s<stems.length;s++){stems[s].style.stroke='#fffdf4';stems[s].setAttribute('stroke-width',thin?.75:1.15);}
    second.style.stroke='#fffdf4';second.setAttribute('stroke-width',.7);second.style.opacity=bold?'0':'.94';
    var hub=root.querySelector('.num-hub');hub.style.fill='#fffdf4';root.querySelector('.num-pin').style.fill=mono?'#171719':col[2];
    if(initial){root.classList.add('num-initial');var nodes=root.querySelectorAll('.num-digit,.num-digit-size,.num-tick-grow,.num-date');for(var k=0;k<nodes.length;k++)nodes[k].style.transition='none';requestAnimationFrame(function(){for(var z=0;z<nodes.length;z++)nodes[z].style.transition='';root.classList.remove('num-initial');});}
  }
  function tick(root){
    var now=HV.now(),t=HV.local(now),h=t.h%12,m=t.mi,s=t.s+now.getMilliseconds()/1000;root.querySelector('.num-hour').style.transform='rotate('+(h*30+m/2+s/120)+'deg)';root.querySelector('.num-minute').style.transform='rotate('+(m*6+s/10)+'deg)';
    var angle=s*6;if(root._numSecond!=null)while(angle<root._numSecond)angle+=360;
    var sec=root.querySelector('.num-second');if(root._numSecond==null){sec.style.transition='none';sec.style.transform='rotate('+angle+'deg)';requestAnimationFrame(function(){sec.style.transition='';});}else sec.style.transform='rotate('+angle+'deg)';root._numSecond=angle;
    root.querySelector('.num-date').textContent=['周日','周一','周二','周三','周四','周五','周六'][t.dow]+' '+t.d;
  }
  function bridge(){try{return window.HVClockBridge||parent.HVClockBridge;}catch(ignore){return null;}}
  function makeUI(){
    if(layer)return;layer=document.createElement('section');layer.className='num-editor';layer.hidden=true;layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-labelledby','ne-title');
    layer.innerHTML='<h1 id="ne-title">数字表盘</h1><div class="ne-tabs" role="tablist" aria-label="表盘设置"><button role="tab" id="ne-tab-style" aria-controls="ne-panel-style" data-ne-tab="style">样式</button><button role="tab" id="ne-tab-color" aria-controls="ne-panel-color" data-ne-tab="color">颜色</button><button role="tab" id="ne-tab-font" aria-controls="ne-panel-font" data-ne-tab="font">字体</button><button role="tab" id="ne-tab-hands" aria-controls="ne-panel-hands" data-ne-tab="hands">指针</button></div><div class="ne-preview" aria-label="表盘实时预览"><div class="ne-preview-face"></div></div><div id="ne-panel-style" class="ne-options" role="tabpanel" aria-labelledby="ne-tab-style"></div><div id="ne-panel-color" class="ne-options ne-color-options" role="tabpanel" aria-labelledby="ne-tab-color" hidden></div><div id="ne-panel-font" class="ne-options" role="tabpanel" aria-labelledby="ne-tab-font" hidden></div><div id="ne-panel-hands" class="ne-options" role="tabpanel" aria-labelledby="ne-tab-hands" hidden></div><p class="ne-option-caption" aria-live="polite"></p><button class="ne-round ne-cancel" aria-label="取消更改"><img src="'+ASSETS+'ion-close.svg" alt=""></button><button class="ne-gallery">展示的时钟</button><button class="ne-round ne-save" aria-label="保存表盘"><img src="'+ASSETS+'ion-checkmark.svg" alt=""></button>';
    document.body.appendChild(layer);preview=layer.querySelector('.ne-preview-face');
    layer.addEventListener('click',function(e){var t=e.target.closest('[data-ne-tab]'),choice=e.target.closest('[data-ne-kind]');if(t){chooseTab(t.getAttribute('data-ne-tab'));return;}if(choice){draft[choice.getAttribute('data-ne-kind')]=choice.getAttribute('data-ne-value');apply(preview,draft);refreshSelection();return;}if(e.target.closest('.ne-save'))close(true);else if(e.target.closest('.ne-cancel'))close(false);else if(e.target.closest('.ne-gallery')){close(false);if(window.HVClockCarousel)HVClockCarousel.openPicker();}});
  }
  function option(kind,id,name,cls){var b=document.createElement('button');b.className='ne-choice '+(cls||'');b.setAttribute('role','radio');b.setAttribute('aria-label',name);b.setAttribute('data-ne-kind',kind);b.setAttribute('data-ne-value',id);return b;}
  function thumbnail(button,cfg,hand){var clip=document.createElement('div');clip.className='ne-thumb';var face=document.createElement('div');face.className='ne-thumb-face';clip.appendChild(face);button.appendChild(clip);build(face,cfg,true);if(hand){var caption=document.createElement('span');caption.textContent=hand;button.appendChild(caption);}}
  function renderOptions(){
    var panels=layer.querySelectorAll('.ne-options');for(var p=0;p<panels.length;p++)panels[p].innerHTML='';
    styles.forEach(function(s){var b=option('style',s[0],s[1]+'样式'),c=copy(draft);c.style=s[0];thumbnail(b,c);layer.querySelector('#ne-panel-style').appendChild(b);});
    colors.forEach(function(c){var b=option('color',c[0],c[1],'ne-color');b.style.setProperty('--swatch',c[2]);b.innerHTML='<span></span>';layer.querySelector('#ne-panel-color').appendChild(b);});
    fonts.forEach(function(f){var b=option('font',f[0],f[1]+'字体','ne-font');b.textContent='12';b.style.fontFamily=f[2];b.style.fontWeight=f[3];layer.querySelector('#ne-panel-font').appendChild(b);});
    handNames.forEach(function(h){var b=option('hands',h[0],h[1]+'指针','ne-hand'),c=copy(draft);c.style='full';c.hands=h[0];thumbnail(b,c,h[1]);layer.querySelector('#ne-panel-hands').appendChild(b);});
    refreshSelection();
  }
  function refreshSelection(){
    var nodes=layer.querySelectorAll('[data-ne-kind]');for(var i=0;i<nodes.length;i++){var yes=draft[nodes[i].getAttribute('data-ne-kind')]===nodes[i].getAttribute('data-ne-value');nodes[i].setAttribute('aria-checked',yes?'true':'false');}
    var lists={style:styles,color:colors,font:fonts,hands:handNames};layer.querySelector('.ne-option-caption').textContent=item(lists[tab],draft[tab])[1];
  }
  function chooseTab(name){tab=name;var buttons=layer.querySelectorAll('[data-ne-tab]');for(var i=0;i<buttons.length;i++){var on=buttons[i].getAttribute('data-ne-tab')===tab;buttons[i].setAttribute('aria-selected',on?'true':'false');buttons[i].setAttribute('tabindex',on?'0':'-1');}var panels=layer.querySelectorAll('.ne-options');for(var j=0;j<panels.length;j++)panels[j].hidden=panels[j].id!=='ne-panel-'+tab;refreshSelection();}
  function open(options){
    if(opened)return;onCloseCallback=options&&typeof options.onClose==='function'?options.onClose:null;makeUI();focusBefore=document.activeElement;draft=read();tab='style';build(preview,draft,false);renderOptions();chooseTab(tab);opened=true;layer.hidden=false;document.documentElement.classList.add('num-editing');var b=bridge();if(b){b.hold();b.clockPicker(true);}if(window.HVClockFaces)HVClockFaces.freeze();requestAnimationFrame(function(){layer.classList.add('is-open');layer.querySelector('#ne-tab-style').focus();});timer=setInterval(function(){if(preview&&HV.canWork())tick(preview);},1000);
  }
  function refresh(){var cfg=read(),nodes=document.querySelectorAll('#stage .num-surface');for(var i=0;i<nodes.length;i++)apply(nodes[i],cfg);}
  function close(save){
    if(!opened)return;if(save){try{localStorage.setItem(KEY,JSON.stringify(draft));}catch(ignore){}refresh();}opened=false;clearInterval(timer);timer=null;layer.classList.remove('is-open');layer.hidden=true;document.documentElement.classList.remove('num-editing');var b=bridge();if(b)b.clockPicker(false);if(focusBefore&&focusBefore!==document.body)focusBefore.focus();else{var stage=document.getElementById('stage');stage.setAttribute('tabindex','-1');stage.focus();}var callback=onCloseCallback;onCloseCallback=null;if(callback)callback(save);
  }
  document.addEventListener('keydown',function(e){
    if(!opened)return;if(e.key==='Escape'){close(false);e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.key==='Tab'){var all=layer.querySelectorAll('button'),visible=Array.prototype.filter.call(all,function(n){return !n.closest('[hidden]')&&n.getAttribute('tabindex')!=='-1';}),first=visible[0],last=visible[visible.length-1];if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
    if(/^Arrow/.test(e.key)){var active=document.activeElement,isTab=active&&active.hasAttribute('data-ne-tab'),nodes=isTab?layer.querySelectorAll('[data-ne-tab]'):layer.querySelectorAll('#ne-panel-'+tab+' button'),list=Array.prototype.slice.call(nodes),at=list.indexOf(active);if(at>=0){var next=list[(at+(/Right|Down/.test(e.key)?1:-1)+list.length)%list.length];next.focus();next.click();e.preventDefault();}}
    e.stopImmediatePropagation();
  },true);
  window.addEventListener('storage',function(e){if(e.key===KEY||e.key===LEGACY)refresh();});
  /* Wait once before mounting clocks: canvas atlases must never cache a fallback glyph. */
  var ready=document.fonts&&document.fonts.load?Promise.all([document.fonts.load('200 64px "HV Clock PingFang"','0123456789'),document.fonts.load('100 64px "HV Clock PingFang"','0123456789'),document.fonts.load('400 116px "HV PingFang SC"','0123456789')]).then(function(){return true;},function(){return false;}):Promise.resolve(false);
  window.HVNumerals={ready:ready,mount:function(root){return build(root,read(),false);},open:open,close:close,isOpen:function(){return opened;}};
})();
