const path=require('path');const http=require('http');const express=require('express');const{Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server),rooms=new Map(),PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,'public')));app.get('/health',(_,r)=>r.json({ok:true}));
const GAMES=['Couple Fighter','Sword Battle','Arrow Battle','Mini Racing'];
const CODE='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function code(){let c;do{c=Array.from({length:4},()=>CODE[Math.random()*CODE.length|0]).join('')}while(rooms.has(c));return c}
function state(r){return{code:r.code,game:r.game,players:r.players.map(p=>({id:p.id,name:p.name,score:p.score}))}}
function emit(r,e,d){io.to(r.code).emit(e,d)}
function stop(r){if(r.tick){clearInterval(r.tick);r.tick=null}}
function resetPlayer(p,i){p.x=i?700:100;p.y=330;p.hp=100;p.score=0;p.vx=0;p.vy=0;p.dir=i?-1:1;p.attack=0;p.cool=0;p.block=false;p.hitFlash=0;p.lane=i?1:0;p.progress=0}
function start(r){if(r.players.length!==2)return;stop(r);r.playing=true;r.round=0;r.winner=null;r.players.forEach(resetPlayer);r.startedAt=Date.now();emit(r,'gameInit',{game:r.game,players:r.players.map(p=>({id:p.id,name:p.name}))});r.tick=setInterval(()=>step(r),50)}
function damage(r,att,amount,kind){const target=r.players.find(p=>p.id!==att.id);if(!target||target.hp<=0)return;const dist=Math.abs(att.x-target.x);if(dist>150)return;if(kind==='arrow'&&dist<120)return;const d=target.block?Math.ceil(amount*.25):amount;target.hp=clamp(target.hp-d,0,100);target.hitFlash=3;emit(r,'hitEffect',{id:target.id,kind});if(target.hp<=0)finish(r,att)}
function finish(r,w){if(!r.playing)return;stop(r);r.playing=false;r.winner=w.id;w.score++;emit(r,'gameOver',{winnerId:w.id,winner:w.name,scores:r.players.map(p=>({id:p.id,name:p.name,score:p.score})),reason:'KO!'});}
function step(r){if(!r.playing)return;const now=Date.now();for(const p of r.players){p.cool=Math.max(0,p.cool-1);p.attack=Math.max(0,p.attack-1);p.hitFlash=Math.max(0,p.hitFlash-1);if(r.game==='Mini Racing'){p.progress+=p.boost?0.018:0.009;p.progress=clamp(p.progress,0,1)}else{p.vx*=.82;p.x=clamp(p.x+p.vx,55,745);p.block=!!p.block;}}
if(r.game==='Mini Racing'){if(r.players.some(p=>p.progress>=1)){const w=r.players.reduce((a,b)=>a.progress>b.progress?a:b);finish(r,w);return}}
if(r.game!=='Mini Racing'&&r.players.some(p=>p.hp<=0))return;
emit(r,'world',r.players.map(p=>({id:p.id,x:p.x,y:p.y,hp:p.hp,attack:p.attack,block:p.block,dir:p.dir,hitFlash:p.hitFlash,progress:p.progress})))}
io.on('connection',s=>{
s.on('createRoom',({name})=>{const c=code(),r={code:c,game:'Couple Fighter',players:[{id:s.id,name:String(name||'Pemain 1').slice(0,20)}],playing:false,tick:null};resetPlayer(r.players[0],0);rooms.set(c,r);s.join(c);s.data.room=c;s.emit('created',state(r))});
s.on('joinRoom',({name,code:c})=>{const r=rooms.get(String(c||'').toUpperCase());if(!r)return s.emit('err','Room tidak ditemukan.');if(r.players.length>=2)return s.emit('err','Room sudah penuh.');if(r.playing)return s.emit('err','Battle sedang berjalan.');const p={id:s.id,name:String(name||'Pemain 2').slice(0,20)};resetPlayer(p,1);r.players.push(p);s.join(r.code);s.data.room=r.code;emit(r,'room',state(r))});
s.on('selectGame',({game})=>{const r=rooms.get(s.data.room);if(!r||r.playing||!GAMES.includes(game))return;r.game=game;emit(r,'room',state(r))});
s.on('startGame',()=>{const r=rooms.get(s.data.room);if(r?.players.length===2)start(r)});
s.on('control',d=>{const r=rooms.get(s.data.room);if(!r||!r.playing)return;const p=r.players.find(x=>x.id===s.id);if(!p)return;if(r.game==='Mini Racing'){p.boost=!!d.boost;return}p.block=!!d.block;if(d.left)p.vx=-5,p.dir=-1;if(d.right)p.vx=5,p.dir=1;if(d.jump&&p.y>=330)p.vy=-10;p.vy=(p.vy||0)+.55;p.y+=p.vy;if(p.y>330)p.y=330,p.vy=0;if(d.attack&&p.cool<=0){p.attack=r.game==='Arrow Battle'?7:10;p.cool=r.game==='Arrow Battle'?22:16;setTimeout(()=>{if(r.playing){const a=r.players.find(x=>x.id===s.id);if(a)damage(r,a,r.game==='Arrow Battle'?14:12,r.game==='Arrow Battle'?'arrow':'melee')}},120)}});
s.on('rematch',()=>{const r=rooms.get(s.data.room);if(r?.players.length===2)start(r)});
s.on('disconnect',()=>{const r=rooms.get(s.data.room);if(!r)return;stop(r);r.players=r.players.filter(p=>p.id!==s.id);if(!r.players.length)rooms.delete(r.code);else{r.playing=false;emit(r,'opponentLeft');emit(r,'room',state(r))}});
});
server.listen(PORT,'0.0.0.0',()=>console.log('Couple Battle online on '+PORT));