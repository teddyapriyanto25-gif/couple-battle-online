const path=require('path');
const http=require('http');
const express=require('express');
const {Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server),rooms=new Map(),PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,'public')));app.get('/health',(_,r)=>r.json({ok:true}));

const GAMES=['Couple Fighter','Sword Battle','Arrow Battle','Mini Racing'];
const MODES=['Online 1v1','VS Computer'];
const CHARACTERS=['Raka','Alya','Bimo','Naya'];
const ARENAS=['Neon City','Dojo','Beach','Rooftop'];
const STATS={
 Raka:{damage:1.15,speed:1,jump:1,cool:1},
 Alya:{damage:.9,speed:1.18,jump:1.08,cool:.88},
 Bimo:{damage:1.3,speed:.82,jump:.9,cool:1.12},
 Naya:{damage:1,speed:1.08,jump:1.15,cool:.94}
};
const CODE='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const code=()=>{let c;do{c=Array.from({length:4},()=>CODE[Math.random()*CODE.length|0]).join('')}while(rooms.has(c));return c};
const state=r=>({code:r.code,game:r.game,mode:r.mode,arena:r.arena,players:r.players.map(p=>({id:p.id,name:p.name,score:p.score||0,character:p.character||'Raka'}))});
const emit=(r,e,d)=>io.to(r.code).emit(e,d);
const stop=r=>{if(r.tick){clearInterval(r.tick);r.tick=null}};
function resetPlayer(p,i,keepScore=true){
 p.x=i?700:100;p.y=330;p.hp=100;p.stats=STATS[p.character]||STATS.Raka;
 if(!keepScore)p.score=0;
 p.vx=0;p.vy=0;p.dir=i?-1:1;p.attack=0;p.attackKind='';p.cool=0;p.block=false;p.hitFlash=0;p.stun=0;p.progress=0;p.boost=false;
 p.input={left:false,right:false,jump:false,attack:false,kick:false,block:false,boost:false};
}
function start(r,keepScore=false){
 if(r.players.length!==2)return;
 stop(r);r.playing=true;r.round=1;r.winner=null;r.roundWins=[0,0];r.roundEndsAt=Date.now()+60000;r.readyUntil=Date.now()+3000;
 r.players.forEach((p,i)=>resetPlayer(p,i,keepScore));
 emit(r,'gameInit',{game:r.game,arena:r.arena,players:r.players.map(p=>({id:p.id,name:p.name,character:p.character,score:p.score||0})),round:1});
 r.tick=setInterval(()=>step(r),50);
}
function hit(r,att,amount,kind,reach,delay=0){
 setTimeout(()=>{
  if(!r.playing)return;
  const target=r.players.find(p=>p.id!==att.id);
  if(!target||target.hp<=0||att.stun>0)return;
  const dx=target.x-att.x,dist=Math.abs(dx),facing=(att.dir||1)*dx;
  if(dist>reach||facing<0)return;
  const blocked=!!target.block&&kind!=='arrow';
  const d=blocked?Math.ceil(amount*.2):amount;
  target.hp=clamp(target.hp-d,0,100);
  target.vx+=(att.dir||1)*(blocked?2:kind==='sword'?9:7);
  target.stun=blocked?3:kind==='sword'?8:7;target.hitFlash=5;
  emit(r,'hitEffect',{id:target.id,attackerId:att.id,kind,blocked});
  if(target.hp<=0)endRound(r,att,'KO!');
 },delay);
}
function doAttack(r,p,kind){
 if(p.cool>0||p.stun>0||Date.now()<r.readyUntil)return;
 if(kind==='punch'){p.attack=12;p.attackKind='punch';p.cool=Math.ceil(18*(p.stats?.cool||1));hit(r,p,12*(p.stats?.damage||1),'punch',115,150)}
 if(kind==='kick'){p.attack=16;p.attackKind='kick';p.cool=Math.ceil(24*(p.stats?.cool||1));hit(r,p,16*(p.stats?.damage||1),'kick',130,170)}
 if(kind==='sword'){p.attack=18;p.attackKind='sword';p.cool=Math.ceil(22*(p.stats?.cool||1));hit(r,p,19*(p.stats?.damage||1),'sword',145,160)}
 if(kind==='arrow'){
  p.attack=12;p.attackKind='arrow';p.cool=Math.ceil(26*(p.stats?.cool||1));
  const target=r.players.find(x=>x.id!==p.id);
  const dir=p.dir||1;
  emit(r,'projectile',{id:p.id,x:p.x,y:p.y-55,dir,targetId:target?.id||null});
  hit(r,p,15*(p.stats?.damage||1),'arrow',330,220)
}
}
function endRound(r,w,reason){
 if(!r.playing)return;stop(r);
 const wi=r.players.findIndex(p=>p.id===w.id);if(wi<0)return;
 r.roundWins[wi]++;
 emit(r,'roundOver',{winnerId:w.id,winner:w.name,roundWins:r.roundWins,reason});
 if(r.roundWins[wi]>=2){
  r.playing=false;r.winner=w.id;w.score=(w.score||0)+1;
  emit(r,'gameOver',{winnerId:w.id,winner:w.name,scores:r.players.map(p=>({id:p.id,name:p.name,score:p.score||0})),reason:'MENANG 2 ROUND!'});return;
 }
 setTimeout(()=>{
  if(!rooms.has(r.code))return;
  r.playing=true;r.round++;r.roundEndsAt=Date.now()+60000;r.readyUntil=Date.now()+3000;
  r.players.forEach((p,i)=>resetPlayer(p,true));emit(r,'roundStart',{round:r.round});r.tick=setInterval(()=>step(r),50);
 },1500);
}
function step(r){
 if(!r.playing)return;
 const locked=Date.now()<r.readyUntil;
 if(r.mode==='VS Computer'){
  const bot=r.players[1],me=r.players[0],dist=me.x-bot.x;
  bot.input={left:false,right:false,jump:false,attack:false,kick:false,block:false,boost:false};
  if(!locked){
   if(r.game==='Mini Racing'){
    bot.input.boost=bot.progress<.25||bot.progress>.7||Math.random()<.12;
   }else{
    if(Math.abs(dist)>135){bot.input[dist<0?'left':'right']=true}
    else if(Math.random()<.16)bot.input.block=true;
    else if(Math.random()<.72)bot.input.attack=true;
    if(Math.random()<.035)bot.input.jump=true;
    if(r.game==='Couple Fighter'&&Math.random()<.28)bot.input.kick=true;
    if(r.game==='Sword Battle'&&Math.random()<.35)bot.input.attack=true;
   }
  }
 }
 for(const p of r.players){
  p.cool=Math.max(0,p.cool-1);p.attack=Math.max(0,p.attack-1);p.hitFlash=Math.max(0,p.hitFlash-1);p.stun=Math.max(0,p.stun-1);
  if(r.game==='Mini Racing'){
   if(!locked){p.progress=clamp(p.progress+(p.boost?.015:.0085)*(p.stats?.speed||1),0,1)}
   continue;
  }
  const i=p.input||{};
  if(locked){p.vx*=.8;p.block=false}
  else if(p.stun>0)p.vx*=.9;
  else if(i.left){p.vx=-5*(p.stats?.speed||1);p.dir=-1}
  else if(i.right){p.vx=5*(p.stats?.speed||1);p.dir=1}
  else p.vx*=.82;
  p.x=clamp(p.x+p.vx,55,745);p.block=!!i.block;
  if(!locked&&i.jump&&p.y>=330)p.vy=-10*(p.stats?.jump||1);
  p.vy=(p.vy||0)+.55;p.y+=p.vy;if(p.y>330)p.y=330,p.vy=0;
  if(!locked){
   if(r.game==='Sword Battle'&&i.attack)doAttack(r,p,'sword');
   else if(r.game==='Arrow Battle'&&i.attack)doAttack(r,p,'arrow');
   else if(r.game==='Couple Fighter'){if(i.attack)doAttack(r,p,'punch');else if(i.kick)doAttack(r,p,'kick')}
  }
 }
 if(r.game==='Mini Racing'&&r.players.some(p=>p.progress>=1)){
  const w=r.players.reduce((a,b)=>a.progress>b.progress?a:b);endRound(r,w,'FINISH!');return;
 }
 if(r.game!=='Mini Racing'&&r.players.some(p=>p.hp<=0))return;
 if(r.game!=='Mini Racing'&&Date.now()>r.roundEndsAt){
  const w=r.players[0].hp>=r.players[1].hp?r.players[0]:r.players[1];endRound(r,w,'WAKTU HABIS!');return;
 }
 emit(r,'world',r.players.map(p=>({id:p.id,x:p.x,y:p.y,hp:p.hp,attack:p.attack,attackKind:p.attackKind,block:p.block,dir:p.dir,hitFlash:p.hitFlash,stun:p.stun,progress:p.progress,boost:p.boost})).concat([{timer:Math.max(0,Math.ceil((r.roundEndsAt-Date.now())/1000)),round:r.round,roundWins:r.roundWins,locked}]));
}
io.on('connection',s=>{
 s.on('createRoom',({name,mode})=>{
  const c=code(),m=MODES.includes(mode)?mode:'Online 1v1',players=[{id:s.id,name:String(name||'Pemain 1').slice(0,20),character:'Raka',score:0}];
  if(m==='VS Computer')players.push({id:'BOT',name:'Computer 🤖',character:'Raka',score:0});
  const r={code:c,mode:m,game:'Couple Fighter',arena:'Neon City',players,playing:false,tick:null,roundWins:[0,0]};resetPlayer(r.players[0],0);if(r.players[1])resetPlayer(r.players[1],1);rooms.set(c,r);s.join(c);s.data.room=c;s.emit('created',state(r));
 });
 s.on('joinRoom',({name,code:c})=>{
  const r=rooms.get(String(c||'').toUpperCase());
  if(r?.mode==='VS Computer')return s.emit('err','Room ini mode VS Computer.');
  if(!r)return s.emit('err','Room tidak ditemukan.');
  if(r.players.length>=2)return s.emit('err','Room sudah penuh.');
  if(r.playing)return s.emit('err','Battle sedang berjalan.');
  const p={id:s.id,name:String(name||'Pemain 2').slice(0,20),character:'Alya',score:0};resetPlayer(p,1);r.players.push(p);s.join(r.code);s.data.room=r.code;emit(r,'room',state(r));
 });
 s.on('selectGame',({game})=>{const r=rooms.get(s.data.room);if(!r||r.playing||!GAMES.includes(game))return;r.game=game;emit(r,'room',state(r))});
 s.on('selectCharacter',({character})=>{const r=rooms.get(s.data.room);if(!r||r.playing||!CHARACTERS.includes(character))return;const p=r.players.find(x=>x.id===s.id);if(p){p.character=character;emit(r,'room',state(r))}});
 s.on('selectArena',({arena})=>{const r=rooms.get(s.data.room);if(!r||r.playing||!ARENAS.includes(arena)||s.id!==r.players[0]?.id)return;r.arena=arena;emit(r,'room',state(r))});
 s.on('startGame',()=>{const r=rooms.get(s.data.room);if(r&&r.players.length===2)start(r,false)});
 s.on('control',d=>{
  const r=rooms.get(s.data.room);if(!r||!r.playing)return;const p=r.players.find(x=>x.id===s.id);if(!p)return;
  p.input={left:!!d.left,right:!!d.right,jump:!!d.jump,attack:!!d.attack,kick:!!d.kick,block:!!d.block,boost:!!d.boost};p.boost=!!d.boost;
 });
 s.on('rematch',()=>{const r=rooms.get(s.data.room);if(r&&r.players.length===2)start(r,true)});
 s.on('disconnect',()=>{
  const r=rooms.get(s.data.room);if(!r)return;stop(r);
  if(r.mode==='VS Computer'&&s.id===r.players[0]?.id){rooms.delete(r.code);return}
  r.players=r.players.filter(p=>p.id!==s.id&&p.id!=='BOT');
  if(!r.players.length)rooms.delete(r.code);else{r.playing=false;emit(r,'opponentLeft');emit(r,'room',state(r))}
 });
});
server.listen(PORT,'0.0.0.0',()=>console.log('Couple Battle online on '+PORT));