/* Meu Devocional 2.9 · Charon contínua, realce aproximado por parágrafo e próxima narração */
'use strict';
const STORAGE_KEY = 'meuDevocional.charon.firebase.v1';
const CONTINUOUS_PREF_KEY = 'meuDevocional.charon.continuous.v1';
const DAILY_LIMIT = 12; // guarda local, NÃO garante limitação remota do projeto compartilhado
const MAX_CHUNK = 1550;
const MODEL = 'gemini-3.8-flash-tts';
const SDK_VERSION='13.4.0';
const byId=id=>document.getElementById(id);
let activeDay=1, runId=0, configured=null, model=null, player=null, audioURL=null;
let parts=[], partIndex=0, preparing=false, paused=false, playingContinuous=false;
let narration=null, partOffsets=[], partDurations=[], timeline=[], highlightedKey=null;
let cacheDB=null;
const clean=t=>String(t??'').replace(/\s+/g,' ').trim();
const status=t=>{byId('charonStatus').textContent=t;};
const notice=(t,type='ok')=>{const el=byId('charonSetupNotice');el.textContent=t;el.dataset.type=type;};
function readCfg(){try{const c=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');return validate(c)?c:null}catch(_){return null}}
function validate(c){return !!(c&&typeof c==='object'&&/^[-\w]{4,80}$/.test(c.projectId||'')&&/^1:[\w:.-]{12,200}$/.test(c.appId||'')&&/^AIza[\w-]{20,100}$/.test(c.apiKey||'')&&/^[\w-]{12,150}$/.test(c.siteKey||''))}
function isConfigured(){return !!configured}
function configureUI(){
 configured=readCfg();
 if(configured){for(const k of ['projectId','appId','apiKey','siteKey'])byId({projectId:'charonProjectId',appId:'charonAppId',apiKey:'charonApiKey',siteKey:'charonSiteKey'}[k]).value=configured[k];byId('charonSparkConfirm').checked=true;
  notice('✓ Charon configurada neste aparelho (Firebase Spark). Ao tocar em ouvir, o estudo será gerado com a voz Charon.');
  status('Pronto para gerar a narração com Charon. O primeiro uso exige internet.');
 }else{notice('Charon ainda não configurada. Crie um projeto Firebase gratuito e preencha os dados abaixo.');}
 updatePreferred();
}
function updatePreferred(){const val=!!configured;byId('audioPlay').textContent=val?'▶ Ouvir estudo completo com Charon':'▶ Ouvir estudo completo';byId('audioPrayer').textContent=val?'🙏 Ouvir oração com Charon':'🙏 Ouvir só a oração';}
async function getModel(){
 if(model)return model;
 if(!configured)throw new Error('Configure o Firebase Spark primeiro.');
 // Importa as bibliotecas apenas quando o usuário inicia uma narração. Nada é enviado ao Google por abrir o aplicativo.
 const [fb,ai,appCheck]=await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-ai.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-check.js`)
 ]);
 const app=fb.initializeApp({apiKey:configured.apiKey,projectId:configured.projectId,appId:configured.appId},'devocional-charon');
 appCheck.initializeAppCheck(app,{provider:new appCheck.ReCaptchaEnterpriseProvider(configured.siteKey),isTokenAutoRefreshEnabled:true});
 const client=ai.getAI(app,{backend:new ai.GoogleAIBackend()});
 model=ai.getGenerativeModel(client,{model:MODEL,generationConfig:{responseModalities:[ai.ResponseModality.AUDIO],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Charon'}},languageCode:'pt-BR'}}});
 return model;
}
function fieldsForDay(day){const s=window.DevocionalAudio?.study?.(day);if(!s)throw new Error('Os estudos não foram carregados ainda.');return s}
function stripExtras(html){const d=document.createElement('div');d.innerHTML=html||'';d.querySelectorAll('script,style,button,a,nav').forEach(n=>n.remove());return [...d.querySelectorAll('h3,h4,p,li')].map(e=>clean(e.textContent)).filter(Boolean).join(' ')}
// Os segmentos mantêm exatamente o roteiro da versão 2.8: os áudios já guardados
// no IndexedDB continuam válidos. Os tempos do destaque são estimados pela duração
// real de cada WAV e pelo tamanho de cada trecho de texto; NÃO há timestamps de palavras.
function narrationFor(s,onlyPrayer){
 const segments=[];
 const add=(key,label,text)=>{const normalized=clean(text);if(normalized)segments.push({key,label,text:normalized});};
 if(onlyPrayer){add('prayer','Oração do dia',`Meu Devocional. Dia ${s.day}. Oração do dia. ${clean(s.prayer)} Amém.`)}
 else {
   add('intro','Apresentação',`Meu Devocional. Dia ${s.day} de 365. ${s.title}.`);
   add('reference','Passagem de referência',`Leitura bíblica de referência: ${s.reference}. Nesta narração ouviremos os comentários e aplicações. A leitura integral da Bíblia ONBV fica no leitor bíblico separado.`);
   add('preparation','Preparando o coração','Preparando o coração: Separe um momento para receber a Palavra de Deus com atenção e humildade.');
   add('insight','Ideia central',`Ideia central: ${s.insight}`);
   add('context','Contexto histórico',`Contexto histórico e literário: ${s.context}`);
   add('interpretation','Observando a passagem',`Observando a passagem: ${s.interpretation}`);
   add('theology','Conexões bíblicas',`Conexões bíblicas: ${s.theology}`);
   add('crossReferences','Referências para aprofundar',`Referências para aprofundar: ${s.crossReferences}`);
   add('care','Cuidado ao interpretar',`Um cuidado ao interpretar: ${s.care}`);
   if(s.extendedHtml)add('extended','Aprofundamento especial',`Aprofundamento: ${stripExtras(s.extendedHtml)}`);
   add('practice','Aplicação para hoje',`Aplicação para hoje: ${s.practice}`);
   (s.questions||[]).forEach((q,i)=>add(`question-${i}`,'Pergunta para refletir '+(i+1),`Pergunta para refletir ${i+1}: ${q}`));
   add('prayer','Oração do dia',`Oração do dia: ${s.prayer}`);
 }
 let offset=0;
 segments.forEach((seg,i)=>{seg.start=offset;offset+=seg.text.length;seg.end=offset;if(i<segments.length-1)offset+=1});
 return {text:segments.map(seg=>seg.text).join('\n\n'),segments};
}
function composeText(s,onlyPrayer){return narrationFor(s,onlyPrayer).text;}
function renderTranscript(){
 const box=byId('charonTranscript');if(!box)return;
 box.replaceChildren();highlightedKey=null;
 if(!narration){box.textContent='Escolha um estudo e toque em ouvir.';return}
 const frag=document.createDocumentFragment();
 narration.segments.forEach(seg=>{
  const para=document.createElement('p');para.className='charon-transcript-segment';para.dataset.charonKey=seg.key;
  const strong=document.createElement('strong');strong.textContent=seg.label+' · ';
  para.append(strong,document.createTextNode(seg.text));frag.append(para);
 });
 box.append(frag);
 // Tornar referências bíblicas dentro do roteiro narrado interativas.
 const refPattern=/\b(?:[1-3]\s*)?[A-Za-zÀ-ÿ]+(?:\s+(?:dos|das|de|[A-Za-zÀ-ÿ]+)){0,3}\s+\d{1,3}(?::\d{1,3}(?:[–-]\d{1,3})?)?/g;
 box.querySelectorAll('.charon-transcript-segment').forEach(node=>{
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),items=[];
  while(walker.nextNode())items.push(walker.currentNode);
  items.forEach(item=>{if(item.parentElement?.closest('button'))return;const value=item.nodeValue;let m,last=0,changed=false;const frag=document.createDocumentFragment();refPattern.lastIndex=0;
   while((m=refPattern.exec(value))){if(!window.DevocionalBible?.parseReference?.(m[0])?.length)continue;frag.append(document.createTextNode(value.slice(last,m.index)));const btn=document.createElement('button');btn.type='button';btn.className='scripture-link';btn.dataset.bibleRef=m[0];btn.textContent=m[0];frag.append(btn);last=refPattern.lastIndex;changed=true;}
   if(changed){frag.append(document.createTextNode(value.slice(last)));item.replaceWith(frag);}
  });
 });
 const links=byId('charonReadingLinks');if(links){links.replaceChildren();const day=fieldsForDay(activeDay);const refs=[day.reference,...(Array.isArray(day.crossReferences)?day.crossReferences:[]),...(Array.isArray(day.cross_references)?day.cross_references:[])].filter(x=>typeof x==='string');const unique=[...new Set(refs)];if(unique.length){const heading=document.createElement('strong');heading.textContent='📖 Leituras relacionadas';links.append(heading)}unique.slice(0,12).forEach(ref=>{if(!window.DevocionalBible?.parseReference?.(ref)?.length)return;const btn=document.createElement('button');btn.type='button';btn.className='scripture-link reading-chip';btn.dataset.bibleRef=ref;btn.textContent=ref;links.append(btn)})}
}
function showSegmentAt(pos){
 if(!narration?.segments?.length)return;
 const section=narration.segments.find(s=>pos<s.end)||narration.segments[narration.segments.length-1];
 if(section.key===highlightedKey)return;
 highlightedKey=section.key;
 const view=byId('charonTranscript');
 view?.querySelectorAll('[data-charon-key]').forEach(el=>{const on=el.dataset.charonKey===section.key;el.classList.toggle('charon-speaking',on);if(on)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current')});
 document.querySelectorAll('#studyContent [data-charon-anchor]').forEach(el=>el.classList.toggle('charon-speaking',el.dataset.charonAnchor===section.key));
 byId('charonFollowLabel').textContent='Trecho estimado: '+section.label;
 if(document.visibilityState==='visible'&&byId('charonFollowDetails')?.open){
   const target=view?.querySelector('.charon-speaking');
   if(target&&view){const pos=target.getBoundingClientRect().top-view.getBoundingClientRect().top+view.scrollTop;
    if(pos<view.scrollTop+28||pos>view.scrollTop+view.clientHeight*.6){view.scrollTo({top:Math.max(0,pos-view.clientHeight*.3),behavior:'smooth'})}}
 }
}
function clearHighlights(){highlightedKey=null;const view=byId('charonTranscript');view?.querySelectorAll('.charon-speaking').forEach(el=>{el.classList.remove('charon-speaking');el.removeAttribute('aria-current')});document.querySelectorAll('#studyContent .charon-speaking').forEach(el=>el.classList.remove('charon-speaking'));byId('charonFollowLabel').textContent='Aguardando a narração.'}
function prepareOffsets(){
 const all=clean(narration?.text||'');let cursor=0;partOffsets=parts.map(p=>{const found=all.indexOf(p,cursor);const start=found>=0?found:cursor;cursor=start+p.length;return start});
}
function positionAtAudioTime(t){
 if(!parts.length)return null;
 let i=partIndex, elapsed=t, duration=Number.isFinite(player?.duration)?player.duration:0;
 if(playingContinuous&&timeline.length){i=timeline.findIndex(x=>t<x.end);if(i<0)i=timeline.length-1;elapsed=Math.max(0,t-timeline[i].start);duration=timeline[i].duration;}
 if(!duration||duration<=0)return partOffsets[i]||0;
 const fraction=Math.max(0,Math.min(1,elapsed/duration));
 return (partOffsets[i]||0)+Math.floor((parts[i]?.length||0)*fraction);
}
function syncTranscript(){if(preparing||!player?.src||!narration)return;const pos=positionAtAudioTime(player.currentTime);if(pos!==null)showSegmentAt(pos);}
function nextButtonVisible(on){const btn=byId('charonNextDay');if(!btn)return;btn.hidden=!on||activeDay>=365;btn.disabled=preparing;btn.textContent=`▶ Ouvir o Dia ${String(Math.min(activeDay+1,365)).padStart(3,'0')} com Charon`;}
function finished(){preparing=false;showSegmentAt(narration?.segments?.at(-1)?.end||0);nextButtonVisible(true);
 status(activeDay<365?'Narração concluída. Toque em “Ouvir próximo dia” quando quiser continuar; um novo estudo pode consumir cota gratuita.':'Narração do Dia 365 concluída. Parabéns por chegar ao final da jornada.');}
async function listenNextDay(){
 if(activeDay>=365||preparing)return;
 const select=byId('daySelect');if(!select)return;
 select.value=String(activeDay+1);select.dispatchEvent(new Event('change',{bubbles:true}));
 await start('study');
}
// Divide por sentenças/palavras, sem cortar nenhum conteúdo para caber no limite de uma chamada.
function chunk(text,max=MAX_CHUNK){const sentences=text.replace(/\r/g,'').split(/(?<=[.!?;:\n])\s+/u).filter(Boolean);const out=[];let buf='';
 const flush=()=>{if(buf){out.push(buf.trim());buf=''}};
 for(const sentence of sentences){if((buf+' '+sentence).trim().length<=max){buf=(buf+' '+sentence).trim();continue}flush();if(sentence.length<=max){buf=sentence;continue}
  for(const word of sentence.split(/\s+/)){if((buf+' '+word).trim().length>max)flush();if(word.length>max){for(let i=0;i<word.length;i+=max)out.push(word.slice(i,i+max))}else{buf=(buf+' '+word).trim()}}}
 flush();return out}
function hash(t){let n=2166136261;for(let i=0;i<t.length;i++){n^=t.charCodeAt(i);n=Math.imul(n,16777619)}return (n>>>0).toString(16)}
function openDB(){if(!('indexedDB' in window))return Promise.resolve(null);if(cacheDB)return cacheDB;
 cacheDB=new Promise(resolve=>{try{const req=indexedDB.open('meuDevocional.charon.cache.v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('audio');req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null)}catch(_){resolve(null)}});return cacheDB}
async function cacheGet(key){const db=await openDB();if(!db)return null;return new Promise(resolve=>{try{const r=db.transaction('audio','readonly').objectStore('audio').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null)}catch(_){resolve(null)}})}
async function cachePut(key,blob){const db=await openDB();if(!db)return;return new Promise(resolve=>{try{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put(blob,key);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve()}catch(_){resolve()}})}
function quota(){const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});const key='meuDevocional.charon.localQuota.v1';let s;try{s=JSON.parse(localStorage.getItem(key)||'null')}catch(_){}if(!s||s.date!==day)s={date:day,count:0};return {count:s.count,inc(){s.count++;try{localStorage.setItem(key,JSON.stringify(s))}catch(_){}}}}
function decode(b64){const parts=[];for(let i=0;i<b64.length;i+=32768){const bin=atob(b64.slice(i,i+32768));const bytes=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)bytes[k]=bin.charCodeAt(k);parts.push(bytes)}return new Blob(parts,{type:'audio/wav'});}
async function loadPart(text,day,mode,i){const key=`${MODEL}:Charon:${day}:${mode}:${i}:${hash(text)}`;let wav=await cacheGet(key);if(wav)return {wav,cached:true};
 if(!navigator.onLine)throw new Error('Sem internet. Este trecho ainda não foi baixado.');
 const q=quota();if(q.count>=DAILY_LIMIT)throw new Error('Limite local de 12 gerações por dia atingido. Os trechos já baixados continuam disponíveis.');
 const m=await getModel();q.inc(); // Limite conservador, mesmo se a chamada falhar
 let response;try{response=await m.generateContent([{type:'text',text, speechMetadata:{style:'Voz masculina madura. Português brasileiro natural. Narrador calmo, firme, paciente, reverente. Ritmo moderado, pausas naturais entre as ideias e oração, sem dramatização.'}}])}catch(err){
  const message=String(err?.message||err);
  if(/quota|429|resource_exhausted/i.test(message))throw new Error('A cota gratuita do Gemini terminou. Tente novamente quando o Google liberar novas solicitações; não é preciso contratar plano.');
  if(/billing|paid tier|plan|blaze/i.test(message))throw new Error('O Google exige faturamento para esta solicitação. Não ative cobrança: mantenha apenas o projeto Spark e tente outro modelo gratuito quando disponível.');
  if(/app.?check|recaptcha|attestation|403|permission/i.test(message))throw new Error('O App Check bloqueou a solicitação. Confira o domínio no reCAPTCHA Enterprise e a ativação do App Check no Firebase.');
  throw new Error('Não foi possível gerar o áudio: '+message.slice(0,180))
 }
 const item=response?.response?.inlineDataParts?.()?.[0];if(!item?.inlineData?.data)throw new Error('Gemini não retornou áudio para este trecho.');
 wav=decode(item.inlineData.data);await cachePut(key,wav);return {wav,cached:false};
}
// Une os WAVs do Gemini em um único arquivo PCM, sem chamadas extras à IA.
// Requer formatos compatíveis: PCM16, mono, mesma frequência (padrão Firebase AI Logic TTS: 24 kHz).
function wavChunk(ab) {
 const v=new DataView(ab), tag=(offset)=>String.fromCharCode(...new Uint8Array(ab,offset,4));
 if(ab.byteLength<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')throw new Error('O Gemini devolveu um áudio WAV não reconhecido.');
 let fmt=null, data=null;
 for(let p=12;p+8<=ab.byteLength;){
   const id=tag(p),len=v.getUint32(p+4,true),start=p+8;
   if(start+len>ab.byteLength)throw new Error('Um dos áudios WAV chegou incompleto.');
   if(id==='fmt '){if(len<16)throw new Error('Cabeçalho WAV incompatível.');fmt={type:v.getUint16(start,true),channels:v.getUint16(start+2,true),rate:v.getUint32(start+4,true),bits:v.getUint16(start+14,true)}}
   if(id==='data')data=new Uint8Array(ab,start,len);
   p=start+len+(len%2);
 }
 if(!fmt||!data||fmt.type!==1||fmt.channels!==1||fmt.bits!==16||data.byteLength%2)throw new Error('Formato WAV inesperado. Use o modo por partes.');
 return {...fmt,data};
}
function joinWavs(buffers) {
 const wavs=buffers.map(wavChunk);if(!wavs.length)throw new Error('Não há gravações para unir.');
 const {rate,channels,bits}=wavs[0];
 if(wavs.some(w=>w.rate!==rate||w.channels!==channels||w.bits!==bits))throw new Error('Os trechos têm formatos diferentes. Use o modo por partes.');
 const bytes=wavs.reduce((n,w)=>n+w.data.byteLength,0);
 if(bytes>240*1024*1024)throw new Error('O estudo é grande demais para juntar em uma única faixa neste aparelho. Use o modo por partes.');
 const out=new Uint8Array(44+bytes),v=new DataView(out.buffer),put=(i,text)=>{for(let j=0;j<text.length;j++)out[i+j]=text.charCodeAt(j)};
 put(0,'RIFF');v.setUint32(4,36+bytes,true);put(8,'WAVE');put(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);
 v.setUint32(28,rate*channels*bits/8,true);v.setUint16(32,channels*bits/8,true);v.setUint16(34,bits,true);put(36,'data');v.setUint32(40,bytes,true);
 let offset=44;for(const w of wavs){out.set(w.data,offset);offset+=w.data.byteLength}
 return new Blob([out],{type:'audio/wav'});
}
function setPlayerBlob(blob,noticeText,token) {
 if(token!==runId)return;
 release();audioURL=URL.createObjectURL(blob);player.src=audioURL;player.load();player.playbackRate=1;
 preparing=false;status(noticeText);
 player.play().catch(()=>{if(token===runId)status('Áudio pronto. Toque em ▶ no player para ouvir.');});
}
async function playContinuous(token) {
 if(token!==runId)return;
 playingContinuous=true;preparing=true;
 const buffers=[];partDurations=[];timeline=[];
 try {
   for(let i=0;i<parts.length;i++){
     if(token!==runId)return;
     status(`Preparando narração contínua: trecho ${i+1} de ${parts.length}. A reprodução começa quando a faixa inteira estiver pronta. Trechos em cache não gastam cota.`);
     const result=await loadPart(parts[i],activeDay,currentMode,i);
     if(token!==runId)return;
     const ab=await result.wav.arrayBuffer();buffers.push(ab);
     const info=wavChunk(ab);partDurations.push(info.data.byteLength/(info.rate*info.channels*info.bits/8));
   }
   if(token!==runId)return;
   status('Unindo os trechos em uma faixa contínua...');
   let elapsed=0;timeline=partDurations.map(duration=>{const x={start:elapsed,end:elapsed+duration,duration};elapsed+=duration;return x});
   const joined=joinWavs(buffers);
   if(token!==runId)return;
   setPlayerBlob(joined,`✓ Narração contínua pronta (${parts.length} trechos reunidos). Pode apagar a tela durante a reprodução.`,token);
 } catch(e) {
   if(token!==runId)return;
   preparing=false;playingContinuous=false;
   status('Não foi possível preparar a faixa contínua: '+(e.message||e)+' Os trechos gerados continuam salvos. Desmarque “Reprodução contínua” para ouvir por partes.');
 }
}
function release(){if(audioURL){URL.revokeObjectURL(audioURL);audioURL=null}}
function pause(){if(player&&!player.paused)player.pause()}
function stop(){runId++;preparing=false;paused=false;playingContinuous=false;parts=[];partIndex=0;partOffsets=[];partDurations=[];timeline=[];narration=null;clearHighlights();nextButtonVisible(false);if(player){player.pause();player.removeAttribute('src');player.load()}release();status('Narração interrompida.');}
function setDay(day){if(day!==activeDay){activeDay=day;stop()}try{narration=narrationFor(fieldsForDay(day),false);renderTranscript()}catch(_){}}
async function playNext(token){if(token!==runId)return;if(partIndex>=parts.length){finished();return}
 const current=partIndex;preparing=true;status(`Preparando trecho ${current+1} de ${parts.length} com Charon...`);
 try{const r=await loadPart(parts[current],activeDay,currentMode,current);if(token!==runId)return;
  release();audioURL=URL.createObjectURL(r.wav);player.src=audioURL;player.load();player.playbackRate=1;
  status(`${r.cached?'Trecho salvo':'Trecho gerado'}: ${current+1} de ${parts.length}. Se não iniciar automaticamente, toque em ▶ no player.`);preparing=false;
  try{await player.play()}catch(_){status('Áudio pronto. Toque em ▶ no player para ouvi-lo.');}
 }catch(e){if(token!==runId)return;preparing=false;status('Atenção: '+(e.message||e));}
}
let currentMode='study';
async function start(mode){if(!configured){if(typeof showTab==='function')showTab('settings');byId('charonConfigDetails').open=true;byId('charonConfigDetails').scrollIntoView({behavior:'smooth',block:'nearest'});status('Primeiro configure o Firebase Spark sem faturamento.');return}
 const day=Number(byId('daySelect')?.value||1);try{const s=fieldsForDay(day);const nextNarration=narrationFor(s,mode==='prayer');const txt=nextNarration.text;if(!txt.trim())throw new Error('Texto do estudo não encontrado.');
   window.DevocionalAudio?.stop?.('Reproduzindo Charon.');
   stop();activeDay=day;currentMode=mode;narration=nextNarration;renderTranscript();parts=chunk(txt);prepareOffsets();partIndex=0;runId++;if(byId('charonContinuous')?.checked)await playContinuous(runId);else await playNext(runId);
 }catch(e){status('Não foi possível começar: '+(e.message||e));}}
function playStudy(){return start('study')}
function playPrayer(){return start('prayer')}
async function onConfig(e){e.preventDefault();const config={projectId:byId('charonProjectId').value.trim(),appId:byId('charonAppId').value.trim(),apiKey:byId('charonApiKey').value.trim(),siteKey:byId('charonSiteKey').value.trim()};
 if(!validate(config)){status('Confira os quatro valores da configuração Web Firebase e a chave pública do reCAPTCHA Enterprise.');return}
 if(!byId('charonSparkConfirm').checked){status('Antes de continuar, confirme que seu projeto está no plano Spark, sem faturamento.');return}
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(config));configured=config;model=null;configureUI();byId('charonConfigDetails').open=false;status('Configuração salva neste dispositivo. Faça o primeiro teste do Dia 01 com Charon.');}catch(_){status('Não foi possível armazenar configuração neste dispositivo.');}}
function clearConfig(){if(!confirm('Desvincular a configuração Charon deste aparelho? Seus estudos, anotações e Bíblia ONBV não serão afetados.'))return;stop();localStorage.removeItem(STORAGE_KEY);configured=null;model=null;configureUI();status('Configuração Charon desvinculada deste aparelho. Os áudios anteriormente gerados continuam no cache local.');}
function init(){player=byId('charonAudio');activeDay=Number(byId('daySelect')?.value||1);if(!player)return;
 byId('charonConfigForm').addEventListener('submit',onConfig);byId('charonClear').addEventListener('click',clearConfig);
 const continuousBox=byId('charonContinuous');
 continuousBox.checked=localStorage.getItem(CONTINUOUS_PREF_KEY)!=='false';
 continuousBox.addEventListener('change',()=>{try{localStorage.setItem(CONTINUOUS_PREF_KEY,String(continuousBox.checked))}catch(_){}status(continuousBox.checked?'Reprodução contínua: prepare a faixa completa antes de tocar.':'Modo rápido: reproduz os trechos enquanto gera os próximos.')});
 byId('charonStudy').addEventListener('click',playStudy);byId('charonPrayer').addEventListener('click',playPrayer);byId('charonStop').addEventListener('click',stop);byId('charonLocal').addEventListener('click',()=>{stop();window.DevocionalAudio?.startLocal?.('study')});
 player.addEventListener('ended',()=>{if(playingContinuous){finished();return}partIndex++;playNext(runId)});
 player.addEventListener('timeupdate',syncTranscript);
 player.addEventListener('seeked',syncTranscript);
 byId('charonNextDay').addEventListener('click',listenNextDay);
 player.addEventListener('error',()=>{if(player.src)status('Falha ao reproduzir este trecho. Tente novamente.')});
 player.addEventListener('play',()=>{window.DevocionalAudio?.stop?.('Charon em reprodução.');if('mediaSession' in navigator&&typeof MediaMetadata==='function'){try{navigator.mediaSession.metadata=new MediaMetadata({title:`Dia ${String(activeDay).padStart(3,'0')} · Voz Charon`,artist:'Meu Devocional · Narração IA',album:'365 estudos bíblicos'});}catch(_){}}});
 window.addEventListener('pagehide',pause);
 configureUI();
 try{narration=narrationFor(fieldsForDay(activeDay),false);renderTranscript()}catch(_){}
}
window.DevocionalCharon={pause,stop,setDay,isConfigured,playStudy,playPrayer};
document.addEventListener('DOMContentLoaded',init);
