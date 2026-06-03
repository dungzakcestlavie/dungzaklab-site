const BUILD = '15';

const CACHE_NAME =
`archive-pro-pwa-v${BUILD}`;

const DATA_CACHE =
'archive-pro-data-v1';

const IMAGE_CACHE =
'archive-pro-standard-images-v1';

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
k!==DATA_CACHE
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

function isImage(
url
){

return url.pathname.match(
/\.(jpg|jpeg|png|webp)$/i
);

}

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

/*
works.json
network first
fail => cache
*/

if(
url.href===
WORKS_JSON_URL
){

event.respondWith(
(async()=>{

const cache =
await caches.open(
DATA_CACHE
);

try{

const fresh =
await fetch(
req,
{
cache:'no-store'
}
);

if(
fresh
&&
fresh.ok
){

await cache.put(
req,
fresh.clone()
);

}

return fresh;

}
catch(e){

return (

await cache.match(
req
)

||

Response.error()

);

}

})()
);

return;

}

/*
archivepro page
*/

if(

req.mode==='navigate'

&&

url.pathname.startsWith(
'/archivepro/'

)

){

event.respondWith(

fetch(
req
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

/*
zoom images
online only
never cache
*/

if(
isImage(url)
&&
isZoom(url)
){

event.respondWith(
fetch(
req,
{
cache:'no-store'
}
)
);

return;

}

/*
standard images
cache first
*/

if(
isImage(url)
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

const fresh =
await fetch(
req
);

if(
fresh
&&
fresh.ok
){

await cache.put(
req,
fresh.clone()
);

}

return fresh;

}
catch(e){

return Response.error();

}

})()
);

return;

}

}
);

console.log(
`Archive Pro SIMPLE OFFLINE v${BUILD}`
);
