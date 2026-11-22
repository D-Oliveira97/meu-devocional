const $=s=>document.querySelector(s);
const storageKey='meuDevocional.v1';
let data={...(JSON.parse(localStorage.getItem(storageKey)||'{}'))};
const persist=()=>localStorage.setItem(storageKey,JSON.stringify(data));
$('#today').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
 document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));
 document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('hidden',x.id!==btn.dataset.tab));
}));
const tasks=[...document.querySelectorAll('[data-task]')];
tasks.forEach(t=>{t.checked=!!data.tasks?.[t.dataset.task];t.addEventListener('change',()=>{data.tasks={...data.tasks,[t.dataset.task]:t.checked};persist();}});
);
function renderProgress(){const done=!!data.day1Done;$('#doneCount').textContent=done?'1':'0';$('#progressBar').style.width=done?'100%':'0%';}
$('#completeBtn').addEventListener('click',()=>{data.day1Done=true;persist();renderProgress();$('#completeMsg').textContent='Estudo do Dia 01 marcado como concluído. Que bom caminhar com constância!';});
$('#resetProgress').addEventListener('click',()=>{data.day1Done=false;data.tasks={};persist();tasks.forEach(t=>t.checked=false);renderProgress();$('#completeMsg').textContent='';});
$('#notes').value=data.notes||'';
$('#saveNotes').addEventListener('click',()=>{data.notes=$('#notes').value;persist();$('#savedMsg').textContent='Anotações salvas neste aparelho.';});
function renderVerses(){const ul=$('#verseList');ul.innerHTML='';(data.verses||[]).forEach((v,i)=>{const li=document.createElement('li');li.textContent=v;const b=document.createElement('button');b.textContent='Remover';b.addEventListener('click',()=>{data.verses.splice(i,1);persist();renderVerses();});li.append(' ',b);ul.append(li);});}
$('#addVerse').addEventListener('click',()=>{const v=$('#verseInput').value.trim();if(!v)return;data.verses=[...(data.verses||[]),v];$('#verseInput').value='';persist();renderVerses();});
renderVerses();renderProgress();
let deferredPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').classList.remove('hidden');});
$('#installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').classList.add('hidden');});
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
