const path=require('path');const http=require('http');const express=require('express');const{Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server),rooms=new Map(),PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,'public')));app.get('/health',(_,r)=>r.json({ok:true}));
const games=['Tebak Cepat','Tembak Target','Coin Rush','Tug Battle'];
function code(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let x;do{x=Array.from({length:4},()=>c[Math.random()*c.length|0]).join('')}while(rooms.has(x));return x}
function state(r){return{code:r.code,game:r.game,players:r.players.map(p=>({id:p.id,name:p.name,score:p.score}))}}
function emit(r,e,d){io.to(r.code).emit(e,d)}function stop(r){if(r.timer){clearTimeout(r.timer);r.timer=null}}
function over(r,id,reason){stop(r);r.playing=false;const w=r.players.find(p=>p.id===id);emit(r,'gameOver',{winnerId:id,winner:w?.name||null,scores:r.players.map(p=>({id:p.id,name:p.name,score:p.score})),reason})}
function next(r){if(!r.playing)return;r.round++;r.lock=false;if(r.game==='Tebak Cepat')quick(r);if(r.game==='Tembak Target')target(r);if(r.game==='Coin Rush')coin(r);if(r.game==='Tug Battle')tug(r)}
function timer(r,ms){stop(r);r.timer=setTimeout(()=>{if(!r.playing)return;emit(r,'roundResult',{message:'Waktu habis!'});setTimeout(()=>next(r),650)},ms)}
function quick(r){const a=2+(Math.random()*12|0),b=2+(Math.random()*12|0),mul=Math.random()<.5; r.answer=mul?a*b:a+b;emit(r,'quickRound',{round:r.round,question:`${a} ${mul?'×':'+'} ${b} = ?`});timer(r,7000)}
function target(r){r.target=Math.random().toString(36).slice(2,8);emit(r,'targetRound',{round:r.round,target:r.target,x:10+Math.random()*80,y:15+Math.random()*70});timer(r,4500)}
function coin(r){r.target=Math.random().toString(36).slice(2,8);emit(r,'coinRound',{round:r.round,target:r.target,x:10+Math.random()*80,y:15+Math.random()*70});timer(r,3500)}
function tug(r){emit(r,'tugRound',{goal:15});}
function start(r){if(r.players.length!==2)return;stop(r);r.playing=true;r.players.forEach(p=>p.score=0);r.round=0;emit(r,'gameInit',{game:r.game,players:r.players.map(p=>({id:p.id,name:p.name}))});setTimeout(()=>next(r),800)}
io.on('connection',s=>{
 s.on('createRoom',({name})=>{const c=code(),r={code:c,game:'Tebak Cepat',players:[{id:s.id,name:String(name||'Pemain 1').slice(0,20),score:0}],playing:false};rooms.set(c,r);s.join(c);s.data.room=c;s.emit('created',state(r))});
 s.on('joinRoom',({name,code:c})=>{const r=rooms.get(String(c||'').toUpperCase());if(!r)return s.emit('err','Room tidak ditemukan.');if(r.players.length>=2)return s.emit('err','Room sudah penuh.');if(r.playing)return s.emit('err','Game sedang berjalan.');r.players.push({id:s.id,name:String(name||'Pemain 2').slice(0,20),score:0});s.join(r.code);s.data.room=r.code;emit(r,'room',state(r))});
 s.on('selectGame',({game})=>{const r=rooms.get(s.data.room);if(!r||r.playing||!games.includes(game))return;r.game=game;emit(r,'room',state(r))});
 s.on('startGame',()=>{const r=rooms.get(s.data.room);if(r?.players.length===2)start(r)});
 s.on('answer',({value})=>{const r=rooms.get(s.data.room);if(!r||!r.playing||r.game!=='Tebak Cepat'||r.lock)return;if(Number(value)!==r.answer)return;r.lock=true;stop(r);const p=r.players.find(x=>x.id===s.id);p.score++;emit(r,'roundResult',{message:`${p.name} benar! +1`,scores:r.players.map(x=>({id:x.id,score:x.score}))});if(p.score>=5)return over(r,p.id,'5 poin tercapai');setTimeout(()=>next(r),700)});
 s.on('hit',({target})=>{const r=rooms.get(s.data.room);if(!r||!r.playing||r.lock||!['Tembak Target','Coin Rush'].includes(r.game)||target!==r.target)return;r.lock=true;stop(r);const p=r.players.find(x=>x.id===s.id);p.score++;emit(r,'roundResult',{message:`${p.name} mendapat poin! +1`,scores:r.players.map(x=>({id:x.id,score:x.score}))});if(p.score>=7)return over(r,p.id,'7 poin tercapai');setTimeout(()=>next(r),600)});
 s.on('tug',()=>{const r=rooms.get(s.data.room);if(!r||!r.playing||r.game!=='Tug Battle')return;const p=r.players.find(x=>x.id===s.id);if(!p)return;p.score++;emit(r,'tugUpdate',{scores:r.players.map(x=>({id:x.id,score:x.score}))});if(p.score>=15)over(r,p.id,'15 tap tercapai')});
 s.on('rematch',()=>{const r=rooms.get(s.data.room);if(r?.players.length===2)start(r)});
 s.on('disconnect',()=>{const r=rooms.get(s.data.room);if(!r)return;stop(r);r.players=r.players.filter(p=>p.id!==s.id);if(!r.players.length)rooms.delete(r.code);else{r.playing=false;emit(r,'opponentLeft');emit(r,'room',state(r))}})
});server.listen(PORT,'0.0.0.0',()=>console.log('Couple Battle online on '+PORT));