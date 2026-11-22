/* UI localization for the upstream HomeView pages. Content supplied by users is left untouched. ES5. */
(function(){
  document.documentElement.lang='zh-CN';
  var map={
    'Home':'首页','Today':'今天','Tomorrow':'明天','Calendar':'日历','Weather':'天气','Tonight':'今晚','Meals':'餐食','Shopping':'购物清单','Timer':'计时器','Music':'音乐','Photos':'照片','Standby':'待机','Night':'夜间','Background':'背景','Settings':'设置','Display settings':'显示设置','Standby faces':'待机表盘',
    'Now Playing':'正在播放','Loading Sonos':'正在加载音乐','Loading Spotify':'正在加载 Spotify','Loading':'正在加载','Done':'完成','Close':'关闭','Cancel':'取消','Start':'开始','Back':'返回','Play':'播放','Pause':'暂停','Previous':'上一首','Next':'下一首','Shuffle':'随机播放','Repeat':'循环播放',
    'Rooms':'房间','Up next':'接下来播放','Favorites':'收藏','Sound':'声音','Group':'分组','Play on':'播放设备','Choose a speaker':'选择扬声器','Browse Spotify':'浏览 Spotify','Songs':'歌曲','Albums':'专辑','Top songs':'热门歌曲','Searching':'正在搜索','No results':'没有结果',
    'No response':'无响应','Nothing playing':'当前未播放','Preview sample. Nothing is playing.':'预览示例 · 当前未播放','No Sonos rooms answered.':'未检测到 Sonos 扬声器','The queue is empty. Start a favorite or something from Spotify.':'播放队列为空','Loading the queue':'正在加载队列','Loading favorites':'正在加载收藏','Send from your phone':'从手机发送','Choose another speaker':'选择其他扬声器',
    'When untouched':'闲置时','Switch to':'切换到','After':'经过','Photo interval':'照片间隔','Appearance':'外观','Stay on':'保持亮屏','Normal':'正常','Softer':'柔和','Dim':'调暗','Look':'外观','Glass':'玻璃','Light':'浅色','Auto':'自动','Color':'颜色','This frame':'这台设备','Screen':'屏幕','Off':'关闭','On':'开启','Not set up in config.json':'尚未配置','Open a screen':'打开页面',
    'Play slideshow':'播放幻灯片','Show on Standby':'在待机时显示','Add photos':'添加照片','No photos yet. Put some in the photos folder.':'暂无照片','Video':'视频',
    'Hourly forecast':'逐小时预报','7-day forecast':'未来七天','Sunrise':'日出','Sunset':'日落','Wind':'风速','Precip':'降水','Air quality':'空气质量','Feels like':'体感温度',
    'Coming up':'接下来','Dinner tonight':'今晚晚餐','Nothing else today':'今天没有其他日程','Nothing planned':'暂无计划','Dinner':'晚餐','In the kitchen':'厨房','Weather is loading':'正在获取天气','Calendar is loading':'正在获取日历',
    'This week':'本周','Next 7 days':'未来七天','Next two weeks':'未来两周','Free':'空闲','Nothing on the calendars for two weeks':'未来两周没有日程','Nothing on the calendars for the next two weeks.':'未来两周没有日程',
    'No dinner planned':'尚未安排晚餐','Not planned yet':'尚未计划','Nothing planned. Enjoy the space.':'今天暂无计划',
    'Loading the plan':'正在读取计划','Start cooking':'开始烹饪','Ingredients':'食材','All day':'全天','Clear':'晴朗','Mostly clear':'晴间多云','Partly cloudy':'多云','Cloudy':'阴天','Fog':'有雾','Rain':'有雨','Snow':'有雪','Showers':'阵雨','Thunderstorms':'雷阵雨',
    '1 min':'1 分钟','3 min':'3 分钟','5 min':'5 分钟','10 min':'10 分钟','15 s':'15 秒','30 s':'30 秒','60 s':'60 秒','10-inch':'10 英寸','15-inch':'15 英寸',
    'Saved for this screen':'已保存','Keep at least one face in Standby':'请至少保留一款表盘'
  };
  var days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var zdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  for(var i=0;i<7;i++){map[days[i]]=zdays[i];map[days[i].slice(0,3)]=['周日','周一','周二','周三','周四','周五','周六'][i];map[days[i].toUpperCase()]=zdays[i];}
  for(i=0;i<12;i++)map[months[i]]=(i+1)+'月';
  function zh(s){
    if(!s)return s;
    var a=/^(\s*)([\s\S]*?)(\s*)$/.exec(s),v=a[2];
    if(map[v])return a[1]+map[v]+a[3];
    var m=/^(\d+) photos?$/.exec(v);if(m)return a[1]+m[1]+' 张照片'+a[3];
    m=/^([A-Za-z]+), ([A-Za-z]+) (\d+)$/.exec(v);
    if(m&&days.indexOf(m[1])>=0&&months.indexOf(m[2])>=0)return a[1]+(months.indexOf(m[2])+1)+'月'+m[3]+'日 '+zdays[days.indexOf(m[1])]+a[3];
    return s;
  }
  function walk(root){
    if(root.nodeType===3){var val=zh(root.nodeValue);if(val!==root.nodeValue)root.nodeValue=val;return;}
    if(root.nodeType!==1||/^(SCRIPT|STYLE|NOSCRIPT)$/.test(root.tagName))return;
    if(root.hasAttribute('aria-label')){var a=root.getAttribute('aria-label'),b=zh(a);if(a!==b)root.setAttribute('aria-label',b);}
    if(root.hasAttribute('placeholder')){a=root.getAttribute('placeholder');b=zh(a);if(a!==b)root.setAttribute('placeholder',b);}
    for(var n=root.firstChild;n;n=n.nextSibling)walk(n);
  }
  walk(document.body);
  var obs=new MutationObserver(function(records){for(var i=0;i<records.length;i++){
    if(records[i].type==='characterData')walk(records[i].target);
    else for(var j=0;j<records[i].addedNodes.length;j++)walk(records[i].addedNodes[j]);
  }});
  obs.observe(document.body,{childList:true,characterData:true,subtree:true});
})();
