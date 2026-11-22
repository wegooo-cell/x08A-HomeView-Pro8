(function(){
  HV.back('Home');
  HV.chrome({light:true});
  var nativeDevice=/Pro8HomeView\/1/.test(navigator.userAgent);
  Array.prototype.forEach.call(document.querySelectorAll('[data-native]'),function(el){
    el.addEventListener('click',function(){
      var action=el.getAttribute('data-native');if(action==='ha'){if(parent.HVDesktopHost)parent.HVDesktopHost.open('/frame/hv/home/');else location.href='/frame/hv/home/';return;}
      if(nativeDevice){location.href='pro8://'+action;return;}
      HV.toast('请在 Pro 8 桌面上打开');
    });
  });
})();
