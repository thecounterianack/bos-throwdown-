const CANVAS_W = 960, CANVAS_H = 540;
const GROUND_Y = 430;
const STAGE_L = 40, STAGE_R = CANVAS_W - 40;
const ROUND_TIME = 90;
const HITSTUN_MS = 260;

let canvas, ctx;
let lastTs = 0;
let gamepadIndex = null;
let musicEnabled = true;
let currentTrack = null;
let currentTrackName = null;

const Storage = {
  get(key, def){ try{ const v = localStorage.getItem(key); return v===null?def:JSON.parse(v); }catch(e){ return def; } },
  set(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
};

const Progress = {
  towerClears(){ return Storage.get('bos_towerClears', 0); },
  addClear(){ Storage.set('bos_towerClears', this.towerClears()+1); },
  shadowUnlockCount(){ return Storage.get('bos_shadowUnlock', 0); },
  unlockNextShadow(){ const c = this.shadowUnlockCount(); if(c < 3) Storage.set('bos_shadowUnlock', c+1); },
  difficultyMult(){ const clears = this.towerClears(); return Math.min(1 + clears*0.05, 1.6); }
};

let audioUnlocked = false;
let sharedAudioCtx = null;

function unlockAudioContext(){
  if(audioUnlocked) return;
  audioUnlocked = true;
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(AC){ sharedAudioCtx = sharedAudioCtx || new AC(); if(sharedAudioCtx.state === 'suspended'){ sharedAudioCtx.resume().catch(()=>{}); } }
  }catch(e){}
  try{
    const primer = new Audio();
    primer.src = 'audio/song3.mp3';
    primer.volume = 0;
    const p = primer.play();
    if(p && p.catch){ p.then(()=>{ primer.pause(); primer.currentTime = 0; }).catch(()=>{}); }
  }catch(e){}
  if(currentTrack && musicEnabled && currentTrack.paused){ currentTrack.play().catch(()=>{}); }
}
['pointerdown','touchstart','mousedown','keydown'].forEach(evt=>{
  window.addEventListener(evt, unlockAudioContext, { once:true, passive:true });
});

function playMusic(name){
  if(currentTrackName === name && currentTrack && !currentTrack.paused) return;
  if(currentTrack){ currentTrack.pause(); }
  currentTrack = new Audio('audio/'+name);
  currentTrack.loop = true;
  currentTrack.volume = 0.55;
  currentTrackName = name;
  if(musicEnabled){ currentTrack.play().catch(()=>{}); }
}
function pauseMusic(){ if(currentTrack) currentTrack.pause(); }
function resumeMusic(){ if(currentTrack && musicEnabled) currentTrack.play().catch(()=>{}); }
function setMusicEnabled(v){
  musicEnabled = v;
  if(currentTrack){ if(v) currentTrack.play().catch(()=>{}); else currentTrack.pause(); }
}

const Input = {
  left:false, right:false, up:false, down:false,
  punch:false, kick:false, special:false, block:false, pause:false, confirm:false,
  _prevPunch:false, _prevKick:false, _prevSpecial:false, _prevConfirm:false, _prevPause:false, _prevUp:false,
  pressedPunch(){ return this.punch && !this._prevPunch; },
  pressedKick(){ return this.kick && !this._prevKick; },
  pressedSpecial(){ return this.special && !this._prevSpecial; },
  pressedConfirm(){ return this.confirm && !this._prevConfirm; },
  pressedPause(){ return this.pause && !this._prevPause; },
  pressedUp(){ return this.up && !this._prevUp; },
  latch(){
    this._prevPunch=this.punch; this._prevKick=this.kick; this._prevSpecial=this.special;
    this._prevConfirm=this.confirm; this._prevPause=this.pause; this._prevUp=this.up;
  }
};

const keyMap = {
  'ArrowLeft':'left','ArrowRight':'right','ArrowUp':'up','ArrowDown':'down',
  'a':'left','d':'right','w':'up','s':'down','A':'left','D':'right','W':'up','S':'down',
  'x':'punch','X':'punch','j':'punch','J':'punch',
  'c':'kick','C':'kick','k':'kick','K':'kick',
  'Shift':'special','l':'special','L':'special',
  'v':'block','V':'block','i':'block','I':'block',
  'Escape':'pause','p':'pause','P':'pause',
  'Enter':'confirm',' ':'confirm'
};

window.addEventListener('keydown', (e)=>{
  const action = keyMap[e.key];
  if(action){ Input[action] = true; if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault(); }
});
window.addEventListener('keyup', (e)=>{
  const action = keyMap[e.key];
  if(action){ Input[action] = false; }
});

window.addEventListener('gamepadconnected', (e)=>{
  gamepadIndex = e.gamepad.index;
  showGamepadBadge();
  unlockAudioContext();
});
window.addEventListener('gamepaddisconnected', (e)=>{
  if(gamepadIndex === e.gamepad.index) gamepadIndex = null;
});

function showGamepadBadge(){
  const badge = document.getElementById('gamepadBadge');
  if(!badge) return;
  badge.classList.add('show');
  setTimeout(()=>badge.classList.remove('show'), 2200);
}

function pollGamepad(){
  if(gamepadIndex === null) return;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads[gamepadIndex];
  if(!gp) return;
  const axisX = gp.axes[0] || 0;
  const dpadLeft = gp.buttons[14] && gp.buttons[14].pressed;
  const dpadRight = gp.buttons[15] && gp.buttons[15].pressed;
  const dpadUp = gp.buttons[12] && gp.buttons[12].pressed;
  const dpadDown = gp.buttons[13] && gp.buttons[13].pressed;
  Input.left = Input.left || axisX < -0.35 || dpadLeft;
  Input.right = Input.right || axisX > 0.35 || dpadRight;
  Input.up = Input.up || dpadUp || (gp.axes[1] < -0.5);
  Input.down = Input.down || dpadDown || (gp.axes[1] > 0.5);
  Input.punch = Input.punch || (gp.buttons[0] && gp.buttons[0].pressed);
  Input.kick = Input.kick || (gp.buttons[2] && gp.buttons[2].pressed);
  Input.special = Input.special || (gp.buttons[3] && gp.buttons[3].pressed);
  Input.block = Input.block || (gp.buttons[1] && gp.buttons[1].pressed) || (gp.buttons[4]&&gp.buttons[4].pressed) || (gp.buttons[5]&&gp.buttons[5].pressed);
  Input.pause = Input.pause || (gp.buttons[9] && gp.buttons[9].pressed) || (gp.buttons[8] && gp.buttons[8].pressed);
  Input.confirm = Input.confirm || (gp.buttons[0] && gp.buttons[0].pressed);
}

function bindTouchButton(elId, action){
  const el = document.getElementById(elId);
  if(!el) return;
  const set = (v)=>{ Input[action]=v; };
  el.addEventListener('touchstart', (e)=>{ e.preventDefault(); set(true); }, {passive:false});
  el.addEventListener('touchend', (e)=>{ e.preventDefault(); set(false); }, {passive:false});
  el.addEventListener('touchcancel', ()=>set(false));
  el.addEventListener('mousedown', ()=>set(true));
  el.addEventListener('mouseup', ()=>set(false));
  el.addEventListener('mouseleave', ()=>set(false));
}

class Fighter {
  constructor(data, x, facing, isCPU, tintColor){
    this.data = data;
    this.name = data.name;
    this.maxHp = Math.round(data.hp * (isCPU ? (1+ (Progress.difficultyMult()-1)) : 1));
    this.hp = this.maxHp;
    this.x = x; this.y = GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.isCPU = isCPU;
    this.speed = data.speed * 22;
    this.reach = data.reach;
    this.light = data.light;
    this.heavy = data.heavy;
    this.baseAI = data.ai;
    this.tint = tintColor || null;
    this.state = 'idle';
    this.stateTimer = 0;
    this.jumping = false;
    this.crouching = false;
    this.blocking = false;
    this.attackCooldown = 0;
    this.roundsWon = 0;
    this.flashTimer = 0;
    this.images = {};
    this.aiTimer = 0;
    this.specialGlow = 0;
    this.meter = 0;
    this.maxMeter = 100;
  }

  loadImages(basePath){
    ['front','side','back'].forEach(pose=>{
      const img = new Image();
      img.src = `${basePath}/${this.data.mirror ? this.data.sourceId : this.data.id}_${pose}.jpeg`;
      this.images[pose] = img;
    });
  }

  get width(){ return 70; }
  get height(){ return 170; }

  setState(s, dur){ this.state = s; this.stateTimer = dur || 0; }

  takeHit(damage, attacker){
    if(this.state === 'ko') return;
    let dmg = damage;
    if(this.blocking){ dmg = damage * 0.175; }
    this.hp = Math.max(0, this.hp - dmg);
    this.meter = Math.min(this.maxMeter, this.meter + dmg * 0.6);
    this.flashTimer = 160;
    this.vx = (this.x < attacker.x ? -1 : 1) * 4;
    if(!this.blocking){ this.setState('hitstun', HITSTUN_MS); }
    if(this.hp <= 0){ this.setState('ko', 99999); }
  }

  update(dt, opponent, bounds){
    if(this.flashTimer>0) this.flashTimer -= dt;
    if(this.specialGlow>0) this.specialGlow -= dt;
    if(this.attackCooldown>0) this.attackCooldown -= dt;
    if(this.state === 'ko'){ return; }
    if(this.state === 'hitstun'){
      this.stateTimer -= dt;
      this.x += this.vx;
      this.vx *= 0.85;
      this.x = Math.max(bounds.l, Math.min(bounds.r, this.x));
      if(this.stateTimer <= 0){ this.setState('idle',0); }
      return;
    }
    if(['punch','kick','special'].includes(this.state)){
      this.stateTimer -= dt;
      if(this.stateTimer <= 0){ this.setState('idle',0); }
      return;
    }
    this.x = Math.max(bounds.l, Math.min(bounds.r, this.x));
    this.facing = opponent.x > this.x ? 1 : -1;
    if(this.jumping){
      this.y += this.vy;
      this.vy += 0.9;
      if(this.y >= GROUND_Y){ this.y = GROUND_Y; this.jumping=false; this.vy=0; if(this.state==='jump') this.setState('idle',0); }
    }
  }

  distanceTo(opp){ return Math.abs(this.x - opp.x); }

  tryAttack(type, opponent, onHit){
    if(this.attackCooldown > 0) return false;
    if(['punch','kick','special'].includes(this.state)) return false;
    if(this.state === 'hitstun' || this.state === 'ko') return false;
    if(type==='special' && this.meter < this.maxMeter) return false;
    let dur, dmg, reachMul, cd;
    if(type==='punch'){ dur=260; dmg=this.light; reachMul=1.0; cd=120; }
    else if(type==='kick'){ dur=380; dmg=this.heavy; reachMul=1.15; cd=220; }
    else { dur=560; dmg=this.heavy*1.7; reachMul=1.3; cd=500; this.specialGlow = 400; this.meter = 0; }
    this.setState(type, dur);
    this.attackCooldown = cd;
    const dist = this.distanceTo(opponent);
    const effectiveReach = this.reach * reachMul;
    setTimeout(()=>{
      if(this.state !== type) return;
      if(dist <= effectiveReach && opponent.state !== 'ko'){
        opponent.takeHit(dmg, this);
        const meterGain = type === 'punch' ? 8 : type === 'kick' ? 14 : 0;
        this.meter = Math.min(this.maxMeter, this.meter + meterGain);
        if(onHit) onHit(dmg, type);
      }
    }, Math.min(120, dur*0.35));
    return true;
  }
}

function updateAI(fighter, opponent, dt, difficultyMult){
  fighter.aiTimer -= dt;
  const aggression = Math.min(0.98, fighter.baseAI * difficultyMult);
  if(fighter.aiTimer > 0) return;
  fighter.aiTimer = 140 + Math.random()*220 * (1-aggression);

  const dist = fighter.distanceTo(opponent);
  const reachOk = dist <= fighter.reach * 1.1;

  if(opponent.state === 'punch' || opponent.state === 'kick' || opponent.state === 'special'){
    if(Math.random() < aggression*0.6){
      fighter.blocking = true;
      fighter.setState('block', 200);
      return;
    }
  }
  fighter.blocking = false;

  if(reachOk){
    const roll = Math.random();
    const canSpecial = fighter.meter >= fighter.maxMeter;
    if(canSpecial && roll < aggression*0.55){
      fighter.tryAttack('special', opponent);
    } else if(roll < aggression*0.5){
      fighter.tryAttack(Math.random()<0.5?'punch':'kick', opponent);
    } else if(roll < aggression*0.7 + 0.15){
      fighter.x += fighter.facing * -3.5;
    }
  } else {
    const dir = opponent.x > fighter.x ? 1 : -1;
    fighter.x += dir * fighter.speed * 0.045 * (0.6+aggression*0.6);
    if(Math.random() < 0.01) { fighter.jumping = true; fighter.vy = -13; fighter.setState('jump',0); }
  }
}
