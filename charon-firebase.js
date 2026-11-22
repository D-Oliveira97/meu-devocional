/* Meu Devocional 2.7 · Charon neural sob demanda · Firebase AI Logic + App Check · sem chave Gemini privada */
'use strict';
const STORAGE_KEY = 'meuDevocional.charon.firebase.v1';
const DAILY_LIMIT = 12; // guarda local, NÃO garante limitação remota do projeto compartilhado
const MAX_CHUNK = 1550;
const MODEL = 'gemini-3.8-flash-tts';
const SDK_VERSION='13.4.0';
const byId=id=>document.getElementById(id);
let activeDay=1, runId=0, configured=null, model=null, player=null, audioURL=null;
let parts=[], partIndex=0, preparing=false, paused=false;
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
function composeText(s,onlyPrayer){if(onlyPrayer)return `Meu Devocional. Dia ${s.day}. Oração do dia. ${clean(s.prayer)} Amém.`;
 const arr=[`Meu Devocional. Dia ${s.day} de 365. ${s.title}.`,
 `Leitura bíblica de referência: ${s.reference}. Nesta narração ouviremos os comentários e aplicações. A leitura integral da Bíblia ONBV fica no leitor bíblico separado.`,
 'Preparando o coração: Separe um momento para receber a Palavra de Deus com atenção e humildade.',
 `Ideia central: ${s.insight}`,`Contexto histórico e literário: ${s.context}`,`Observando a passagem: ${s.interpretation}`,`Conexões bíblicas: ${s.theology}`,
 `Referências para aprofundar: ${s.crossReferences}`,`Um cuidado ao interpretar: ${s.care}`];
 if(s.extendedHtml)arr.push(`Aprofundamento: ${stripExtras(s.extendedHtml)}`);
 arr.push(`Aplicação para hoje: ${s.practice}`);
 (s.questions||[]).forEach((q,i)=>arr.push(`Pergunta para refletir ${i+1}: ${q}`));
 arr.push(`Oração do dia: ${s.prayer}`);
 return arr.map(clean).filter(Boolean).join('\n\n');
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
function release(){if(audioURL){URL.revokeObjectURL(audioURL);audioURL=null}}
function pause(){if(player&&!player.paused)player.pause()}
function stop(){runId++;preparing=false;paused=false;parts=[];partIndex=0;if(player){player.pause();player.removeAttribute('src');player.load()}release();status('Narração Charon interrompida.');}
function setDay(day){if(day!==activeDay){activeDay=day;stop()}}
async function playNext(token){if(token!==runId)return;if(partIndex>=parts.length){status('Narração concluída. Você pode registrar sua reflexão.');preparing=false;return}
 const current=partIndex;preparing=true;status(`Preparando trecho ${current+1} de ${parts.length} com Charon...`);
 try{const r=await loadPart(parts[current],activeDay,currentMode,current);if(token!==runId)return;
  release();audioURL=URL.createObjectURL(r.wav);player.src=audioURL;player.load();player.playbackRate=1;
  status(`${r.cached?'Trecho salvo':'Trecho gerado'}: ${current+1} de ${parts.length}. Se não iniciar automaticamente, toque em ▶ no player.`);preparing=false;
  try{await player.play()}catch(_){status('Áudio pronto. Toque em ▶ no player para ouvi-lo.');}
 }catch(e){if(token!==runId)return;preparing=false;status('Atenção: '+(e.message||e));}
}
let currentMode='study';
async function start(mode){if(!configured){byId('charonConfigDetails').open=true;byId('charonConfigDetails').scrollIntoView({behavior:'smooth',block:'nearest'});status('Primeiro configure o Firebase Spark sem faturamento.');return}
 const day=Number(byId('daySelect')?.value||1);try{const s=fieldsForDay(day);const txt=composeText(s,mode==='prayer');if(!txt.trim())throw new Error('Texto do estudo não encontrado.');
   window.DevocionalAudio?.stop?.('Reproduzindo Charon.');window.DevocionalBenicio?.pause?.();
   stop();activeDay=day;currentMode=mode;parts=chunk(txt);partIndex=0;runId++;await playNext(runId);
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
 byId('charonStudy').addEventListener('click',playStudy);byId('charonPrayer').addEventListener('click',playPrayer);byId('charonStop').addEventListener('click',stop);byId('charonLocal').addEventListener('click',()=>{stop();window.DevocionalAudio?.startLocal?.('study')});
 player.addEventListener('ended',()=>{partIndex++;playNext(runId)});
 player.addEventListener('error',()=>{if(player.src)status('Falha ao reproduzir este trecho. Tente novamente.')});
 player.addEventListener('play',()=>{window.DevocionalBenicio?.pause?.();window.DevocionalAudio?.stop?.('Charon em reprodução.');if('mediaSession' in navigator&&typeof MediaMetadata==='function'){try{navigator.mediaSession.metadata=new MediaMetadata({title:`Dia ${String(activeDay).padStart(3,'0')} · Voz Charon`,artist:'Meu Devocional · Narração IA',album:'365 estudos bíblicos'});}catch(_){}}});
 window.addEventListener('pagehide',pause);
 configureUI();
}
window.DevocionalCharon={pause,stop,setDay,isConfigured,playStudy,playPrayer};
document.addEventListener('DOMContentLoaded',init);
