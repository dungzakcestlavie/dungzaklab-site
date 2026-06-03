const BUILD = '13';

const CACHE_NAME =
`archive-pro-pwa-v${BUILD}`;

const IMAGE_CACHE =
'archive-pro-offline-sections-v2';

const WORKS_JSON_URL =
'https://dungzak.art/data/works.json';

const CORE = [
'/archivepro/index.html',
`/archivepro/manifest.json?v=${BUILD}`,
'/archivepro-icon-192-v2.png?v=2',
'/archivepro-icon-512-v2.png?v=2'
];

self.addEventListener(
'install',
(event)=>{

event.waitUntil(
(async()=>{

const cache =
await caches.open(
CACHE_NAME
);

for(
const url
of CORE
){

try{

await cache.add(
new Request(
url,
{
cache:'reload'
}
)
);

}catch(e){}

}

await self.skipWaiting();

})()
);

}
);

self.addEventListener(
'activate',
(event)=>{

event.waitUntil(
(async()=>{

const keys =
await caches.keys();

await Promise.all(

keys
.filter(
k=>

k.startsWith(
'archive-pro-'
)

&&

k!==CACHE_NAME

&&

k!==IMAGE_CACHE

)

.map(
k=>
caches.delete(k)
)

);

await self.clients.claim();

})()
);

}
);

function isZoom(
url
){

return url.pathname.includes(
'/zoom/'
);

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

/* works.json 통과 */

if(
url.href===
WORKS_JSON_URL
){

event.respondWith(
fetch(req)
);

return;

}

/* zoom 캐시 금지 */

if(
isZoom(url)
){

event.respondWith(

fetch(req)
.catch(

()=>

new Response(
'',
{
status:204
}

)

)

);

return;

}

/* 일반 이미지 */

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

const cached =
await cache.match(
req
);

if(
cached
){

return cached;

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
cached
||
Response.error()
);

}

})()

);

return;

}

/* 앱 페이지 */

if(

req.mode==='navigate'

&&

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

return (
await cache.match(
'/archivepro/index.html'
)

||

Response.error()

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
