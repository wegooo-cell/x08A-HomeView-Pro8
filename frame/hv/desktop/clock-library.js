/* Shared clock library cards for the fullscreen add sheet and the standalone page. */
(function(){'use strict';
 function category(k){return /^(photos|island)$/.test(k)?'scenes':/^(today|up|lounge|month)$/.test(k)?'information':'dials';}
 function tabs(){return '<nav class="clock-library-tabs" aria-label="时钟分类">'+[['all','全部'],['dials','表盘'],['scenes','场景'],['information','信息与日程']].map(function(x){return '<button type="button" data-clock-filter="'+x[0]+'" aria-pressed="'+(x[0]==='all')+'">'+x[1]+'</button>';}).join('')+'</nav>';}
 function cards(filter){var on=HV.facesOn();return HV.FACES.filter(function(f){return !filter||filter==='all'||category(f[0])===filter;}).map(function(f){var k=f[0];return '<label class="clock-face-option'+(on[k]?' is-selected':'')+'"><input type="checkbox" data-face-key="'+k+'"'+(on[k]?' checked':'')+'>'+(HVClockPreview.custom(k)?'<div class="clock-face-thumb" data-custom-clock-preview="'+k+'" aria-label="'+HV.esc(f[1])+'预览"></div>':'<img class="clock-face-thumb" src="'+HVClockPreview.url(k)+'" alt="'+HV.esc(f[1])+'时钟预览">')+'<span class="clock-face-check"><img src="/frame/hv/desktop/assets/ion-checkmark.svg" alt=""></span><div class="clock-library-card-label"><b>'+HV.esc(f[1])+'</b><span class="clock-library-add">'+(on[k]?'已添加':'添加')+'</span></div><small>'+HV.esc(f[2])+'</small></label>';}).join('');}
 function count(){var on=HV.facesOn();return HV.FACES.filter(function(f){return on[f[0]];}).length;}
 window.HVClockLibrary={tabs:tabs,cards:cards,count:count};
})();
