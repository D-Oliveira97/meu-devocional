/* Meu Devocional 2.6 · demonstração de áudio gravado Benício · sem chave de API */
'use strict';
(function(){
 const playerId='benicioAudio';
 let player=null;
 let sample=null;
 function pause(){ if(player&&!player.paused){player.pause()} }
 function updateForDay(day){
   if(!player||!sample)return;
   const available=Number(day)===1;
   sample.hidden=!available;
   if(!available){player.pause();player.currentTime=0}
 }
 function init(){
   sample=document.getElementById('benicioSample');
   player=document.getElementById(playerId);
   const state=document.getElementById('benicioStatus');
   if(!sample||!player||!state)return;
   const status=text=>{state.textContent=text};
   player.addEventListener('play',()=>{
      window.DevocionalCharon?.pause?.();
      window.DevocionalAudio?.stop?.('Amostra Benício em reprodução.');
      status('Reproduzindo a amostra de 1 minuto e 15 segundos.');
      if('mediaSession' in navigator && typeof window.MediaMetadata==='function'){
       try{navigator.mediaSession.metadata=new MediaMetadata({title:'Dia 01 — O princípio de tudo (amostra)',artist:'Meu Devocional · Narrador Benício (IA)',album:'Meu Devocional'});}catch(_){}
      }
   });
   player.addEventListener('pause',()=>{if(!player.ended)status('Gravação pausada.');});
   player.addEventListener('ended',()=>status('Amostra concluída.'));
   player.addEventListener('error',()=>status('Não foi possível abrir o MP3. Verifique a publicação do arquivo no GitHub.'));
   const day=Number(document.getElementById('daySelect')?.value||1);
   updateForDay(day);
   window.addEventListener('pagehide',pause);
 }
 window.DevocionalBenicio={pause,updateForDay};
 document.addEventListener('DOMContentLoaded',init);
})();
