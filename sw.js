/* Meu Devocional 2.7 · offline e reprodução MP3 com pedidos Range */
const CACHE_NAME='meu-devocional-365-v10';
const ASSETS=['./','./index.html','./styles.css?v=10.0','./app.js?v=10.0','./audio.js?v=10.0','./benicio-player.js?v=10.0','./charon-firebase.js?v=10.0','./jszip.min.js?v=8.0','./bible.js?v=8.0','./studies.json','./manifest.webmanifest','./icon.svg','./dia-001-benicio.mp3'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('meu-devocional-')&&name!==CACHE_NAME).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.endsWith('/dia-001-benicio.mp3')){
  event.respondWith((async()=>{
    const cached=await caches.match('./dia-001-benicio.mp3');
    if(!cached)return fetch(event.request);
    const range=event.request.headers.get('range');
    if(!range)return cached;
    const data=await cached.arrayBuffer();
    const size=data.byteLength;
    const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if(!match)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
    const from=match[1] ? Number(match[1]) : Math.max(0,size-Number(match[2]));
    const to=match[1] ? (match[2] ? Number(match[2]) : size-1) : size-1;
    if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from>=size||from>to||to<0){return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}})}
    const end=Math.min(to,size-1);
    return new Response(data.slice(from,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Content-Range':`bytes ${from}-${end}/${size}`,'Accept-Ranges':'bytes','Content-Length':String(end-from+1)}});
  })());
  return;
 }
 if(event.request.mode==='navigate'){
   event.respondWith(fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',clone))}return response}).catch(()=>caches.match('./index.html')));
   return;
 }
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,clone))}return response})));
});
