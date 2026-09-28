const path=require('path');const http=require('http');const express=require('express');const{Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server),rooms=new Map(),PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,'public')));app.get('/health',(_,r)=>r.json({ok:true}));
const GAMES=['Couple Fighter','Sword Battle','Arrow Battle','Mini Racing'];
const MODES=['Online 1v1','VS Computer'];
const CODE='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function code(){let c;do{c=Array.from({length:4},()=>CODE[Math.random()*CODE.length|0]).join('')}while(rooms.has(c));return c}
function state(r){return{code:r.code,game:r.game,mode:r.mode||'Online 1v1',players:r.players.map(p=>({id:p.id,name:p.name,score:p.score}))}}
function emit(r,e,d){io.to(r.code).emit(e,d)}
function stop(r){if(r.tick){clearInterval(r.tick);r.tick=null}}
function resetPlayer(p,i,keepScore=false){p.x=i?700:100;p.y=330;p.hp=100;if(!keepScore)p.score=0;p.vx=0;p.vy=0;p.dir=i?-1:1;p.attack=0;p.cool=0;p.block=false;p.hitFlash=0;p.stun=0;p.lane=i?1:0;p.progress=0;p.input={left:false,right:false,jump:false,attack:false,block:false,boost:false}}
function start(r){if(r.players.length!==2)return;stop(r);r.playing=true;r.round=0;r.winner=null;r.players.forEach((p,i)=>resetPlayer(p,i));r.roundWins=[0,0];r.roundEndsAt=Date.now()+60000;r.startedAt=Date.now();emit(r,'gameInit',{game:r.game,players:r.players.map(p=>({id:p.id,name:p.name})),round:1});r.tick=setInterval(()=>step(r),50)}
function damage(r,att,amount,kind){
 const target=r.players.find(p=>p.id!==att.id);
 if(!target||target.hp<=0||att.stun>0)return;
 const dx=target.x-att.x, dist=Math.abs(dx);
 const facing=(att.dir||1)*dx;
 const reach=kind==='arrow'?300:115;
 if(dist>reach||facing<0)return;
 const d=target.block?Math.ceil(amount*.2):amount;
 target.hp=clamp(target.hp-d,0,100);
 target.vx+=(att.dir||1)*(target.block?2:7);
 target.stun=target.block?3:7; target.hitFlash=4;
 emit(r,'hitEffect',{id:target.id,kind,blocked:target.block});
 if(target.hp<=0)endRound(r,att,'KO!');
}
function endRound(r,w,reason){
 if(!r.playing)return;
 stop(r);
 const wi=r.players.findIndex(p=>p.id===w.id);
 if(wi<0)return;
 r.roundWins[wi]++;
 const matchWinner=r.roundWins[wi]>=2;
 emit(r,'roundOver',{winnerId:w.id,winner:w.name,roundWins:r.roundWins,reason});
 if(matchWinner){r.playing=false;r.winner=w.id;w.score++;emit(r,'gameOver',{winnerId:w.id,winner:w.name,scores:r.players.map(p=>({id:p.id,name:p.name,score:p.score})),reason:'MENANG 2 ROUND!'});return}
 setTimeout(()=>{if(!rooms.has(r.code))return;r.playing=true;r.round++;r.roundEndsAt=Date.now()+60000;r.players.forEach((p,i)=>resetPlayer(p,i,true));emit(r,'roundStart',{round:r.round});r.tick=setInterval(()=>step(r),50)},1500);
}
function finish(r,w){endRound(r,w,'KO!')}
(r,w){if(!r.playing)return;stop(r);r.playing=false;r.winner=w.id;w.score++;emit(r,'gameOver',{winnerId:w.id,winner:w.name,scores:r.players.map(p=>({id:p.id,name:p.name,score:p.score})),reason:'KO!'});}
function step(r){if(!r.playing)return;const now=Date.now();if(r.mode==='VS Computer'&&r.players.length===2){const bot=r.players[1],me=r.players[0],dist=me.x-bot.x;bot.input.left=false;bot.input.right=false;bot.input.block=false;bot.input.jump=false;bot.input.attack=false;if(Math.abs(dist)>125){if(dist<0)bot.input.left=true;else bot.input.right=true}else{bot.input.attack=bot.cool<=0;bot.input.block=Math.random()<0.18;if(Math.random()<0.025)bot.input.jump=true}}for(const p of r.players){p.cool=Math.max(0,p.cool-1);p.attack=Math.max(0,p.attack-1);p.hitFlash=Math.max(0,p.hitFlash-1);p.stun=Math.max(0,p.stun-1);if(r.game==='Mini Racing'){p.progress+=p.boost?0.018:0.009;p.progress=clamp(p.progress,0,1)}else{const i=p.input||{};if(p.stun>0){p.vx*=.9}else if(i.left){p.vx=-5;p.dir=-1}else if(i.right){p.vx=5;p.dir=1}else p.vx*=.82;p.x=clamp(p.x+p.vx,55,745);p.block=!!i.block;if(i.jump&&p.y>=330)p.vy=-10;p.vy=(p.vy||0)+.55;p.y+=p.vy;if(p.y>330)p.y=330,p.vy=0;if(i.attack&&p.cool<=0&&p.stun<=0){p.attack=r.game==='Arrow Battle'?7:12;p.cool=r.game==='Arrow Battle'?24:18;const aid=p.id;setTimeout(()=>{if(r.playing){const a=r.players.find(x=>x.id===aid);if(a)damage(r,a,r.game==='Arrow Battle'?14:12,r.game==='Arrow Battle'?'arrow':'melee')}},r.game==='Arrow Battle'?180:150)}}}
if(r.game==='Mini Racing'){if(r.players.some(p=>p.progress>=1)){const w=r.players.reduce((a,b)=>a.progress>b.progress?a:b);finish(r,w);return}}
if(r.game!=='Mini Racing'&&r.players.some(p=>p.hp<=0))return;
if(r.game!=='Mini Racing'&&Date.now()>r.roundEndsAt){const w=r.players[0].hp>=r.players[1].hp?r.players[0]:r.players[1];endRound(r,w,'WAKTU HABIS!');return;}
emit(r,'world',r.players.map(p=>({id:p.id,x:p.x,y:p.y,hp:p.hp,attack:p.attack,block:p.block,dir:p.dir,hitFlash:p.hitFlash,stun:p.stun,progress:p.progress})).concat([{timer:Math.max(0,Math.ceil((r.roundEndsAt-Date.now())/1000)),round:r.round,roundWins:r.roundWins}]))}
io.on('connection',s=>{
s.on('createRoom',({name,mode})=>{const c=code(),m=MODES.includes(mode)?mode:'Online 1v1',players=[{id:s.id,name:String(name||'Pemain 1').slice(0,20)}];if(m==='VS Computer')players.push({id:'BOT',name:'Computer 🤖'});const r={code:c,mode:m,game:'Couple Fighter',players,playing:false,tick:null};resetPlayer(r.players[0],0);rooms.set(c,r);s.join(c);s.data.room=c;s.emit('created',state(r))});
s.on('joinRoom',({name,code:c})=>{const r=rooms.get(String(c||'').toUpperCase());if(r?.mode==='VS Computer')return s.emit('err','Room ini mode VS Computer.');if(!r)return s.emit('err','Room tidak ditemukan.');if(r.players.length>=2)return s.emit('err','Room sudah penuh.');if(r.playing)return s.emit('err','Battle sedang berjalan.');const p={id:s.id,name:String(name||'Pemain 2').slice(0,20)};resetPlayer(p,1);r.players.push(p);s.join(r.code);s.data.room=r.code;emit(r,'room',state(r))});
s.on('selectGame',({game})=>{const r=rooms.get(s.data.room);if(!r||r.playing||!GAMES.includes(game))return;r.game=game;emit(r,'room',state(r))});
s.on('startGame',()=>{const r=rooms.get(s.data.room);if(r&&r.players.length===2)start(r)});
s.on('setMode',({mode})=>{const r=rooms.get(s.data.room);if(!r||r.playing||!MODES.includes(mode)||s.id!==r.players[0]?.id)return;if(mode==='VS Computer'){r.mode=mode;r.players=[r.players[0],{id:'BOT',name:'Computer 🤖'}];resetPlayer(r.players[1],1)}else{r.mode=mode;r.players=[r.players[0]]}emit(r,'room',state(r))});
s.on('control',d=>{const r=rooms.get(s.data.room);if(!r||!r.playing)return;const p=r.players.find(x=>x.id===s.id);if(!p)return;p.input={left:!!d.left,right:!!d.right,jump:!!d.jump,attack:!!d.attack,block:!!d.block,boost:!!d.boost};if(r.game==='Mini Racing'){p.boost=!!d.boost;return}});
s.on('rematch',()=>{const r=rooms.get(s.data.room);if(r&&r.players.length===2)start(r)});
s.on('disconnect',()=>{const r=rooms.get(s.data.room);if(!r)return;stop(r);if(r.mode==='VS Computer'&&s.id===r.players[0]?.id){rooms.delete(r.code);return}r.players=r.players.filter(p=>p.id!==s.id&&p.id!=='BOT');if(!r.players.length)rooms.delete(r.code);else{r.playing=false;emit(r,'opponentLeft');emit(r,'room',state(r))}});
});
server.listen(PORT,'0.0.0.0',()=>console.log('Couple Battle online on '+PORT));