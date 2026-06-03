const BUILD = '11';

const CACHE_NAME = `archive-pro-pwa-v${BUILD}`;
const DATA_CACHE = 'archive-pro-data-v2';
const IMAGE_CACHE = 'archive-pro-offline-sections-v2';

const WORKS_JSON_URL =
'https://dungzak.art/data/works.json';

const CORE = [
'/archivepro/index.html',
`/archivepro/manifest.json?v=${BUILD}`,
'/archivepro-icon-192-v2.png?v=2',
'/archivepro-icon-512-v2.png?v=2'
];

self.addEventListener('install',(event)=>{

event.waitUntil(
(async()=>{

const cache =
await caches.open(CACHE_NAME);

await Promise.all(
CORE.map(async(url)=>{

try{
await cache.add(
new Request(
url,
{
cache:'reload'
}
)
);
}
catch(e){
console.warn(
'cache fail',
url
);
}

})
);

await self.skipWaiting();

})()
);

});

self.addEventListener(
'activate',
(event)=>{

event.waitUntil(
(async()=>{

const keys =
await caches.keys();

await Promise.all(

keys
.filter((k)=>{

if(
k===CACHE_NAME||
k===DATA_CACHE||
k===IMAGE_CACHE
){
return false;
}

return k.startsWith(
'archive-pro-'
);

})
.map((k)=>
caches.delete(k)
)

);

await self.clients.claim();

})()
);

});

function isZoom(url){

return (
url.pathname.includes(
'/zoom/'
)
);

}

async function cacheImages(
list
){

try{

const cache =
await caches.open(
IMAGE_CACHE
);

for(
const work
of list
){

try{

if(
!work||
work.section_id===0||
!work.image||
isZoom(
new URL(
work.image
)
)
){
continue;
}

const exists =
await cache.match(
work.image
);

if(
exists
){
continue;
}

const res =
await fetch(
work.image
);

if(
res.ok
){

await cache.put(
work.image,
res.clone()
);

}

}
catch(e){}

}

}
catch(e){}

}

async function fetchWorks(){

try{

const network =
await fetch(
WORKS_JSON_URL,
{
cache:
'no-store'
}
);

if(
!network.ok
){

throw new Error();

}

const json =
await network
.clone()
.json();

const dataCache =
await caches.open(
DATA_CACHE
);

await dataCache.put(
WORKS_JSON_URL,
new Response(
JSON.stringify(
json
),
{
headers:{
'Content-Type':
'application/json'
}
}
)
);

let offline =
json;

if(
Array.isArray(
json
)
){

offline =
json.filter(
(v)=>
v.section_id!==0
);

}

await dataCache.put(
'archivepro-offline',
new Response(
JSON.stringify(
offline
),
{
headers:{
'Content-Type':
'application/json'
}
}
)
);

cacheImages(
offline
);

return network;

}
catch(e){

const cache =
await caches.open(
DATA_CACHE
);

const cached =
await cache.match(
'archivepro-offline'
);

if(
cached
){

return cached;

}

return new Response(
'[]',
{
headers:{
'Content-Type':
'application/json'
}
}
);

}

}

self.addEventListener(
'fetch',
(event)=>{

const req =
event.request;

if(
req.method!=='GET'
){
return;
}

const url =
new URL(
req.url
);

if(
url.href===
WORKS_JSON_URL
){

event.respondWith(
fetchWorks()
);

return;

}

if(
isZoom(
url
)
){

event.respondWith(

fetch(req)
.catch(
()=>new Response(
'',
{
status:204
}
)
)

);

return;

}

if(
url.pathname.match(
/\.(jpg|jpeg|png|webp)$/i
)
){

event.respondWith(

(async()=>{

const cache =
await caches.open(
IMAGE_CACHE
);

const hit =
await cache.match(
req
);

if(
hit
){

return hit;

}

try{

const network =
await fetch(
req
);

if(
network.ok
){

cache.put(
req,
network.clone()
);

}

return network;

}
catch(e){

return (
hit||
Response.error()
);

}

})()

);

return;

}

if(
req.mode==='navigate'&&
url.pathname.startsWith(
'/archivepro/'
)
){

event.respondWith(

fetch(
req,
{
cache:
'no-store'
}
)
.catch(
async()=>{

const cache =
await caches.open(
CACHE_NAME
);

return await cache.match(
'/archivepro/index.html'
);

}
)

);

return;

}

}
);

console.log(
`Archive Pro SW v${BUILD}`
);
