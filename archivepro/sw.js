const BUILD = '14';

const CACHE_NAME =
`archive-pro-pwa-v${BUILD}`;

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
절대 가로채지 않음
*/

if(
url.href===
WORKS_JSON_URL
){

event.respondWith(
fetch(
req,
{
cache:
'no-store'
}
)
);

return;

}

/*
archivepro 페이지
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
이미지
*/

if(
isImage(url)
){

event.respondWith(

(async()=>{

try{

return await fetch(
req
);

}
catch(e){

const cache =
await caches.open(
CACHE_NAME
);

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

}
);

console.log(
`Archive Pro SW RESTORE v${BUILD}`
);
