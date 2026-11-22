/* Beach: continuous water, shore foam and rooted palm fronds. One small GPU surface, ES5. */
(function(){'use strict';
function mount(root,canvas){
 var A='/frame/hv/standby/island/assets/',images=[],ready=0,dead=false,raf=0,last=0,painted=0,acc=0,time=0,frames=0,meter=0,meterFrames=0;
 var media=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
 canvas.width=640;canvas.height=400;
 var gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true}),ctx=gl?null:canvas.getContext('2d'),clock,count=0;
 var precision=gl&&gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT).precision>0?'highp':'mediump';
 function shader(type,s){s=s.replace(/uniform float t;/g,'uniform '+precision+' float t;').replace(/varying vec2 tex;/g,'varying mediump vec2 tex;').replace(/varying float mode;/g,'varying mediump float mode;').replace(/varying float phase;/g,'varying '+precision+' float phase;');var a=gl.createShader(type);gl.shaderSource(a,s);gl.compileShader(a);if(!gl.getShaderParameter(a,gl.COMPILE_STATUS))throw Error('Beach motion shader');return a;}
 if(gl){
  var program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,[
   'attribute vec2 p;attribute vec2 uv;attribute float kind;uniform float t;varying vec2 tex;varying float mode;varying float phase;',
   'void main(){vec2 q=p;mode=kind;tex=uv;phase=t*.64+(kind-1.0)*2.2;',
   'if(kind<.5){float crown=1.0-smoothstep(.54,.94,uv.y);float leaf=(1.0-smoothstep(.12,.62,uv.y))*abs(uv.x-.5)*2.0;',
   'q.x+=sin(t*.62+uv.y*1.4)*3.2*crown+sin(t*1.04+uv.x*4.6)*leaf*3.0;q.y+=sin(t*.83+uv.x*5.2)*leaf*2.4;}',
   'else if(kind<2.5){q.x+=sin(phase+uv.y*3.0)*15.0;q.y+=sin(phase)*10.0+sin(uv.x*7.0+t*.8)*2.5;}',
   'gl_Position=vec4((q/vec2(1280.0,800.0)*2.0-1.0)*vec2(1.0,-1.0),0.0,1.0);}'
  ].join('\n')));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,[
   'precision mediump float;varying vec2 tex;varying float mode;varying float phase;uniform float t;uniform sampler2D palm;uniform sampler2D foam;uniform sampler2D sea;',
   'void main(){vec4 c;if(mode<.5)c=texture2D(palm,tex);else if(mode<2.5){vec2 uv=tex;uv.x+=sin(tex.y*9.0+t*.6)*.004;c=texture2D(foam,uv);c.a*=.23+.11*sin(phase-.6);}',
   'else{vec2 uv=vec2(tex.x, (460.0+tex.y*210.0)/800.0);uv.x+=sin(tex.y*27.0-t*1.1)*.0016;uv.y+=sin(tex.x*23.0+t*.75)*.0012;c=texture2D(sea,uv);float edge=smoothstep(0.0,.1,tex.y)*(1.0-smoothstep(.85,1.0,tex.y));c.a*=edge*smoothstep(.025,.14,c.b-c.r)*.86;}gl_FragColor=c;}'
  ].join('\n')));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Beach motion linking: '+gl.getProgramInfoLog(program));gl.useProgram(program);clock=gl.getUniformLocation(program,'t');
  var data=[],indices=[];
  function mesh(x,y,w,h,cols,rows,kind){var base=data.length/5,r,c;for(r=0;r<=rows;r++)for(c=0;c<=cols;c++)data.push(x+c/cols*w,y+r/rows*h,c/cols,r/rows,kind);for(r=0;r<rows;r++)for(c=0;c<cols;c++){var a=base+r*(cols+1)+c,b=a+1,d=a+cols+1,e=d+1;indices.push(a,b,d,b,e,d);}}
  mesh(0,460,1280,210,1,1,3);mesh(-30,455,850,345,24,10,1);mesh(70,429,850,345,24,10,2);mesh(897,156,355,520,20,24,0);
  var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  [['p',2,0],['uv',2,8],['kind',1,16]].forEach(function(a){var l=gl.getAttribLocation(program,a[0]);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,a[1],gl.FLOAT,false,20,a[2]);});
  b=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);count=indices.length;
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.viewport(0,0,640,400);
  ['palm','foam','sea'].forEach(function(name,i){gl.uniform1i(gl.getUniformLocation(program,name),i);});
 }else ctx.scale(.5,.5);
 function draw(){if(ready!==3||dead)return;if(gl){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(clock,time%(Math.PI*200));gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_SHORT,0);}else{ctx.clearRect(0,0,1280,800);ctx.drawImage(images[0],897+Math.sin(time*.62)*3,156,355,520);ctx.globalAlpha=.23+.11*Math.sin(time*.64);ctx.drawImage(images[1],-30+Math.sin(time*.64)*15,455+Math.sin(time*.64)*10,850,345);ctx.globalAlpha=1;}if(frames%5===0)canvas.setAttribute('data-beach-frame',time.toFixed(2));}
 function active(){return ready===3&&!dead&&!document.hidden&&!root.classList.contains('island-paused')&&!(media&&media.matches);}
 function step(stamp){if(dead)return;if(!document.documentElement.contains(root)){destroy();return;}if(!active()){raf=0;canvas.setAttribute('data-beach-state','paused');return;}raf=requestAnimationFrame(step);acc+=Math.max(0,stamp-last);last=stamp;if(acc+.5<1000/30)return;acc=Math.max(0,acc-1000/30);if(acc>1000/30)acc%=1000/30;time+=Math.min(.08,(stamp-painted)/1000);painted=stamp;frames++;draw();meterFrames++;if(stamp-meter>=2000){canvas.setAttribute('data-beach-fps',(meterFrames*1000/(stamp-meter)).toFixed(1));meter=stamp;meterFrames=0;}}
 function sync(){if(dead)return;if(active()&&!raf){last=painted=meter=performance.now();acc=0;meterFrames=0;canvas.setAttribute('data-beach-state','running');raf=requestAnimationFrame(step);}else if(!active()){if(raf)cancelAnimationFrame(raf);raf=0;canvas.setAttribute('data-beach-state','paused');}}
 function destroy(){dead=true;if(raf)cancelAnimationFrame(raf);raf=0;images.forEach(function(im){im.onload=null;});if(media&&media.removeListener)media.removeListener(sync);if(gl){var ext=gl.getExtension('WEBGL_lose_context');if(ext)ext.loseContext();}}
 ['palm-public.svg','wave-foam-public.svg','beach-public.svg'].forEach(function(name,i){var im=new Image();images[i]=im;im.onload=function(){if(dead)return;if(gl){var bitmap=im;if(i===0){bitmap=document.createElement('canvas');bitmap.width=355;bitmap.height=520;var scale=Math.min(355/im.naturalWidth,520/im.naturalHeight),w=im.naturalWidth*scale,h=im.naturalHeight*scale;bitmap.getContext('2d').drawImage(im,(355-w)/2,(520-h)/2,w,h);}gl.activeTexture(gl.TEXTURE0+i);var texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);}ready++;draw();sync();};im.src=A+name;});
  canvas.setAttribute('data-beach-renderer',gl?'webgl-continuous':'canvas-continuous');canvas.setAttribute('data-beach-precision',precision);if(media&&media.addListener)media.addListener(sync);return {sync:sync,destroy:destroy};
}
window.HVIslandBeach={mount:mount};
})();
