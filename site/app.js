import {uploadLabel,uploadDetails} from './upload-date.mjs';
import {positionFor,nextIndex,progressRecord,percent,timeLabel} from './playback-state.mjs';
const $=id=>document.getElementById(id),KEY='mozes-progress-v1';
let videos=[],podcast=null,tab='all',limit=24,filtered=[],history={},queue=[],queueIndex=-1,active=null,player=null,ready=false,loadingToken=0,timer=null,apiPromise=null,played=false,lastTrigger=null,mode='large';
let storageAvailable=true;
try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))history=saved;}catch{storageAvailable=false}
try{localStorage.setItem('mozes-storage-check','1');localStorage.removeItem('mozes-storage-check')}catch{storageAvailable=false}
const clean=s=>s.normalize('NFKD').replace(/[\u0591-\u05BD\u05BF-\u05C7]/g,'').toLowerCase();
function storeProgress(){try{localStorage.setItem(KEY,JSON.stringify(history))}catch{storageAvailable=false;$('historynote').textContent='Your browser is blocking saved progress. Progress is available only during this visit.'}}
function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e}
function updateCard(id){const record=history[id];for(const card of document.querySelectorAll(`[data-video-id="${id}"]`)){card.querySelector('.progress-fill').style.width=percent(record)+'%';card.querySelector('.watch-status').textContent=record?.watched?'✓ Watched':record?.position>0?'Continue watching':'Not watched';card.querySelector('.progress-track').setAttribute('aria-label',record?.watched?'Watched':`${Math.round(percent(record))}% watched`);card.querySelector('.history-toggle').textContent=record?.watched?'Mark unwatched':'Mark watched';card.querySelector('.history-toggle').setAttribute('aria-pressed',String(!!record?.watched))}}
function viewCount(value){
 if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:-1;
 const match=String(value??'').trim().match(/^(No|[\d,.]+)\s*(K|M|B|thousand|million|billion)?(?:\s*views?)?$/i);
 if(!match)return -1;
 return (match[1].toLowerCase()==='no'?0:Number(match[1].replaceAll(',','')))*({k:1e3,thousand:1e3,m:1e6,million:1e6,b:1e9,billion:1e9}[(match[2]||'').toLowerCase()]||1);
}
function formatViews(value){
 if(value===undefined||value===null)return 'Views unavailable';
 const match=String(value).trim().match(/^(No|[\d,.]+)\s*(K|M|B|thousand|million|billion)?\s*views?$/i);
 if(!match)return String(value);
 const base=match[1].toLowerCase()==='no'?0:Number(match[1].replaceAll(',',''));
 const unit=(match[2]||'').toLowerCase();
 const count=base*({k:1e3,thousand:1e3,m:1e6,million:1e6,b:1e9,billion:1e9}[unit]||1);
 return new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(count)+' views';
}
function render(){
 
 const q=clean($('query').value.trim()),status=$('viewfilter').value;
 const source=tab==='podcast'?(podcast?.videos||[]):videos;
 filtered=source.filter(v=>(tab==='all'||tab==='podcast'||v.kind===tab)&&clean(v.title).includes(q)&&(status==='all'||status==='watched'&&history[v.id]?.watched||status==='progress'&&history[v.id]?.position>0&&!history[v.id]?.watched||status==='unwatched'&&!history[v.id]?.watched));
 if($('sort').value==='views')filtered.sort((a,b)=>viewCount(b.views)-viewCount(a.views));
 if($('sort').value==='title')filtered.sort((a,b)=>a.title.localeCompare(b.title));if($('sort').value==='reverse')filtered.reverse();
 $('resultcount').textContent=`${filtered.length} ${tab==='podcast'?'episodes':tab==='short'?'Shorts':'videos'}${q?' found':''}`;
 $('podcastintro').hidden=tab!=='podcast';$('grid').replaceChildren();
 for(const v of filtered.slice(0,limit)){
  const card=element('article','card');card.dataset.videoId=v.id;
  const watch=element('button','watch-card');watch.setAttribute('aria-label','Watch '+v.title);
  const thumb=element('div','thumb'),img=element('img');img.src=`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;img.alt='';img.loading='lazy';thumb.append(img,element('span','play','▶'),element('span','badge',v.kind==='short'?'Short':v.duration));
  const progress=element('div','progress-track');progress.append(element('div','progress-fill'));thumb.append(progress);
  const h=element('h3','',v.title);h.dir='auto';watch.append(thumb,h);watch.onclick=()=>start(v,'large',watch);
  const statusLabel=element('div','watch-status');const actions=element('div','card-actions'),listen=element('button','listen-button','Mini player'),mark=element('button','history-toggle');listen.setAttribute('aria-label','Open mini player for '+v.title);listen.onclick=()=>start(v,'dock',listen);mark.setAttribute('aria-label','Change watched status for '+v.title);mark.onclick=()=>{if(active?.id===v.id)save();history[v.id]={...(history[v.id]||{}),watched:!history[v.id]?.watched,updatedAt:Date.now()};storeProgress();updateCard(v.id);if($('viewfilter').value!=='all')render()};actions.append(listen,mark);const metadata=element('div','youtube-views');metadata.append(element('span','',formatViews(v.views)));if(v.publishedAt){const date=element('time','upload-date',uploadLabel(v.publishedAt));date.dateTime=v.publishedAt;date.dataset.publishedAt=v.publishedAt;date.title=uploadDetails(v.publishedAt);date.tabIndex=0;date.setAttribute('role','button');date.setAttribute('aria-label',uploadDetails(v.publishedAt));date.setAttribute('aria-expanded','false');const toggle=()=>{date.dataset.expanded=date.dataset.expanded==='true'?'false':'true';date.setAttribute('aria-expanded',date.dataset.expanded);date.textContent=date.dataset.expanded==='true'?uploadDetails(v.publishedAt):uploadLabel(v.publishedAt)};date.onclick=toggle;date.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}};metadata.append(element('span','',' · '),date)}card.append(watch,metadata,statusLabel,actions);$('grid').append(card);updateCard(v.id);
 }
 if(!filtered.length)$('grid').append(element('p','empty','No videos match. Try another word or choose a different filter.'));
 $('more').hidden=filtered.length<=limit;$('more').textContent='Show more videos';
}
function youtubeAPI(){
 if(window.YT?.Player)return Promise.resolve();if(apiPromise)return apiPromise;
 apiPromise=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{apiPromise=null;reject(Error('The YouTube player could not load. Your internet filter may be blocking it.'))},15000);window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve()};const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timeout);apiPromise=null;reject(Error('YouTube could not load. Check your connection or internet filter.'))};document.head.append(script)});return apiPromise;
}
function message(text){$('playermessage').textContent=text;$('playermessage').hidden=!text}
function setMode(next){mode=next;const dock=mode==='dock';$('watch').classList.toggle('docked',dock);$('watch').classList.toggle('expanded',!dock);$('backdrop').hidden=dock;$('minimize').textContent=dock?'Expand':'Mini player';$('minimize').setAttribute('aria-label',dock?'Expand player':'Minimize player and keep listening');$('watch').setAttribute('role',dock?'region':'dialog');if(dock)$('watch').removeAttribute('aria-modal');else $('watch').setAttribute('aria-modal','true');document.body.classList.toggle('modal-open',!dock);$('listenhelp').hidden=!dock}
function updateQueue(){const next=nextIndex(queue,queueIndex);$('next').disabled=next<0;$('previous').disabled=queueIndex<=0;$('queuenote').textContent='';$('upnext').textContent=next<0?'End of queue':`Up next: ${queue[next].title}`}
function updateYouTubeLink(){
 if(!active)return;
 let seconds=positionFor(history[active.id]);
 try{if(ready&&player?.getVideoData?.().video_id===active.id){const current=player.getCurrentTime();if(Number.isFinite(current))seconds=current}}catch{}
 $('external').href=`https://www.youtube.com/watch?v=${active.id}&t=${Math.max(0,Math.floor(seconds))}s`;
}
$('external').onclick=()=>{save();updateYouTubeLink();try{player?.pauseVideo?.()}catch{}};
$('external').onpointerdown=$('external').oncontextmenu=updateYouTubeLink;
function save(ended=false){
 if(!player||!ready||!active||!played)return;
 try{if(player.getVideoData?.().video_id!==active.id)return;const record=progressRecord(history[active.id],player.getCurrentTime(),player.getDuration(),ended);if(record){history[active.id]=record;storeProgress();updateCard(active.id);$('currentprogress').textContent='';updateYouTubeLink()}}catch{}
}
async function play(v){
 save();const reuse=!!(player&&ready);clearInterval(timer);timer=null;played=false;active=v;const token=++loadingToken;
 $('watchtitle').textContent=v.title;updateYouTubeLink();$('player').classList.toggle('short',v.kind==='short');$('restart').disabled=true;$('currentprogress').textContent='';message('');updateQueue();
 if(reuse){$('restart').disabled=false;player.getIframe().title=v.title;player.loadVideoById({videoId:v.id,startSeconds:Math.floor(positionFor(history[v.id]))});timer=setInterval(()=>save(),3000);return}
 ready=false;if(player){try{player.destroy()}catch{}player=null}
 $('player').replaceChildren(element('div'));$('player').firstChild.id='youtube-player';
 try{await youtubeAPI();if(token!==loadingToken)return;
 player=new YT.Player('youtube-player',{videoId:v.id,width:'100%',height:'100%',playerVars:{autoplay:1,playsinline:1,rel:0,origin:location.origin,start:Math.floor(positionFor(history[v.id]))},events:{
  onReady:e=>{if(token!==loadingToken)return;ready=true;$('restart').disabled=false;message('');const frame=e.target.getIframe();frame.title=v.title;frame.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');e.target.playVideo();timer=setInterval(()=>save(),3000)},
  onStateChange:e=>{if(!active||player?.getVideoData?.().video_id!==active.id)return;if(e.data===YT.PlayerState.PLAYING){played=true;message('')}if(e.data===YT.PlayerState.PAUSED)save();if(e.data===YT.PlayerState.ENDED){save(true);if($('autonext').checked&&nextIndex(queue,queueIndex)>=0){queueIndex++;play(queue[queueIndex])}else message(nextIndex(queue,queueIndex)<0?'You reached the end of this queue.':'Video finished. Choose Next to continue.')}},
  onError:e=>{if(!active||player?.getVideoData?.().video_id!==active.id)return;message([101,150].includes(e.data)?'This video cannot play on other websites. Use “Watch on YouTube” or choose Next.':'YouTube could not play this video. Your filter, connection, or the video’s availability may be the reason. Try the YouTube link or choose Next.')},
  onAutoplayBlocked:()=>{if(active)message('Tap Play inside the YouTube player to continue. Your browser blocked automatic playback.')}
 }});
 }catch(e){if(token===loadingToken)message(e.message)}
}
function start(v,newMode,trigger){lastTrigger=trigger;queue=[...filtered];queueIndex=queue.findIndex(x=>x.id===v.id);if(queueIndex<0){queue=[v];queueIndex=0}$('watch').hidden=false;setMode(newMode);play(v);$('closeplayer').focus()}
function stop(){save();++loadingToken;clearInterval(timer);timer=null;if(player){try{player.destroy()}catch{}}player=null;ready=false;active=null;$('watch').hidden=true;$('backdrop').hidden=true;document.body.classList.remove('modal-open');$('player').replaceChildren();render();if(lastTrigger?.isConnected)lastTrigger.focus()}
$('closeplayer').onclick=stop;$('backdrop').onclick=()=>setMode('dock');$('minimize').onclick=()=>setMode(mode==='dock'?'large':'dock');$('next').onclick=()=>{if(nextIndex(queue,queueIndex)>=0){queueIndex++;play(queue[queueIndex])}};$('previous').onclick=()=>{if(queueIndex>0){queueIndex--;play(queue[queueIndex])}};$('restart').onclick=()=>{if(ready){player.seekTo(0,true);player.playVideo()}};
$('watch').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();setMode('dock')}if(e.key==='Tab'&&mode==='large'){const items=[...$('watch').querySelectorAll('button:not(:disabled),input,a,iframe')].filter(x=>!x.hidden);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});window.addEventListener('pagehide',()=>save());
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;limit=24;document.querySelectorAll('[data-tab]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));render()});$('query').oninput=()=>{limit=24;render()};$('sort').onchange=$('viewfilter').onchange=()=>{limit=24;render()};$('more').onclick=()=>{limit+=24;render()};
if(!storageAvailable)$('historynote').textContent='Your browser is blocking saved progress. Progress is available only during this visit.';
const catalogVersion = Date.now();
Promise.all([fetch(`./videos.json?v=${catalogVersion}`).then(r=>{if(!r.ok)throw Error();return r.json()}),fetch(`./podcasts.json?v=${catalogVersion}`).then(r=>{if(!r.ok)throw Error();return r.json()}).catch(()=>null)]).then(([data,pod])=>{videos=data;podcast=pod;if(pod){const byId=new Map(videos.map(v=>[v.id,v]));pod.videos=pod.videos.map(v=>({...v,views:v.views||byId.get(v.id)?.views,publishedAt:v.publishedAt||byId.get(v.id)?.publishedAt}));const ids=new Set(videos.map(v=>v.id));for(const v of pod.videos)if(!ids.has(v.id)){videos.push(v);ids.add(v.id)}$('podcastname').textContent=pod.title;$('podcastcount').textContent=pod.videos.length}else{$('podcastintro').textContent='The podcast could not load. Please refresh to try again.'}const n=videos.filter(v=>v.kind==='short').length;$('allcount').textContent=videos.length;$('videocount').textContent=videos.length-n;$('shortcount').textContent=n;$('summary').textContent=`${videos.length-n} SHIURIM  /  ${n} SHORTS  /  ONE COLLECTION`;render()}).catch(()=>{$('resultcount').textContent='The collection could not load.';$('grid').append(element('p','empty','Please refresh to try again, or open the YouTube channel above.'))});

// Warm the API while the visitor browses; no media starts before a click.
youtubeAPI().catch(()=>{});

document.querySelector(".description-less")?.addEventListener("click",()=>{const details=document.querySelector(".channel-description");details.open=false;details.querySelector("summary").focus()});


function refreshUploadLabels(){for(const date of document.querySelectorAll("time[data-published-at]")){if(date.dataset.expanded!=="true")date.textContent=uploadLabel(date.dataset.publishedAt)}}
setInterval(refreshUploadLabels,60000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshUploadLabels()});

// Native selects can retain a keyboard-style ring after a touchscreen choice.
for(const id of ['sort','viewfilter']){const select=$(id);select.addEventListener('pointerdown',()=>select.setAttribute('data-pointer-focus',''));select.addEventListener('keydown',()=>select.removeAttribute('data-pointer-focus'));select.addEventListener('blur',()=>select.removeAttribute('data-pointer-focus'));}

window.addEventListener("mozes-history-export",()=>save());
window.addEventListener("mozes-history-imported",event=>{history=event.detail;if(active&&player){player.pauseVideo?.();player.seekTo?.(positionFor(history[active.id]),true);}render();});
