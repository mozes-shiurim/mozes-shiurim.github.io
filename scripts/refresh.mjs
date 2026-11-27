import fs from 'node:fs/promises';
import {refreshCatalog} from './collector.mjs';

// Approved recordings published by other channels, with their YouTube upload dates.
const guestVideos = [
  {
    "id": "1x-J1qftkyo",
    "title": "א געשמאַק אין אַ מצווה ● שיעור ופאַרברענג מיט ר׳ ישראל מוזעס שליט\"א בבית ר׳ אברמי ברייער",
    "kind": "video",
    "duration": "2:01:00",
    "publishedAt": "2026-06-09"
  },
  {
    "id": "z6CQ2Rw7Av4",
    "title": "#25: Reb Yisroel Moses - אידיש: ר׳ ישראל מאזעס",
    "kind": "video",
    "duration": "2:02:28",
    "publishedAt": "2026-02-26"
  },
  {
    "id": "SzXoalX7p48",
    "title": "שיעור בעניין שמחת החיים ע\"י הרה\"צ רבי ישראל מוזס, אב\"ד מושכינו שליט\"א, יום ג', פרשת לך לך,",
    "kind": "video",
    "duration": "1:19:31",
    "publishedAt": "2025-10-29"
  }
];

const site=new URL('../site/',import.meta.url);
const catalogFile=new URL('../data/catalog.json',import.meta.url);
let stored=null;
try { stored=await fs.readFile(catalogFile,'utf8'); }
catch(e) { if(e.code!=='ENOENT')throw e; }
let next=null;
const bucket={
  async get() {return stored?{async json(){return JSON.parse(stored)}}:null},
  async put(key,value) {next=JSON.parse(value)}
};
const catalog=await refreshCatalog(bucket);
if(!next || !catalog.videos.length || !catalog.podcast?.videos.length)throw Error('Refresh did not produce a complete catalog');
const guestIds = new Set(guestVideos.map(video => video.id));
const guestRecords = new Map(catalog.videos.filter(video => guestIds.has(video.id)).map(video => [video.id,video]));
catalog.videos = catalog.videos.filter(video => !guestIds.has(video.id));
for (const video of guestVideos) {
  const older = catalog.videos.findIndex(record =>
    record.kind === 'video' && record.publishedAt && record.publishedAt.slice(0,10) < video.publishedAt
  );
  const position = older < 0 ? catalog.videos.findLastIndex(record => record.kind === 'video') + 1 : older;
  catalog.videos.splice(position,0,{...guestRecords.get(video.id),...video});
}
for(const list of [catalog.videos,catalog.podcast.videos]){
  if(new Set(list.map(v=>v.id)).size!==list.length)throw Error('Duplicate IDs');
  if(list.some(v=>!/^[-\w]{11}$/.test(v.id)||!v.title))throw Error('Invalid video record');
}
const before=stored?JSON.parse(stored).videos:JSON.parse(await fs.readFile(new URL('videos.json',site),'utf8'));
const beforeIds = new Set(before.map(video => video.id));
catalog.added += guestVideos.filter(video => !beforeIds.has(video.id)).length;
const ids=new Set(catalog.videos.map(v=>v.id));
if(before.some(v=>!ids.has(v.id)))throw Error('Refresh lost an existing video');
// All source requests and validation finish before any output is replaced.
const outputs=[
  [catalogFile,catalog],
  [new URL('videos.json',site),catalog.videos],
  [new URL('podcasts.json',site),catalog.podcast],
  [new URL('status.json',site),{checkedAt:catalog.checkedAt,total:catalog.videos.length,added:catalog.added,podcastEpisodes:catalog.podcast.videos.length}]
];
for(const [file,value] of outputs){
  const temp=new URL(file.href+'.tmp');
  await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n');
  await fs.rename(temp,file);
}
console.log(JSON.stringify({ok:true,checkedAt:catalog.checkedAt,total:catalog.videos.length,added:catalog.added,podcastEpisodes:catalog.podcast.videos.length}));
