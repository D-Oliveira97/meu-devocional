/* Meu Devocional · Narração local e preferência de timbre sereno · 2.5 */
'use strict';
(function(){
 const SETTINGS_KEY='meuDevocional.audio.v1';
 const supported=('speechSynthesis' in window && typeof SpeechSynthesisUtterance!=='undefined');
 const synth=supported?window.speechSynthesis:null;
 const byId=id=>document.getElementById(id);
 let currentDay=0;
 let parts=[];
 let queue=[];
 let index=0;
 let runToken=0;
 let playing=false;
 let paused=false;
 let mode='study';
 let speed=1;
 let voiceURI='auto';
 let tone='sereno'; // preferência local, não é um motor de voz neural

 function readSettings(){
  try{
   const value=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
   if([0.8,1,1.15,1.3,1.5].includes(Number(value.rate)))speed=Number(value.rate);
   if(typeof value.voiceURI==='string'&&value.voiceURI.length<250)voiceURI=value.voiceURI;
   if(['sereno','normal'].includes(value.tone))tone=value.tone;
  }catch(_){}
 }
 function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({rate:speed,voiceURI,tone}))}catch(_){}}
 function textOnly(html){
  const target=document.createElement('div');target.innerHTML=html||'';
  target.querySelectorAll('script,style,button,a').forEach(el=>el.remove());
  return Array.from(target.querySelectorAll('h3,h4,p,li')).map(el=>el.textContent.trim()).filter(Boolean);
 }
 function buildParts(s){
  const items=[];
  function add(label,text){const clean=String(text||'').replace(/\s+/g,' ').trim();if(clean)items.push({label,text:clean})}
  add('Abertura',`Dia ${s.day} de 365. ${s.title}. Leitura bíblica: ${s.reference}. Esta narração acompanha o comentário e as reflexões da jornada. A passagem bíblica completa da ONBV pode ser narrada na opção específica.`);
  add('Preparando o coração','Separe alguns minutos para o silêncio. Peça a Deus humildade, atenção e coragem para viver aquilo que a passagem ensina. Leia o texto inteiro antes de consultar o comentário.');
  add('Ideia central',s.insight);
  add('Contexto histórico e literário',s.context);
  add('Como observar o texto',s.interpretation);
  add('O que a passagem ensina?',s.insight);
  add('Conexões com a mensagem bíblica',s.theology);
  add('Referências para aprofundar',s.crossReferences);
  add('Cuidado ao interpretar',s.care);
  if(s.extendedHtml){
   const extras=textOnly(s.extendedHtml);
   extras.forEach((t,i)=>add(`Aprofundamento especial ${i+1}`,t));
  }
  add('Aplicação para hoje',s.practice);
  (s.questions||[]).forEach((q,i)=>add(`Reflexão ${i+1}`,q));
  add('Oração do dia',s.prayer);
  return items;
 }
 // Partes curtas evitam travamentos comuns de locuções muito longas no Android.
 function chunk(text,max=190){
  const result=[];
  const sentences=String(text).split(/(?<=[.!?;:])\s+/u).filter(Boolean);
  let line='';
  function flush(){if(line.trim()){result.push(line.trim());line=''}}
  for(const sentence of sentences){
   if((line+' '+sentence).trim().length<=max){line=(line+' '+sentence).trim();continue}
   flush();
   if(sentence.length<=max){line=sentence;continue}
   const words=sentence.split(/\s+/);
   for(const word of words){
    if((line+' '+word).trim().length>max)flush();
    if(word.length>max){for(let start=0;start<word.length;start+=max)result.push(word.slice(start,start+max));}
    else line=(line+' '+word).trim();
   }
  }
  flush();return result;
 }
 function makeQueue(items){return items.flatMap((part,partIndex)=>chunk(part.text).map(text=>({partIndex,label:part.label,text})));}
 function status(message){byId('audioStatus').textContent=message;}
 function updateUI(){
  const progress=queue.length?Math.round(100*Math.min(index,queue.length)/queue.length):0;
  byId('audioTrackBar').style.width=progress+'%';
  byId('audioProgressLabel').textContent=queue.length
   ?`${progress}% · ${Math.min(index+1,queue.length)} de ${queue.length} trechos · Dia ${String(currentDay).padStart(3,'0')}`
   :`Pronto para ouvir · Dia ${String(currentDay||1).padStart(3,'0')}`;
  byId('audioPlay').textContent=paused&&mode==='study'?'▶ Retomar estudo':'▶ Ouvir estudo completo';
  byId('audioPrayer').textContent=paused&&mode==='prayer'?'▶ Retomar oração':'🙏 Ouvir só a oração';
  byId('audioBible').textContent=paused&&mode==='bible'?'▶ Retomar passagem':'📖 Ouvir passagem ONBV';
  byId('audioFull').textContent=paused&&mode==='bible-study'?'▶ Retomar leitura completa':'🎧 Passagem + estudo';
  byId('audioPause').disabled=!playing;
  byId('audioStop').disabled=!playing&&!paused;
  byId('audioPause').textContent='⏸ Pausar';
  const part=queue[index]?.partIndex??-1;
  byId('audioPrev').disabled=!playing&&!paused||part<=0;
  byId('audioNext').disabled=!playing&&!paused||part<0||part>=parts.length-1||mode==='prayer';
 }
 function cancelAudio(){
  runToken++;
  if(synth){try{synth.cancel()}catch(_){}}
 }
 function stop(message='Narração interrompida.'){
  cancelAudio();playing=false;paused=false;queue=[];index=0;updateUI();status(message);
 }
 function setDay(day){
  if(day===currentDay)return;
  currentDay=day;
  stop('Pronto para ouvir o estudo do Dia '+String(day).padStart(3,'0')+'.');
 }
 function getVoice(){
  const voices=synth.getVoices();
  if(voiceURI!=='auto'){
   const saved=voices.find(v=>v.voiceURI===voiceURI);if(saved)return saved;
  }
  return voices.find(v=>v.lang.toLowerCase()==='pt-br')||voices.find(v=>v.lang.toLowerCase().startsWith('pt'))||null;
 }
 function populateVoices(){
  if(!supported)return;
  const input=byId('audioVoice');
  const spoken=synth.getVoices().filter(v=>/^pt(-|$)/i.test(v.lang));
  input.replaceChildren();
  const auto=document.createElement('option');auto.value='auto';auto.textContent='Automática (português)';input.append(auto);
  spoken.forEach(v=>{const option=document.createElement('option');option.value=v.voiceURI;option.textContent=`${v.name} · ${v.lang}`;input.append(option)});
  input.value=spoken.some(v=>v.voiceURI===voiceURI)?voiceURI:'auto';
 }
 function speakNext(token){
  if(!playing||token!==runToken)return;
  if(index>=queue.length){
   playing=false;paused=false;index=queue.length;updateUI();status(mode==='prayer'?'Oração finalizada. Amém.':'Estudo finalizado. Você pode registrar suas reflexões ou marcar o dia como concluído.');return;
  }
  const item=queue[index];
  const utterance=new SpeechSynthesisUtterance(item.text);
  utterance.lang='pt-BR';utterance.rate=Math.max(0.5,Math.min(1.7,speed*(tone==='sereno'?0.94:1)));utterance.pitch=tone==='sereno'?0.86:1;utterance.volume=1;
  const selectedVoice=getVoice();if(selectedVoice)utterance.voice=selectedVoice;
  utterance.onend=()=>{if(!playing||runToken!==token)return;index++;updateUI();speakNext(token)};
  utterance.onerror=e=>{
   if(runToken!==token||!playing)return;
   if(e.error==='interrupted'||e.error==='canceled')return;
   // Caso uma voz falhe, permita retomar este trecho sem perder o dia.
   cancelAudio();playing=false;paused=true;updateUI();status('A leitura foi interrompida pelo dispositivo. Toque em Retomar para tentar novamente.');
  };
  status('Lendo: '+item.label+'…');
  updateUI();
  try{synth.speak(utterance)}catch(_){playing=false;paused=true;status('Não foi possível iniciar a voz. Verifique a síntese de voz do Android e tente novamente.');updateUI();}
 }
 function start(modeArg){
  window.DevocionalBenicio?.pause?.();
  if(!supported){status('Este navegador não oferece leitura em voz alta. Experimente abrir o app pelo Chrome atualizado.');return;}
  const day=window.DevocionalAudio?.selectedDay?.()||currentDay;
  const s=window.DevocionalAudio?.study?.(day);
  if(!s){status('Os estudos ainda estão carregando. Tente novamente.');return;}
  const resume=paused&&queue.length&&modeArg===mode&&day===currentDay;
  cancelAudio();
  if(!resume){
   currentDay=day;mode=modeArg;parts=mode==='prayer'?[{label:'Oração do dia',text:s.prayer}]:buildParts(s);
   queue=makeQueue(parts);index=0;
  }
  playing=true;paused=false;
  updateUI();speakNext(runToken);
 }
 function playBibleParts(bibleParts,withStudy=false){
  window.DevocionalBenicio?.pause?.();
  if(!supported){status('Este aparelho não oferece síntese de voz disponível.');return}
  if(!Array.isArray(bibleParts)||!bibleParts.length){status('Importe a Bíblia ONBV antes de iniciar a narração.');return}
  const nextMode=withStudy?'bible-study':'bible';
  const day=window.DevocionalAudio?.selectedDay?.()||currentDay;
  const resume=paused&&queue.length&&nextMode===mode&&day===currentDay;
  cancelAudio();
  if(!resume){
    currentDay=day;mode=nextMode;
    const current=window.DevocionalAudio?.study?.(day);
    parts=[...bibleParts,...(withStudy&&current?buildParts(current):[])];
    queue=makeQueue(parts);index=0;
  }
  playing=true;paused=false;updateUI();speakNext(runToken);
 }
 function pause(){
  if(!playing)return;
  // Cancelar e retomar desde o início do trecho é mais previsível que pause/resume no Android.
  cancelAudio();playing=false;paused=true;updateUI();status('Pausado. Ao retomar, o trecho atual será repetido.');
 }
 function togglePause(){
  if(playing){pause();return}
  if(paused&&queue.length){cancelAudio();playing=true;paused=false;updateUI();speakNext(runToken)}
 }
 function jump(direction){
  if(!queue.length)return;
  const part=queue[index]?.partIndex??0;
  const nextPart=part+direction;
  if(nextPart<0||nextPart>=parts.length)return;
  const nextIndex=queue.findIndex(item=>item.partIndex===nextPart);
  if(nextIndex<0)return;
  cancelAudio();index=nextIndex;playing=true;paused=false;updateUI();speakNext(runToken);
 }
 function initialize(){
  readSettings();
  byId('audioSpeed').value=String(speed);
  byId('audioTone').value=tone;
  byId('audioTone').addEventListener('change',e=>{
   tone=e.target.value==='normal'?'normal':'sereno';saveSettings();
   if(playing){cancelAudio();speakNext(runToken);}
  });
  byId('audioSpeed').addEventListener('change',e=>{
   speed=Number(e.target.value)||1;saveSettings();
   if(playing){cancelAudio();speakNext(runToken);}
  });
  byId('audioVoice').addEventListener('change',e=>{
   voiceURI=e.target.value;saveSettings();
   if(playing){cancelAudio();speakNext(runToken);}
  });
  byId('audioPlay').addEventListener('click',()=>start('study'));
  byId('audioPrayer').addEventListener('click',()=>start('prayer'));
  byId('audioPause').addEventListener('click',pause);
  byId('audioStop').addEventListener('click',()=>stop());
  byId('audioPrev').addEventListener('click',()=>jump(-1));
  byId('audioNext').addEventListener('click',()=>jump(1));
  if(supported){populateVoices();synth.addEventListener?.('voiceschanged',populateVoices)}
  else{['audioPlay','audioPrayer','audioSpeed','audioVoice','audioTone'].forEach(id=>byId(id).disabled=true);status('Leitura por voz não disponível neste navegador.');}
  updateUI();
  window.addEventListener('pagehide',()=>{if(playing)cancelAudio()});
 }
 window.DevocionalAudio={setDay,stop,togglePause,playBibleParts,selectedDay:()=>typeof selectedDay!=='undefined'?selectedDay:currentDay,study:day=>typeof study==='function'?study(day):null};
 document.addEventListener('DOMContentLoaded',initialize);
})();
