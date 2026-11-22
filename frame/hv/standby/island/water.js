/* Small cached water strip. One GPU quad instead of 35–52 Canvas image copies per frame. ES5. */
(function(){'use strict';
function mount(canvas,src,x,y,w,h){
 var image=new Image(),ready=false,dead=false,time=0,last=0,gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false}),ctx=gl?null:canvas.getContext('2d'),texture,clock,light;
 canvas.width=Math.ceil(w/2);canvas.height=Math.ceil(h/2);
 var crop=document.createElement('canvas');crop.width=w;crop.height=h;
 function shader(type,s){var a=gl.createShader(type);gl.shaderSource(a,s);gl.compileShader(a);return a;}
 if(gl){
  var p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,'attribute vec2 a;varying vec2 uv;void main(){uv=(a+1.0)*.5;gl_Position=vec4(a*vec2(1.0,-1.0),0.0,1.0);}'));
  gl.attachShader(p,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 uv;uniform sampler2D tex;uniform float t;uniform float glow;void main(){float d=(sin(uv.y*20.0-t*1.6)*(.2+uv.y*2.0)+sin(uv.y*7.2+t*.8)*.6)/1000.0;vec4 c=texture2D(tex,vec2(clamp(uv.x+d,0.0,1.0),uv.y));float edge=min(1.0,min(uv.y*12.0,(1.0-uv.y)*8.0));gl_FragColor=vec4(c.rgb*(1.0+glow*.12),c.a*edge*.8);}'));
  gl.linkProgram(p);gl.useProgram(p);clock=gl.getUniformLocation(p,'t');light=gl.getUniformLocation(p,'glow');var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);var a=gl.getAttribLocation(p,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.viewport(0,0,canvas.width,canvas.height);
 }
 function draw(t,g){if(!ready||dead)return;time=t;if(gl){gl.uniform1f(clock,t);gl.uniform1f(light,g||0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}else if(t-last>.08){last=t;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.globalAlpha=.55;ctx.drawImage(crop,Math.sin(t*.8),0,canvas.width,canvas.height);}}
 image.onload=function(){if(dead)return;crop.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);if(gl){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,crop);}ready=true;draw(time,0);};image.src=src;
 canvas.setAttribute('data-water-renderer',gl?'webgl-strip':'canvas-strip');
 return {draw:draw,destroy:function(){dead=true;image.onload=null;if(gl){var ext=gl.getExtension('WEBGL_lose_context');if(ext)ext.loseContext();}crop.width=crop.height=1;}};
}
window.HVIslandWater={mount:mount};
})();
