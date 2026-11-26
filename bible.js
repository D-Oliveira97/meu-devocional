/* Meu Devocional 2.5 · Leitor local protestante da Biblica Open Nova Bíblia Viva (CC BY-SA 4.0)
 * A tradução NÃO está embutida neste pacote: o usuário importa o ZIP oficial da Biblica/eBible uma vez.
 * O texto dos versículos é preservado; marcadores de diagramação USFM e notas editoriais não são exibidos.
 */
'use strict';
(function(){
const BIBLE_SOURCE='https://ebible.org/Scriptures/poronbv_usfm.zip';
const DB_NAME='meuDevocional.onbv.v1';
const BOOKS=[
 ['GEN','Gênesis',50],['EXO','Êxodo',40],['LEV','Levítico',27],['NUM','Números',36],['DEU','Deuteronômio',34],
 ['JOS','Josué',24],['JDG','Juízes',21],['RUT','Rute',4],['1SA','1 Samuel',31],['2SA','2 Samuel',24],
 ['1KI','1 Reis',22],['2KI','2 Reis',25],['1CH','1 Crônicas',29],['2CH','2 Crônicas',36],['EZR','Esdras',10],
 ['NEH','Neemias',13],['EST','Ester',10],['JOB','Jó',42],['PSA','Salmos',150],['PRO','Provérbios',31],
 ['ECC','Eclesiastes',12],['SNG','Cântico dos Cânticos',8],['ISA','Isaías',66],['JER','Jeremias',52],['LAM','Lamentações',5],
 ['EZK','Ezequiel',48],['DAN','Daniel',12],['HOS','Oséias',14],['JOL','Joel',3],['AMO','Amós',9],
 ['OBA','Obadias',1],['JON','Jonas',4],['MIC','Miquéias',7],['NAM','Naum',3],['HAB','Habacuque',3],
 ['ZEP','Sofonias',3],['HAG','Ageu',2],['ZEC','Zacarias',14],['MAL','Malaquias',4],
 ['MAT','Mateus',28],['MRK','Marcos',16],['LUK','Lucas',24],['JHN','João',21],['ACT','Atos',28],
 ['ROM','Romanos',16],['1CO','1 Coríntios',16],['2CO','2 Coríntios',13],['GAL','Gálatas',6],['EPH','Efésios',6],
 ['PHP','Filipenses',4],['COL','Colossenses',4],['1TH','1 Tessalonicenses',5],['2TH','2 Tessalonicenses',3],
 ['1TI','1 Timóteo',6],['2TI','2 Timóteo',4],['TIT','Tito',3],['PHM','Filemom',1],['HEB','Hebreus',13],
 ['JAS','Tiago',5],['1PE','1 Pedro',5],['2PE','2 Pedro',3],['1JN','1 João',5],['2JN','2 João',1],
 ['3JN','3 João',1],['JUD','Judas',1],['REV','Apocalipse',22]
];
// Lista fechada do cânon protestante. Nenhum arquivo adicional do ZIP é aceito.
const OT_COUNT=39, NT_COUNT=27;
if(BOOKS.length!==OT_COUNT+NT_COUNT || BOOKS.slice(0,OT_COUNT).reduce((n,b)=>n+b[2],0)!==929 || BOOKS.slice(OT_COUNT).reduce((n,b)=>n+b[2],0)!==260){
 throw Error('A lista de livros protestantes está inconsistente.');
}
const aliases={"salmo":"PSA","salmos":"PSA","cantares":"SNG","cantico dos canticos":"SNG","cânticos":"SNG","oseias":"HOS","miqueias":"MIC","filemom":"PHM","apocalipse":"REV","revelacao":"REV"};
const byCode=new Map(BOOKS.map(b=>[b[0],b]));
function norm(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
for(const b of BOOKS)aliases[norm(b[1])]=b[0];
const el=id=>document.getElementById(id);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
let dbPromise=null,installed=false,readingBook='GEN',readingChapter=1,readingVerse=1,lastStudyRequest=0,importing=false,pickerTestament='OT',pickerStage='book';
function db(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error('Armazenamento de Bíblia não disponível neste navegador.'));return}
  const r=indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('chapters'))d.createObjectStore('chapters',{keyPath:'key'});if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'key'})};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Não foi possível acessar o banco local.'));
 });return dbPromise;
}
async function get(key,store='chapters'){
 const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction(store,'readonly'),r=t.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});
}
async function saveAll(records){
 const d=await db();return new Promise((resolve,reject)=>{
  const tx=d.transaction(['chapters','meta'],'readwrite');tx.onerror=()=>reject(tx.error||Error('Falha ao salvar a Bíblia.'));
  tx.oncomplete=()=>resolve();const verses=tx.objectStore('chapters');verses.clear();
  records.filter(v=>byCode.has(v.book)&&Number.isInteger(v.chapter)&&v.chapter>=1&&v.chapter<=byCode.get(v.book)[2]).forEach(v=>verses.put(v));tx.objectStore('meta').put({key:'ready',books:66,chapters:1189,date:new Date().toISOString(),edition:'poronbv',source:BIBLE_SOURCE});
 });
}
function textClean(s){
 return String(s||'')
 .replace(/\\(?:f|fe|x)\s[\s\S]*?\\(?:f|fe|x)\*/g,' ') // notas e referências cruzadas USFM
 .replace(/\\fig\s[\s\S]*?\\fig\*/g,' ')
 .replace(/\\(?:s\d*|ms\d*|sr|r|d|cl|sp|qa|mr)\s+[^\r\n]*/g,' ')
 .replace(/\\w\s+([^|\\]+)\|[^\\]*?\\w\*/g,'$1')
 .replace(/\\zaln-s\s+[^\\]*?\\\*/g,'')
 .replace(/\\[+a-zA-Z][a-zA-Z0-9+_-]*\*?(?:\s+|$)/g,' ')
 .replace(/\|[A-Za-z0-9_="' -]+(?=\s|$)/g,' ')
 .replace(/\s+/g,' ').trim();
}
function parseUsfm(source){
 const txt=String(source||'').replace(/\r\n?/g,'\n');
 const id=txt.match(/\\id\s+([A-Z0-9]{3})\b/i);if(!id)return null;
 const code=id[1].toUpperCase();if(!byCode.has(code))return null;
 const chapters=[];
 // Marca os inícios de capítulos/versículos independentemente das quebras de linha.
 const events=[...txt.matchAll(/\\(c|v)\s+([0-9]+(?:[a-z]|[-–][0-9]+)?)/gi)];
 let chapter=0,rows=[];
 const commit=()=>{if(chapter&&rows.length)chapters.push({key:code+':'+chapter,book:code,chapter,verses:rows})};
 for(let i=0;i<events.length;i++){
  const e=events[i],kind=e[1].toLowerCase(),number=e[2];
  if(kind==='c'){commit();chapter=Number(number);rows=[];continue}
  if(!chapter)continue;
  const end=i+1<events.length?events[i+1].index:txt.length;
  const text=textClean(txt.slice(e.index+e[0].length,end));
  if(text){const numberInt=parseInt(number,10);if(numberInt>0&&numberInt<200)rows.push({n:numberInt,t:text})}
 }
 commit();return {code,chapters};
}
function status(text,type='info'){
 const field=el('bibleImportStatus');if(field){field.textContent=text;field.dataset.type=type}const card=field?.closest('.bible-hero');if(card)card.classList.toggle('hidden',installed&&type!=='error');
}
function updated(){
 installed=true;
 el('bibleInstall').classList.add('hidden');el('bibleReady').classList.remove('hidden');
 el('bibleAvailable').textContent='39 livros do Antigo + 27 do Novo Testamento · 1.189 capítulos';
}
async function loadZip(buffer,filename){
 if(importing)return;importing=true;
 el('bibleImport').disabled=true;el('bibleAuto').disabled=true;
 try{
  if(!window.JSZip)throw Error('Leitor ZIP indisponível. Atualize a página e tente novamente.');
  status('Conferindo o arquivo oficial e preparando os capítulos...');
  const zip=await window.JSZip.loadAsync(buffer,{checkCRC32:true,createFolders:false});
  const entries=Object.values(zip.files).filter(f=>!f.dir&&/\.(?:usfm|sfm|txt)$/i.test(f.name));
  if(entries.length<66)throw Error('O ZIP não contém os 66 arquivos USFM esperados. Baixe o arquivo poronbv_usfm.zip no site oficial.');
  let size=0;const parsed=new Map();
  for(const f of entries){
   const sz=f._data?.uncompressedSize||0;size+=sz;
   if(sz>4*1024*1024||size>25*1024*1024)throw Error('O conteúdo descompactado excede o limite permitido.');
   const part=parseUsfm(await f.async('string'));
   if(part)parsed.set(part.code,part.chapters);
  }
  const count=[...parsed.values()].reduce((sum,ch)=>sum+ch.length,0);
  const records=[...parsed.values()].flat();
  const verseCount=records.reduce((n,c)=>n+c.verses.length,0);
  const canonOk=BOOKS.every(([code,,expected])=>parsed.has(code)&&parsed.get(code).length===expected&&
   parsed.get(code).every((entry,i)=>entry.chapter===i+1));
  if(parsed.size!==66||count!==1189||verseCount<28000||!canonOk)throw Error(`Arquivo não passou na conferência canônica: ${parsed.size}/66 livros, ${count}/1189 capítulos, ${verseCount} versículos. Confira se é a ONBV USFM oficial.`);
  status('Salvando 1.189 capítulos no celular. Não feche esta tela...');
  await saveAll(records);updated();
  status(`Importação concluída: 66 livros, 1.189 capítulos e ${verseCount.toLocaleString('pt-BR')} versículos. Leitura offline pronta.`, 'ok');
  await renderChapter();await renderStudyPassage();
  try{await navigator.storage?.persist?.()}catch(_){}
 }catch(e){status('Não foi possível importar: '+e.message,'error')}
 finally{importing=false;el('bibleImport').disabled=false;el('bibleAuto').disabled=false;el('bibleFile').value=''}
}
async function importFile(file){if(!file)return;if(file.size>35*1024*1024){status('ZIP muito grande; escolha o poronbv_usfm.zip oficial.','error');return}
 await loadZip(await file.arrayBuffer(),file.name);
}
async function autoImport(){
 status('Tentando baixar a ONBV diretamente do distribuidor oficial...');
 try{
  const response=await fetch(BIBLE_SOURCE,{mode:'cors'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const size=Number(response.headers.get('Content-Length')||0);if(size>35*1024*1024)throw Error('Arquivo muito grande');
  await loadZip(await response.arrayBuffer(),'poronbv_usfm.zip');
 }catch(e){status('O navegador não permitiu o download automático. Use “Baixar ZIP oficial”, depois “Importar ZIP baixado”. Seus dados foram preservados.','error')}
}
function subref(text,lastBook){
 let value=String(text||'').trim().replace(/[—−]/g,'–');
 const named=value.match(/^(.*?)\s+(\d+\s*(?::\s*\d+)?\s*(?:[–-]\s*\d+\s*(?::\s*\d+)?)?)$/u);
 let code=null,ref='';
 if(named){const name=norm(named[1]);code=aliases[name]||null;ref=named[2].replace(/\s+/g,'')}
 if(!code){code=lastBook;ref=value.replace(/\s+/g,'')}
 if(!code||!byCode.has(code))return null;
 const info=byCode.get(code),single=info[2]===1;
 let match=ref.match(/^(\d+):(\d+)(?:[–-](?:(\d+):)?(\d+))?$/u);
 if(match){const ch1=Number(match[1]),v1=Number(match[2]),ch2=match[3]?Number(match[3]):ch1,v2=match[4]?Number(match[4]):v1;
  return {book:code,startChapter:ch1,endChapter:ch2,startVerse:v1,endVerse:v2};}
 match=ref.match(/^(\d+)[–-](\d+)$/);
 if(match&&single)return {book:code,startChapter:1,endChapter:1,startVerse:Number(match[1]),endVerse:Number(match[2])};
 if(match)return {book:code,startChapter:Number(match[1]),endChapter:Number(match[2]),startVerse:1,endVerse:999};
 match=ref.match(/^(\d+)$/);
 if(match){const n=Number(match[1]);return {book:code,startChapter:single?1:n,endChapter:single?1:n,startVerse:single?n:1,endVerse:999}}
 return null;
}
function parseReference(ref){
 let book=null;const seg=[];
 for(const piece of String(ref).split(/\s*;\s*/)){
  const val=subref(piece,book);if(!val)continue;book=val.book;
  if(val.endChapter-val.startChapter>6||val.startChapter>150||val.endChapter<val.startChapter)continue;
  seg.push(val);
 }return seg;
}
async function loadPassage(reference){
 if(!installed)return null;
 const parsed=parseReference(reference);if(!parsed.length)return null;
 const blocks=[];
 for(const part of parsed){
  const name=byCode.get(part.book)[1],lines=[];
  for(let ch=part.startChapter;ch<=part.endChapter;ch++){
   const item=await get(part.book+':'+ch);if(!item)continue;
   const from=ch===part.startChapter?part.startVerse:1;
   const to=ch===part.endChapter?part.endVerse:999;
   const verses=item.verses.filter(v=>v.n>=from&&v.n<=to);
   if(verses.length)lines.push({chapter:ch,verses});
  }
  if(lines.length)blocks.push({name,lines});
 }
 return blocks;
}
function versesHtml(blocks){
 return blocks.map(b=>b.lines.map(ch=>`<section class="onbv-chapter"><h4>${esc(b.name)} ${ch.chapter}</h4>${ch.verses.map(v=>`<p class="onbv-verse" id="verse-${ch.chapter}-${v.n}"><sup>${v.n}</sup> ${esc(v.t)}</p>`).join('')}</section>`).join('')).join('');
}
function speechParts(blocks){
 const out=[];
 for(const b of blocks)for(const ch of b.lines){
  out.push({label:`${b.name} ${ch.chapter}`,text:`${b.name}, capítulo ${ch.chapter}.`});
  for(const v of ch.verses)out.push({label:`${b.name} ${ch.chapter}:${v.n}`,text:`Versículo ${v.n}. ${v.t}`});
 }return out;
}
async function playPassage(withStudy){
 const s=window.DevocionalAudio?.study?.(window.DevocionalAudio?.selectedDay?.());
 if(!s)return;
 const blocks=await loadPassage(s.reference);
 if(!blocks?.length){openReader();status('Importe primeiro o ZIP oficial para ouvir a passagem.','error');return}
 window.DevocionalAudio?.playBibleParts?.(speechParts(blocks),!!withStudy);
}
async function playChapter(){
 if(!installed){status('Importe a ONBV para ouvir os capítulos.','error');return}
 const book=byCode.get(readingBook)[1];const value=await get(readingBook+':'+readingChapter);
 if(!value){status('Capítulo indisponível. Tente importar o arquivo oficial novamente.','error');return}
 window.DevocionalAudio?.playBibleParts?.(speechParts([{name:book,lines:[value]}]),false);
}
async function renderStudyPassage(){
 const holder=el('bibleStudyContent');if(!holder)return;
 const token=++lastStudyRequest;
 const current=window.DevocionalAudio?.study?.(window.DevocionalAudio?.selectedDay?.());if(!current)return;
 if(!installed){holder.innerHTML=`<p>Para ler <strong>${esc(current.reference)}</strong> diretamente aqui, importe uma vez a Bíblia ONBV na aba <strong>📘 Bíblia</strong>.</p><button class="primary" type="button" id="openBibleImport">📘 Preparar Bíblia completa</button>`;
  el('openBibleImport').addEventListener('click',openReader);return;
 }
 holder.textContent='Carregando a passagem...';
 try{const blocks=await loadPassage(current.reference);if(token!==lastStudyRequest)return;
  if(!blocks?.length){holder.innerHTML=`<p>Não foi possível localizar automaticamente a passagem ${esc(current.reference)} na edição importada.</p>`;return}
  holder.innerHTML=`<div class="bible-reading-tools"><button type="button" class="outline" id="passageListen">🔊 Ouvir passagem</button><button type="button" class="outline" id="passageChapter">📘 Abrir na Bíblia</button></div><div class="onbv-verses">${versesHtml(blocks)}</div>`;
  el('passageListen').addEventListener('click',()=>playPassage(false));
  el('passageChapter').addEventListener('click',()=>{const first=parseReference(current.reference)[0];if(first){readingBook=first.book;readingChapter=first.startChapter;updateSelectors();openReader()}});
 }catch(e){holder.textContent='Não foi possível abrir a passagem: '+e.message}
}
async function renderChapter(){
 const area=el('bibleChapter'),title=el('bibleChapterTitle');if(!area)return;
 const b=byCode.get(readingBook);title.textContent=b[1]+' '+readingChapter;
 el('biblePrev').disabled=readingBook===BOOKS[0][0]&&readingChapter===1;
 el('bibleNext').disabled=readingBook===BOOKS[65][0]&&readingChapter===22;
 if(!installed){area.innerHTML='<p>Importe a Bíblia ONBV para consultar qualquer livro e capítulo neste espaço, mesmo offline.</p>';return}
 try{const item=await get(readingBook+':'+readingChapter);if(item){area.innerHTML=versesHtml([{name:b[1],lines:[item]}]);renderVerseGrid(item.verses);if(readingVerse>1){const target=area.querySelector('[id="verse-'+readingChapter+'-'+readingVerse+'"]');target?.scrollIntoView({block:'nearest'});target?.classList.add('selected-verse')}}else area.textContent='Capítulo não encontrado na Bíblia importada.'}
 catch(e){area.textContent='Erro ao carregar capítulo: '+e.message}
}
function updateSelectors(){
 const b=byCode.get(readingBook);el('bibleBook').value=readingBook;
 const chapter=el('bibleChapterSelect');chapter.replaceChildren();
 for(let i=1;i<=b[2];i++){const opt=new Option('Capítulo '+i,String(i));chapter.add(opt)}
 readingChapter=Math.min(b[2],Math.max(1,readingChapter));chapter.value=readingChapter;renderPicker();
}
function stepChapter(direction){
 const b=byCode.get(readingBook),idx=BOOKS.findIndex(x=>x[0]===readingBook);
 if(direction===1){if(readingChapter<b[2])readingChapter++;else if(idx<BOOKS.length-1){readingBook=BOOKS[idx+1][0];readingChapter=1}}
 else{if(readingChapter>1)readingChapter--;else if(idx>0){readingBook=BOOKS[idx-1][0];readingChapter=BOOKS[idx-1][2]}}
 readingVerse=1;updateSelectors();renderChapter();el('bible').scrollIntoView({behavior:'smooth',block:'start'});
}
function openReader(){if(typeof showTab==='function')showTab('bible');renderChapter();}
function setPickerStage(stage){pickerStage=stage;document.querySelectorAll('[data-picker-stage]').forEach(b=>{b.classList.toggle('active',b.dataset.pickerStage===stage);b.setAttribute('aria-selected',String(b.dataset.pickerStage===stage))});for(const [name,cl] of [['book','.picker-books'],['chapter','.picker-chapters'],['verse','.picker-verses']])document.querySelector(cl)?.classList.toggle('hidden',stage!==name)}
function renderVerseGrid(verses){const grid=el('verseGrid');if(!grid)return;grid.replaceChildren();for(const v of verses){const button=document.createElement('button');button.type='button';button.className='picker-tile'+(Number(v.n)===readingVerse?' selected':'');button.textContent=v.n;button.setAttribute('aria-label','Versículo '+v.n);button.addEventListener('click',()=>{readingVerse=Number(v.n);renderChapter()});grid.append(button)}}
function renderPicker(){const books=el('bookGrid'),chapters=el('chapterGrid');if(!books||!chapters)return;books.replaceChildren();chapters.replaceChildren();el('pickerOT').classList.toggle('picker-active',pickerTestament==='OT');el('pickerNT').classList.toggle('picker-active',pickerTestament==='NT');
 const abbr=['Gn','Êx','Lv','Nm','Dt','Js','Jz','Rt','1Sm','2Sm','1Rs','2Rs','1Cr','2Cr','Ed','Ne','Et','Jó','Sl','Pv','Ec','Ct','Is','Jr','Lm','Ez','Dn','Os','Jl','Am','Ob','Jn','Mq','Na','Hc','Sf','Ag','Zc','Ml','Mt','Mc','Lc','Jo','At','Rm','1Co','2Co','Gl','Ef','Fp','Cl','1Ts','2Ts','1Tm','2Tm','Tt','Fm','Hb','Tg','1Pe','2Pe','1Jo','2Jo','3Jo','Jd','Ap'];
 BOOKS.forEach(([code,name],i)=>{if((i<39)!==(pickerTestament==='OT'))return;const button=document.createElement('button');button.type='button';button.className='picker-tile'+(readingBook===code?' selected':'');button.textContent=abbr[i];button.title=name;button.setAttribute('aria-label',name);button.addEventListener('click',()=>{readingBook=code;readingChapter=1;readingVerse=1;updateSelectors();renderChapter();setPickerStage('chapter')});books.append(button)});
 for(let i=1;i<=byCode.get(readingBook)[2];i++){const button=document.createElement('button');button.type='button';button.className='picker-tile'+(readingChapter===i?' selected':'');button.textContent=i;button.addEventListener('click',()=>{readingChapter=i;readingVerse=1;updateSelectors();renderChapter();setPickerStage('verse')});chapters.append(button)}
}
function openReference(reference){window.DevocionalCharon?.pause?.();window.DevocionalAudio?.pause?.();const parts=parseReference(reference);if(!parts.length)return false;readingBook=parts[0].book;readingChapter=parts[0].startChapter;readingVerse=parts[0].startVerse||1;pickerTestament=BOOKS.findIndex(b=>b[0]===readingBook)<39?'OT':'NT';updateSelectors();setPickerStage('verse');openReader();return true}
function initialize(){
 document.querySelectorAll('[data-picker-stage]').forEach(button=>button.addEventListener('click',()=>setPickerStage(button.dataset.pickerStage)));setPickerStage('book');
 el('pickerOT').addEventListener('click',()=>{pickerTestament='OT';renderPicker()});el('pickerNT').addEventListener('click',()=>{pickerTestament='NT';renderPicker()});
 const select=el('bibleBook');
 const antigo=document.createElement('optgroup');antigo.label='ANTIGO TESTAMENTO — 39 LIVROS';
 const novo=document.createElement('optgroup');novo.label='NOVO TESTAMENTO — 27 LIVROS';
 BOOKS.forEach(([code,name],i)=>{(i<OT_COUNT?antigo:novo).appendChild(new Option(name,code))});
 select.append(antigo,novo);updateSelectors();
 select.addEventListener('change',e=>{readingBook=e.target.value;readingChapter=1;readingVerse=1;pickerTestament=BOOKS.findIndex(b=>b[0]===readingBook)<39?'OT':'NT';updateSelectors();renderChapter()});
 el('bibleChapterSelect').addEventListener('change',e=>{readingChapter=Number(e.target.value);readingVerse=1;renderPicker();renderChapter()});
 el('biblePrev').addEventListener('click',()=>stepChapter(-1));el('bibleNext').addEventListener('click',()=>stepChapter(1));
 el('bibleListenChapter').addEventListener('click',playChapter);
 el('bibleToggleAudio').addEventListener('click',()=>window.DevocionalAudio?.togglePause?.());
 el('bibleStopAudio').addEventListener('click',()=>window.DevocionalAudio?.stop?.());
 el('bibleImport').addEventListener('click',()=>el('bibleFile').click());
 el('bibleFile').addEventListener('change',e=>importFile(e.target.files?.[0]));
 el('bibleAuto').addEventListener('click',autoImport);
 el('audioBible').addEventListener('click',()=>playPassage(false));
 el('audioFull').addEventListener('click',()=>playPassage(true));
 get('ready','meta').then(meta=>{if(meta?.chapters===1189){updated();status('Bíblia ONBV já importada. Disponível offline neste aparelho.','ok')}else status('Baixe o ZIP oficial uma única vez e importe-o aqui.');renderChapter();renderStudyPassage()})
 .catch(e=>status('Armazenamento local indisponível: '+e.message,'error'));
}
window.DevocionalBible={renderStudyPassage,renderChapter,openReference,playPassage,parseReference,parseUsfm,speechParts,loadPassage,source:BIBLE_SOURCE};
document.addEventListener('DOMContentLoaded',initialize);
})();
