'use strict';
const $=selector=>document.querySelector(selector);
const $$=selector=>Array.from(document.querySelectorAll(selector));
const STORAGE_V2='meuDevocional.v2';
const STORAGE_V1='meuDevocional.v1';
const REMINDER_PREFS_KEY='meuDevocional.reminders.v1';
const DEVOTIONAL_URL='https://d-oliveira97.github.io/meu-devocional/';
const INITIAL_DATE={year:2026,month:10,day:22};
const MAX_DAYS=365;
let studies=[];
let selectedDay=1;
let page='study';
let deferredPrompt=null;
let data=loadData();

function safeJson(text){try{return JSON.parse(text)}catch(_){return null}}
function uniqueDays(xs){return Array.from(new Set((Array.isArray(xs)?xs:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=MAX_DAYS))).sort((a,b)=>a-b)}
function normalizeData(source){
 const s=source&&typeof source==='object'&&!Array.isArray(source)?source:{};
 const notes={};
 if(s.notesByDay&&typeof s.notesByDay==='object'&&!Array.isArray(s.notesByDay)){
   Object.entries(s.notesByDay).forEach(([k,v])=>{const n=Number(k);if(Number.isInteger(n)&&n>=1&&n<=365&&typeof v==='string')notes[n]=v.slice(0,200000)});
 }
 const checklist={};
 if(s.checklistByDay&&typeof s.checklistByDay==='object'&&!Array.isArray(s.checklistByDay)){
   Object.entries(s.checklistByDay).forEach(([k,v])=>{
     const n=Number(k);if(Number.isInteger(n)&&n>=1&&n<=365&&v&&typeof v==='object'){
       checklist[n]={};Object.entries(v).forEach(([task,value])=>{if(['read','cross','reflect','pray','john','thanks','care'].includes(task))checklist[n][task]=!!value});
     }
   });
 }
 return {schema:2,completed:uniqueDays(s.completed),favorites:uniqueDays(s.favorites),notesByDay:notes,
   checklistByDay:checklist,verses:(Array.isArray(s.verses)?s.verses:[]).filter(v=>typeof v==='string').slice(0,500).map(s=>s.slice(0,200)),
   lastDay:Math.max(1,Math.min(365,Number(s.lastDay)||1))};
}
function loadData(){
 let v2=null,legacy=null;
 try{v2=safeJson(localStorage.getItem(STORAGE_V2));legacy=safeJson(localStorage.getItem(STORAGE_V1));}catch(_){/* fallback memory */}
 if(v2)return normalizeData(v2);
 const fresh=normalizeData({});
 if(legacy&&typeof legacy==='object'){
   if(typeof legacy.notes==='string')fresh.notesByDay[1]=legacy.notes;
   if(legacy.day1Done)fresh.completed=[1];
   if(Array.isArray(legacy.verses))fresh.verses=legacy.verses.filter(v=>typeof v==='string');
   if(legacy.tasks&&typeof legacy.tasks==='object')fresh.checklistByDay[1]={...legacy.tasks};
 }
 try{localStorage.setItem(STORAGE_V2,JSON.stringify(fresh));}catch(_){}
 // A chave v1 nunca é apagada: preserva o backup original da versão anterior.
 return fresh;
}
function persist(){try{localStorage.setItem(STORAGE_V2,JSON.stringify(data));return true}catch(_){alertUser('Não foi possível salvar no navegador. Exporte um backup e verifique se há espaço disponível.','error');return false}}
function h(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function htext(s){return h(s).replace(/\n/g,'<br>')}
function d(n){return String(n).padStart(3,'0')}
function todaysPlanDay(){const now=new Date();const t=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());const s=Date.UTC(INITIAL_DATE.year,INITIAL_DATE.month,INITIAL_DATE.day);return Math.max(1,Math.min(MAX_DAYS,Math.floor((t-s)/86400000)+1))}
function study(n){return studies[n-1]}
function alertUser(message,type='success'){
 const el=$('#alert');el.textContent=message;el.classList.toggle('error',type==='error');el.classList.remove('hidden');
 clearTimeout(alertUser.timeout);alertUser.timeout=setTimeout(()=>el.classList.add('hidden'),6500);
}
function showTab(name){
 page=name;
 $$('.tab').forEach(btn=>{const active=btn.dataset.tab===name;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active))});
 $$('.panel').forEach(el=>el.classList.toggle('hidden',el.id!==name));
 if(name==='library')renderLibrary();
 if(name==='journal')renderJournal();
 if(name==='saved')renderFavorites();
 if(name==='progress')renderProgress();
 if(name==='reminders')updateReminderPreview();
 if(name==='bible')window.DevocionalBible?.renderChapter?.();
}
function selectDay(n,{switchTab=true,scroll=false}={}){
 selectedDay=Math.max(1,Math.min(MAX_DAYS,Math.floor(Number(n)||1)));
 window.DevocionalAudio?.setDay?.(selectedDay);
 window.DevocionalCharon?.setDay?.(selectedDay);
 data.lastDay=selectedDay;persist();
 if(switchTab)showTab('study');
 renderStudy();renderJournal();renderProgress();
 $('#daySelect').value=String(selectedDay);
 window.DevocionalBenicio?.updateForDay?.(selectedDay);
 if(scroll)$('#study').scrollIntoView({behavior:'smooth',block:'start'});
}
function refsHtml(s){return '<p class="refs"><b>Referências para aprofundar:</b> '+h(s)+'</p>'}
function checkItems(){return selectedDay===1?[['read','Reli Gênesis 1 com calma.'],['john','Li João 1:1–14.'],['thanks','Agradeci a Deus por três coisas.'],['care','Demonstrei respeito e amor a alguém.']]:[['read','Li a passagem principal (ONBV no aplicativo ou NVI na minha Bíblia).'],['cross','Consultei ao menos uma referência complementar.'],['reflect','Registrei uma descoberta ou aplicação pessoal.'],['pray','Reservei tempo para orar sobre o texto.']]}
function renderStudy(){
 const s=study(selectedDay);if(!s)return;
 const completed=data.completed.includes(selectedDay),fav=data.favorites.includes(selectedDay);
 $('#prevDay').disabled=selectedDay===1;$('#nextDay').disabled=selectedDay===365;
 $('#selectionHint').textContent=`Dia ${selectedDay} de 365 · Semana ${Math.min(s.week,52)}${selectedDay===365?' · Encerramento':''}`;
 const next=study(selectedDay+1);
 const html=`
  <article class="card hero-card">
    <div class="pill">DIA ${d(s.day)} · ${h(s.theme.toUpperCase())}</div>
    <h2>${h(s.title)}</h2>
    <p class="lead">Um encontro com a Palavra para conhecer a Deus, refletir e praticar a fé no cotidiano.</p>
    <div class="meta"><span class="tag">📖 ${h(s.reference)}</span><span class="tag">🕯️ Bíblia NVI como referência</span><span class="tag">${completed?'✓ Concluído':'Estudo disponível'}</span></div>
    <div class="hero-footer"><button id="favoriteStudy" class="favorite-toggle ${fav?'is-saved':''}" type="button" aria-pressed="${fav}">${fav?'★ Remover dos favoritos':'☆ Adicionar aos favoritos'}</button></div>
  </article>
  <article class="card">
    <div class="section-kicker">01 · PREPARAÇÃO</div>
    <h3>Preparando o coração</h3>
    <p>Separe alguns minutos para o silêncio. Peça a Deus humildade, atenção e coragem para viver aquilo que a passagem ensina. Leia o texto inteiro antes de consultar o comentário.</p>
    <h3>Leitura principal</h3>
    <p><strong>${h(s.reference)}</strong> — leia o texto completo da ONBV no quadro acima, depois de importar a tradução. Os comentários usam a NVI como referência; para comparar as redações, consulte sua Bíblia NVI.</p>
    <p class="study-note"><b>Ideia central:</b> ${h(s.insight)}</p>
  </article>
  <article class="card">
    <div class="section-kicker">02 · CONTEXTO</div>
    <h3>Contexto histórico e literário</h3><p>${h(s.context)}</p>
    <h3>Como observar o texto</h3><p>${h(s.interpretation)}</p>
  </article>
  <article class="card">
    <div class="section-kicker">03 · INTERPRETAÇÃO</div>
    <h3>O que a passagem ensina?</h3><p>${h(s.insight)}</p>
    <h3>Conexões com a mensagem bíblica</h3><p>${h(s.theology)}</p>
    ${refsHtml(s.crossReferences)}
    <h3>Cuidado ao interpretar</h3><p>${h(s.care)}</p>
  </article>
  ${s.extendedHtml?`<article class="card more-study"><div class="section-kicker">APROFUNDAMENTO ESPECIAL</div><h3>Explorando a passagem com mais detalhes</h3>${s.extendedHtml}</article>`:''}
  <article class="card">
    <div class="section-kicker">04 · VIDA PRÁTICA</div>
    <h3>Aplicação para hoje</h3><p>${h(s.practice)}</p>
    <h3>Reflexão pessoal</h3><ol>${s.questions.map(q=>`<li>${h(q)}</li>`).join('')}</ol>
    <p class="small-note">Você pode responder a essas perguntas na aba <b>Anotações</b>; cada dia tem seu próprio caderno.</p>
    <button class="outline" id="openJournal" type="button">✎ Escrever minhas reflexões</button>
  </article>
  <article class="card prayer"><div class="section-kicker">05 · ORAÇÃO DO DIA</div><h3>Fala, Senhor: quero te ouvir</h3><p>${h(s.prayer)}</p></article>
  <article class="card challenge"><div class="section-kicker">06 · COMPROMISSO</div><h3>Desafio espiritual</h3>${checkItems().map(([key,label])=>`<label class="check"><input type="checkbox" data-task="${key}" ${data.checklistByDay[selectedDay]?.[key]?'checked':''}> <span>${h(label)}</span></label>`).join('')}
   <button id="completeBtn" class="primary" type="button">${completed?'✓ Estudo concluído · Desmarcar':'✓ Marcar estudo como concluído'}</button>
   <p class="small-note" id="completeMsg" aria-live="polite"></p>
  </article>
  ${next?`<article class="card next-card"><div class="section-kicker">PRÓXIMO ESTUDO</div><h3>Dia ${d(next.day)} — ${h(next.title)}</h3><p>Leitura: ${h(next.reference)}</p><button id="nextFromCard" class="outline" type="button">Ir para o próximo estudo →</button></article>`:`<article class="card next-card"><div class="section-kicker">JORNADA COMPLETA</div><h3>365 dias de aprendizado</h3><p>Você chegou à última etapa. Volte aos estudos, mantenha seu caderno e continue crescendo na Palavra.</p></article>`}`;
 $('#studyContent').innerHTML=html;
 window.DevocionalBible?.renderStudyPassage?.();
 $('#favoriteStudy').addEventListener('click',()=>{data.favorites=fav?data.favorites.filter(x=>x!==selectedDay):uniqueDays([...data.favorites,selectedDay]);persist();renderStudy()});
 $('#openJournal').addEventListener('click',()=>showTab('journal'));
 $$('[data-task]').forEach(el=>el.addEventListener('change',()=>{data.checklistByDay[selectedDay]={...(data.checklistByDay[selectedDay]||{}),[el.dataset.task]:el.checked};persist()}));
 $('#completeBtn').addEventListener('click',()=>{
   data.completed=completed?data.completed.filter(x=>x!==selectedDay):uniqueDays([...data.completed,selectedDay]);
   persist();renderStudy();renderProgress();
   $('#completeMsg').textContent=completed?'Você pode retomar o estudo quando quiser.':'Estudo marcado como concluído. Continue sua caminhada!';
 });
 if(next)$('#nextFromCard').addEventListener('click',()=>selectDay(selectedDay+1,{scroll:true}));
}
function renderJournal(){
 if(!studies.length)return;
 const s=study(selectedDay);$('#journalContext').textContent=`Dia ${d(selectedDay)} — ${s.title} · ${s.reference}`;
 $('#notes').value=data.notesByDay[selectedDay]||'';
 $('#savedMsg').textContent='';
}
function storeNotes(){data.notesByDay[selectedDay]=$('#notes').value;const okay=persist();$('#savedMsg').textContent=okay?'Anotações deste dia salvas neste aparelho.':'Não foi possível salvar. Exporte uma cópia de segurança.';return okay}
function renderVerses(){
 const ul=$('#verseList');ul.replaceChildren();
 if(!data.verses.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Você ainda não adicionou referências favoritas.';ul.replaceWith(ul);const li=document.createElement('li');li.textContent=p.textContent;ul.append(li);return}
 data.verses.forEach((v,i)=>{const li=document.createElement('li');li.append(document.createTextNode(v+' '));const b=document.createElement('button');b.type='button';b.textContent='Remover';b.setAttribute('aria-label','Remover '+v);b.addEventListener('click',()=>{data.verses.splice(i,1);persist();renderVerses()});li.append(b);ul.append(li)})
}
function renderFavorites(){
 const target=$('#favoriteDays');target.replaceChildren();
 if(!data.favorites.length){target.innerHTML='<p class="empty-state">Nenhum estudo favorito por enquanto. Em um estudo, toque em ☆ Adicionar aos favoritos.</p>'}
 else data.favorites.forEach(n=>target.append(makeStudyRow(study(n))));
 renderVerses();
}
function makeStudyRow(s){
 const root=document.createElement('div');root.className='study-row';
 const info=document.createElement('div');info.className='data';
 const b=document.createElement('button');b.type='button';b.textContent=`Dia ${d(s.day)} · ${s.title}`;b.addEventListener('click',()=>selectDay(s.day,{scroll:true}));
 const sm=document.createElement('small');sm.textContent=`${s.theme} · ${s.reference}`;
 info.append(b,sm);root.append(info);
 const state=document.createElement('span');state.className='state';state.textContent=data.completed.includes(s.day)?'✓ Lido':data.favorites.includes(s.day)?'★':'›';root.append(state);
 return root;
}
function renderLibrary(){
 if(!studies.length)return;
 const query=$('#searchStudies').value.trim().toLocaleLowerCase('pt-BR');
 const wk=$('#weekFilter').value;
 const visible=studies.filter(s=>(wk==='all'||String(s.week)===wk)&&(!query||[s.title,s.reference,s.theme,s.insight].join(' ').toLocaleLowerCase('pt-BR').includes(query)));
 $('#resultsCount').textContent=`${visible.length} de 365 estudos encontrados`;
 const target=$('#studyList');const frag=document.createDocumentFragment();visible.forEach(s=>frag.append(makeStudyRow(s)));target.replaceChildren(frag);
 if(!visible.length)target.innerHTML='<p class="empty-state">Nenhum estudo encontrado. Tente outro termo ou limpe o filtro.</p>';
}
function renderProgress(){
 const n=data.completed.length;
 $('#topDone').textContent=String(n);$('#doneCount').textContent=String(n);$('#donePercent').textContent=(100*n/365).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
 $('#progressBar').style.width=(100*n/365)+'%';$('#progressTrack').setAttribute('aria-valuenow',String(n));
 $('#progressCaption').textContent=n===365?'Jornada concluída! Que a Palavra continue a orientar seus dias.':`Faltam ${365-n} estudos para concluir o plano de 365 dias. Você pode seguir no seu ritmo.`;
 const root=$('#monthlyStats');root.replaceChildren();const frag=document.createDocumentFragment();
 for(let block=0;block<13;block++){
   const start=block*28+1;const end=Math.min(365,start+27);
   if(start>365)break;
   const count=data.completed.filter(x=>x>=start&&x<=end).length;
   const el=document.createElement('div');el.className='month-stat';const b=document.createElement('b');b.textContent=`Etapa ${block+1}`;const s=document.createElement('span');s.textContent=`${count}/${end-start+1} estudos`;el.append(b,s);frag.append(el);
 }
 root.append(frag);
}
function exportBackup(){
 const payload={app:'Meu Devocional',exportedAt:new Date().toISOString(),data:normalizeData(data)};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`meu-devocional-backup-${new Date().toISOString().slice(0,10)}.json`;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 $('#backupMsg').textContent='Cópia preparada. Guarde o arquivo em um lugar seguro: ele poderá conter suas anotações pessoais.';
}
async function importBackup(file){
 if(!file)return;
 if(file.size>5*1024*1024){$('#backupMsg').textContent='Este arquivo é grande demais para um backup do aplicativo.';return}
 let parsed;try{parsed=JSON.parse(await file.text())}catch(_){$('#backupMsg').textContent='O arquivo selecionado não é um JSON válido.';return}
 if(parsed?.app!=='Meu Devocional'||!parsed.data||!Array.isArray(parsed.data.completed)||!parsed.data.notesByDay){$('#backupMsg').textContent='Este arquivo não parece ser um backup válido do Meu Devocional.';return}
 const confirmed=confirm('Restaurar esta cópia substituirá as anotações, favoritos e progresso deste aparelho. Deseja continuar?');
 if(!confirmed){$('#backupMsg').textContent='Restauração cancelada. Seus registros não foram alterados.';return}
 data=normalizeData(parsed.data);persist();selectedDay=data.lastDay;window.DevocionalAudio?.setDay?.(selectedDay);
 window.DevocionalCharon?.setDay?.(selectedDay);$('#daySelect').value=String(selectedDay);renderStudy();renderJournal();renderFavorites();renderProgress();
 $('#backupMsg').textContent='Cópia restaurada com sucesso. Confira seus registros.';
}

// Os avisos de longo prazo são agendados no calendário do usuário, não por timers do navegador.
function localIsoDate(date){
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function formatLocalDate(date){return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric'}).format(date)}
function reminderConfig(){
 const time=$('#reminderTime').value;
 const start=$('#reminderStart').value;
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!/^\d{4}-\d{2}-\d{2}$/.test(start))return null;
 const [year,month,day]=start.split('-').map(Number);
 const [hours,minutes]=time.split(':').map(Number);
 const date=new Date(year,month-1,day,hours,minutes,0,0);
 if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
 const end=new Date(date.getTime()+15*60000);
 const last=new Date(date);last.setDate(last.getDate()+364);
 return {date,end,last,time,start,hours,minutes};
}
function storedReminder(){try{return JSON.parse(localStorage.getItem(REMINDER_PREFS_KEY))}catch(_){return null}}
function saveReminderPreferences(){
 try{localStorage.setItem(REMINDER_PREFS_KEY,JSON.stringify({time:$('#reminderTime').value,start:$('#reminderStart').value}))}catch(_){/* as opções ainda funcionam sem armazenamento */}
}
function initReminders(){
 const now=new Date();
 const stored=storedReminder();
 const time=stored&&/^([01]\d|2[0-3]):[0-5]\d$/.test(stored.time)?stored.time:'08:00';
 let start=stored&&/^\d{4}-\d{2}-\d{2}$/.test(stored.start)?stored.start:null;
 if(!start){const tomorrow=new Date(now);tomorrow.setHours(0,0,0,0);
   if(now.getHours()*60+now.getMinutes()>=Number(time.slice(0,2))*60+Number(time.slice(3)))tomorrow.setDate(tomorrow.getDate()+1);
   start=localIsoDate(tomorrow);
 }
 $('#reminderTime').value=time;
 $('#reminderStart').value=start;
 $('#reminderTime').addEventListener('change',updateReminderPreview);
 $('#reminderStart').addEventListener('change',updateReminderPreview);
 $('#downloadReminder').addEventListener('click',downloadCalendarReminder);
 updateReminderPreview();
}
function calendarTime(date){return localIsoDate(date).replace(/-/g,'')+'T'+String(date.getHours()).padStart(2,'0')+String(date.getMinutes()).padStart(2,'0')+'00'}
function calendarGoogleUrl(config){
 const p=new URLSearchParams();
 p.set('action','TEMPLATE');
 p.set('text','Meu Devocional | Leitura e oração');
 p.set('dates',calendarTime(config.date)+'/'+calendarTime(config.end));
 p.set('ctz',Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo');
 p.set('recur','RRULE:FREQ=DAILY;COUNT=365');
 p.set('details','Separe 15 minutos para o seu devocional bíblico diário. Abra o Meu Devocional: '+DEVOTIONAL_URL+'\n\nConfira a notificação no início do evento e a repetição diária antes de salvar.');
 return 'https://calendar.google.com/calendar/render?'+p.toString();
}
function updateReminderPreview(){
 const config=reminderConfig();
 const preview=$('#reminderPreview');const link=$('#googleReminderLink');
 if(!config){preview.classList.add('error');preview.textContent='Selecione uma data e um horário válidos.';link.removeAttribute('href');link.setAttribute('aria-disabled','true');return}
 if(config.date.getTime()<Date.now()-60000){preview.classList.add('error');preview.textContent='Essa data e horário já passaram. Escolha um horário futuro.';link.removeAttribute('href');link.setAttribute('aria-disabled','true');return}
 preview.classList.remove('error');
 const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'horário local';
 preview.textContent=`Todos os dias às ${config.time}, de ${formatLocalDate(config.date)} até ${formatLocalDate(config.last)} (365 ocorrências previstas; salve no calendário para ativar). Fuso do dispositivo: ${tz}.`;
 link.href=calendarGoogleUrl(config);link.removeAttribute('aria-disabled');
 saveReminderPreferences();
}
function icsEscape(text){return String(text).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function icsUtc(date){return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}
function foldIcsLine(value){
 // Evita linhas extensas e preserva os caracteres Unicode em UTF-8.
 const chars=Array.from(value);const result=[];let line='';let bytes=0;
 for(const ch of chars){const size=new TextEncoder().encode(ch).length;if(bytes+size>73){result.push(line);line=' ';bytes=1}line+=ch;bytes+=size}
 result.push(line);return result.join('\r\n');
}
function makeIcsReminder(config){
 const uid='meu-devocional-'+config.start.replace(/-/g,'')+'-'+config.time.replace(':','')+'@d-oliveira97.github.io';
 const lines=[
  'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Meu Devocional//Lembretes 2.2//PT-BR',
  'CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT','UID:'+uid,
  'DTSTAMP:'+icsUtc(new Date()),
  'DTSTART:'+icsUtc(config.date),'DTEND:'+icsUtc(config.end),
  'RRULE:FREQ=DAILY;COUNT=365',
  'SUMMARY:'+icsEscape('Meu Devocional - leitura e oração'),
  'DESCRIPTION:'+icsEscape('Estude a Palavra por 15 minutos. Abra '+DEVOTIONAL_URL),
  'URL:'+DEVOTIONAL_URL,
  'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEscape('Hora do Meu Devocional'),
  'TRIGGER:PT0S','END:VALARM','END:VEVENT','END:VCALENDAR'
 ];
 return lines.map(foldIcsLine).join('\r\n')+'\r\n';
}
function downloadCalendarReminder(){
 const config=reminderConfig();
 if(!config||config.date.getTime()<Date.now()-60000){updateReminderPreview();$('#reminderMessage').textContent='Escolha uma data e um horário futuros antes de baixar.';return}
 const blob=new Blob([makeIcsReminder(config)],{type:'text/calendar;charset=utf-8'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');
 link.href=url;link.download='meu-devocional-lembrete-365-dias.ics';document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
 $('#reminderMessage').textContent='Arquivo .ics preparado. Importe-o na sua agenda e confira se os avisos estão ativados. Somente baixar não agenda o lembrete.';
}

async function init(){
 initReminders();
 $('#reminderShortcut').addEventListener('click',()=>{showTab('reminders');$('#reminders').scrollIntoView({behavior:'smooth',block:'start'})});
 $('#today').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
 $$('.tab').forEach(btn=>btn.addEventListener('click',()=>showTab(btn.dataset.tab)));
 $('#prevDay').addEventListener('click',()=>selectDay(selectedDay-1,{scroll:true}));
 $('#nextDay').addEventListener('click',()=>selectDay(selectedDay+1,{scroll:true}));
 $('#daySelect').addEventListener('change',e=>selectDay(e.target.value));
 $('#goToday').addEventListener('click',()=>selectDay(todaysPlanDay(),{scroll:true}));
 $('#saveNotes').addEventListener('click',storeNotes);
 $('#notes').addEventListener('input',storeNotes);
 $('#searchStudies').addEventListener('input',renderLibrary);
 $('#weekFilter').addEventListener('change',renderLibrary);
 $('#addVerse').addEventListener('click',()=>{const v=$('#verseInput').value.trim();if(!v)return;if(v.length>200){alertUser('Use uma referência mais curta.','error');return}data.verses.push(v);$('#verseInput').value='';persist();renderVerses()});
 $('#verseInput').addEventListener('keydown',e=>{if(e.key==='Enter'){$('#addVerse').click();e.preventDefault()}});
 $('#exportData').addEventListener('click',exportBackup);
 $('#importData').addEventListener('click',()=>$('#importFile').click());
 $('#importFile').addEventListener('change',async e=>{await importBackup(e.target.files[0]);e.target.value=''});
 $('#installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').classList.add('hidden')});
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').classList.remove('hidden')});
 if('serviceWorker' in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
 try{
   const response=await fetch('./studies.json');if(!response.ok)throw Error('HTTP '+response.status);
   const records=await response.json();if(!Array.isArray(records)||records.length!==365||records.some((r,i)=>r.day!==i+1))throw Error('Dados de estudo incompletos');
   studies=records;
 }catch(error){
   $('#studyContent').innerHTML='<article class="card"><h2>Não foi possível carregar os estudos</h2><p>Verifique sua conexão e recarregue a página. Para usar offline, abra o aplicativo ao menos uma vez com internet após a atualização.</p></article>';
   alertUser('Falha ao carregar os estudos: '+error.message,'error');return;
 }
 const daySelector=$('#daySelect');const options=document.createDocumentFragment();studies.forEach(s=>{const o=document.createElement('option');o.value=s.day;o.textContent=`${d(s.day)} · ${s.title}`;options.append(o)});daySelector.append(options);
 const filter=$('#weekFilter');const weeks=new Map(studies.map(s=>[s.week,s.theme]));weeks.forEach((title,week)=>{const opt=document.createElement('option');opt.value=week;opt.textContent=week===53?'Encerramento · Dia 365':`Semana ${String(week).padStart(2,'0')} · ${title}`;filter.append(opt)});
 const first=Object.keys(data.notesByDay).length||data.completed.length||data.favorites.length?data.lastDay:todaysPlanDay();
 selectDay(first,{switchTab:false});showTab('study');
}
document.addEventListener('DOMContentLoaded',init);
