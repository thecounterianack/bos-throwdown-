'use strict';

/* ==================== 16:9 STAGE FITTING ==================== */
function fitStage(el){
  if (!el) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  let w = vw, h = w * 9 / 16;
  if (h > vh){ h = vh; w = h * 16 / 9; }
  el.style.width = Math.round(w) + 'px';
  el.style.height = Math.round(h) + 'px';
}
function fitAllStages(){
  fitStage(document.getElementById('fightStage'));
  fitStage(document.getElementById('cutsceneStage'));
}
window.addEventListener('resize', fitAllStages);
window.addEventListener('orientationchange', () => setTimeout(fitAllStages, 60));
window.addEventListener('load', fitAllStages);
document.addEventListener('DOMContentLoaded', fitAllStages);

/* ==================== CONSTANTS ==================== */
const CANVAS_W = 960, CANVAS_H = 540;
const GROUND_Y = 440;
const STAGE_L = 90, STAGE_R = CANVAS_W - 90;
const ROUND_TIME = 90;
const HITSTUN_MS = 260;

let canvas = null, ctx = null;
let lastTs = 0;
let gamepadIndex = null;
let musicEnabled = true;
let currentTrack = null;
let currentTrackName = null;

/* ==================== STORAGE / PROGRESS ==================== */
const Storage = {
  get(key, def){
    try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); }
    catch(e){ return def; }
  },
  set(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }
};

const Progress = {
  get towerClears(){ return Storage.get('bos_towerClears', 0); },
  addClear(){ Storage.set('bos_towerClears', this.towerClears + 1); },
  get shadowUnlockCount(){ return Storage.get('bos_shadowUnlock', 0); },
  unlockNextShadow(){
    const c = this.shadowUnlockCount;
    if (c < SHADOW_ROSTER.length) Storage.set('bos_shadowUnlock', c + 1);
  },
  get difficultyMult(){ return Math.min(1 + this.towerClears * 0.05, 1.6); }
};

/* ==================== ASSET PATHS ==================== */
function imgPath(artId, pose){ return 'assets/' + artId + '_' + pose + '.jpeg'; }
function audioPath(name){ return 'audio/' + name; }

/* ==================== BACKGROUND REMOVAL ==================== */
const Assets = {};
const loadFailures = [];

function keyOutBackground(img){
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return img;

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);

  let data;
  try { data = cx.getImageData(0, 0, w, h); }
  catch(e){ return img; }

  const px = data.data;
  const seen = new Uint8Array(w * h);
  const stack = [];

  const isBg = (i) => {
    const r = px[i], g = px[i+1], b = px[i+2];
    if (r < 228 || g < 228 || b < 228) return false;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return (mx - mn) < 20;
  };

  const pushIf = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (isBg(p * 4)) stack.push(p);
  };

  for (let x = 0; x < w; x++){ pushIf(x, 0); pushIf(x, h - 1); }
  for (let y = 0; y < h; y++){ pushIf(0, y); pushIf(w - 1, y); }

  while (stack.length){
    const p = stack.pop();
    px[p * 4 + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1);
  }

  for (let y = 1; y < h - 1; y++){
    for (let x = 1; x < w - 1; x++){
      const p = (y * w + x) * 4;
      if (px[p+3] === 0) continue;
      let clear = 0;
      if (px[p - 4 + 3] === 0) clear++;
      if (px[p + 4 + 3] === 0) clear++;
      if (px[p - w*4 + 3] === 0) clear++;
      if (px[p + w*4 + 3] === 0) clear++;
      if (clear >= 2) px[p+3] = 120;
    }
  }

  cx.putImageData(data, 0, 0);
  return c;
}

function loadImageAsset(artId, pose){
  const key = artId + '_' + pose;
  const path = imgPath(artId, pose);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth){ loadFailures.push(path); return resolve(false); }
      try { Assets[key] = keyOutBackground(img); }
      catch(e){ Assets[key] = img; }
      resolve(true);
    };
    img.onerror = () => { loadFailures.push(path); resolve(false); };
    img.src = path;
  });
}

const AudioAssets = {};

function loadAudioAsset(name){
  const path = audioPath(name);
  return new Promise(resolve => {
    const a = new Audio();
    a.preload = 'auto';
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      if (ok) AudioAssets[name] = a; else loadFailures.push(path);
      resolve(ok);
    };
    a.addEventListener('canplay', () => done(true));
    a.addEventListener('loadedmetadata', () => { if (a.duration > 0) done(true); });
    a.addEventListener('error', () => done(false));
    setTimeout(() => done(a.readyState >= 1), 20000);
    a.src = path;
    a.load();
  });
}

/* getArt now ALWAYS resolves to something drawable (falls back to
   _front, then to ANY loaded pose for that fighter) so a missing
   photo can never throw mid-frame and freeze the render loop. */
function getArt(artId, pose){
  if (Assets[artId + '_' + pose]) return Assets[artId + '_' + pose];
  if (Assets[artId + '_front']) return Assets[artId + '_front'];
  const anyKey = Object.keys(Assets).find(k => k.indexOf(artId + '_') === 0);
  return anyKey ? Assets[anyKey] : null;
}

/* ==================== AUDIO ==================== */
let audioUnlocked = false;
let sharedAudioCtx = null;

function unlockAudioContext(){
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC){
      sharedAudioCtx = sharedAudioCtx || new AC();
      if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(()=>{});
    }
  } catch(e){}
  Object.values(AudioAssets).forEach(a => {
    const wasPaused = a.paused;
    a.play().then(() => {
      if (wasPaused){ a.pause(); try { a.currentTime = 0; } catch(e){} }
    }).catch(()=>{});
  });
  if (currentTrack && musicEnabled && currentTrack.paused){
    currentTrack.play().catch(()=>{});
  }
}
['pointerdown','touchstart','mousedown','keydown'].forEach(evt => {
  window.addEventListener(evt, unlockAudioContext, { once:true, passive:true });
});

function playMusic(name, fromTime){
  if (currentTrackName === name && currentTrack && !currentTrack.paused) return currentTrack;
  if (currentTrack) currentTrack.pause();
  const a = AudioAssets[name] || new Audio(audioPath(name));
  AudioAssets[name] = a;
  a.loop = (name !== 'song1.mp3');
  a.volume = 0.55;
  if (typeof fromTime === 'number'){ try { a.currentTime = fromTime; } catch(e){} }
  currentTrack = a;
  currentTrackName = name;
  if (musicEnabled) a.play().catch(()=>{});
  return a;
}
function pauseMusic(){ if (currentTrack) currentTrack.pause(); }
function resumeMusic(){ if (currentTrack && musicEnabled) currentTrack.play().catch(()=>{}); }
function setMusicEnabled(v){
  musicEnabled = v;
  if (!currentTrack) return;
  if (v) currentTrack.play().catch(()=>{}); else currentTrack.pause();
}

/* ==================== INPUT ==================== */
const Input = {
  left:false, right:false, up:false, down:false,
  punch:false, kick:false, special:false, block:false,
  pause:false, confirm:false, back:false,
  _prev:{},
  pressed(k){ return this[k] && !this._prev[k]; },
  latch(){
    ['left','right','up','down','punch','kick','special','block','pause','confirm','back']
      .forEach(k => this._prev[k] = this[k]);
  }
};

const heldKeys = {};

const keyMap = {
  ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down',
  a:'left', d:'right', w:'up', s:'down',
  A:'left', D:'right', W:'up', S:'down',
  j:'punch', J:'punch',
  c:'kick', C:'kick', k:'kick', K:'kick',
  Shift:'special', l:'special', L:'special',
  v:'block', V:'block', i:'block', I:'block',
  Escape:'pause', p:'pause', P:'pause'
};

window.addEventListener('keydown', e => {
  const action = keyMap[e.key];
  if (action){ Input[action] = true; heldKeys[action] = true; }
  if (e.key === 'x' || e.key === 'X'){
    Input.punch = true; Input.confirm = true;
    heldKeys.punch = true; heldKeys.confirm = true;
  }
  if (e.key === 'Enter' || e.key === ' '){
    Input.confirm = true; heldKeys.confirm = true;
  }
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
});

window.addEventListener('keyup', e => {
  const action = keyMap[e.key];
  if (action){ Input[action] = false; heldKeys[action] = false; }
  if (e.key === 'x' || e.key === 'X'){
    Input.punch = false; Input.confirm = false;
    heldKeys.punch = false; heldKeys.confirm = false;
  }
  if (e.key === 'Enter' || e.key === ' '){
    Input.confirm = false; heldKeys.confirm = false;
  }
});

window.addEventListener('gamepadconnected', e => {
  gamepadIndex = e.gamepad.index;
  showGamepadBadge();
  unlockAudioContext();
});
window.addEventListener('gamepaddisconnected', e => {
  if (gamepadIndex === e.gamepad.index) gamepadIndex = null;
});

function showGamepadBadge(){
  const badge = document.getElementById('gamepadBadge');
  if (!badge) return;
  badge.classList.add('show');
  setTimeout(() => badge.classList.remove('show'), 2400);
}

function pollGamepad(){
  if (gamepadIndex === null) return;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads[gamepadIndex];
  if (!gp) return;

  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const b = i => gp.buttons[i] && gp.buttons[i].pressed;

  Input.left = !!heldKeys.left || ax < -0.35 || b(14);
  Input.right = !!heldKeys.right || ax > 0.35 || b(15);
  Input.up = !!heldKeys.up || ay < -0.50 || b(12);
  Input.down = !!heldKeys.down || ay > 0.50 || b(13);
  Input.punch = !!heldKeys.punch || b(0);
  Input.kick = !!heldKeys.kick || b(2);
  Input.special = !!heldKeys.special || b(3);
  Input.block = !!heldKeys.block || b(1) || b(4) || b(5);
  Input.pause = !!heldKeys.pause || b(9) || b(8);
  Input.confirm = !!heldKeys.confirm || b(0);
  Input.back = b(1);
}

function bindTouchButton(elId, action){
  const el = document.getElementById(elId);
  if (!el) return;
  const set = v => { Input[action] = v; heldKeys[action] = v; };
  el.addEventListener('touchstart', e => { e.preventDefault(); set(true); unlockAudioContext(); }, { passive:false });
  el.addEventListener('touchend', e => { e.preventDefault(); set(false); }, { passive:false });
  el.addEventListener('touchcancel', () => set(false));
  el.addEventListener('mousedown', () => { set(true); unlockAudioContext(); });
  el.addEventListener('mouseup', () => set(false));
  el.addEventListener('mouseleave',() => set(false));
}

/* ==================== FIGHTER + SKELETON RIG ==================== */
const MOVE_DUR = { punch:260, kick:340, special:460 };
const MOVE_ACTIVE = { punch:120, kick:170, special:230 };

class Fighter {
  constructor(data, x, facing, isCPU, tintColor){
    this.data = data;
    this.name = data.name;
    this.artId = artIdFor(data);
    this.maxHp = Math.round(data.hp * (isCPU ? Progress.difficultyMult : 1));
    this.hp = this.maxHp;
    this.x = x;
    this.y = GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.isCPU = isCPU;
    this.tint = tintColor || null;
    this.state = 'idle';
    this.stateT = 0;
    this.stun = 0;
    this.flashTimer = 0;
    this.jumping = false;
    this.crouching = false;
    this.blocking = false;
    this.didHit = false;
    this.roundsWon = 0;
    this.maxMeter = 100;
    this.meter = 0;
    this.specialGlow = 0;
    this.aiCD = 500;
    this.width = 150;
    this.height = 265;
    this.walkPhase = 0;
  }

  setState(s, t){ this.state = s; this.stateT = t || 0; this.didHit = false; }

  canAct(){
    return this.stun <= 0 && !['ko','hitstun','punch','kick','special'].includes(this.state);
  }

  addMeter(v){ this.meter = Math.min(this.maxMeter, this.meter + v); }

  tryAttack(type, other){
    if (!this.canAct() || this.jumping) return false;
    if (type === 'special'){
      if (this.meter < this.maxMeter) return false;
      this.meter = 0;
      this.specialGlow = MOVE_DUR.special;
    }
    this.setState(type, 0);
    return true;
  }

  update(dt, other, leftBound, rightBound){
    if (this.stun > 0){
      this.stun -= dt;
      if (this.stun <= 0 && this.state === 'hitstun') this.setState('idle');
    }
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.specialGlow > 0) this.specialGlow -= dt;

    if (this.state !== 'ko'){
      this.addMeter(dt * 0.006);
      if (other) this.facing = (other.x > this.x) ? 1 : -1;
    }

    if (this.jumping){
      this.vy += 0.055 * dt;
      this.y += this.vy * dt * 0.06;
      if (this.y >= GROUND_Y){
        this.y = GROUND_Y; this.vy = 0; this.jumping = false;
        if (this.state === 'jump') this.setState('idle');
      }
    }

    if (['punch','kick','special'].includes(this.state)){
      this.stateT += dt;
      if (this.stateT >= MOVE_ACTIVE[this.state] && !this.didHit && other){
        this.didHit = true;
        this.resolveHit(other);
      }
      if (this.stateT >= MOVE_DUR[this.state]) this.setState('idle');
    }

    if (Math.abs(this.vx) > 0.1) this.walkPhase += dt * 0.012;

    this.x += this.vx;
    this.vx *= 0.72;
    this.x = Math.max(leftBound, Math.min(rightBound, this.x));
  }

  resolveHit(other){
    if (other.state === 'ko') return;
    const dist = Math.abs(this.x - other.x);
    const rangeMult = this.state === 'punch' ? 1.0 : this.state === 'kick' ? 1.15 : 1.45;
    if (dist > this.data.reach * rangeMult + 40) return;

    let dmg = this.state === 'punch' ? this.data.light
      : this.state === 'kick' ? this.data.heavy
      : Math.round(this.data.heavy * 1.6);

    this.addMeter(6);

    if (other.blocking){
      dmg = Math.max(1, Math.round(dmg * 0.17));
      other.flashTimer = 120;
      other.addMeter(4);
    } else {
      other.setState('hitstun');
      other.stun = HITSTUN_MS;
      other.flashTimer = 200;
      other.vx = (other.x > this.x ? 1 : -1) * 6;
      other.addMeter(8);
    }

    other.hp = Math.max(0, other.hp - dmg);
    if (other.hp <= 0) other.setState('ko');
  }

  rig(){
    const h = this.height, w = this.width;
    const st = this.state;
    const prog = MOVE_DUR[st] ? Math.min(1, this.stateT / MOVE_DUR[st]) : 0;
    const swing = Math.sin(prog * Math.PI);
    const walk = Math.sin(this.walkPhase) * (Math.abs(this.vx) > 0.1 ? 1 : 0);
    const crouch = this.crouching ? 0.22 : 0;

    const hipY = -h * (0.46 - crouch);
    const shY = -h * (0.80 - crouch * 0.7);
    const headY = -h * (0.92 - crouch * 0.6);

    let armR = { x: w * 0.20, y: shY + h * 0.16 };
    let armL = { x: -w * 0.20, y: shY + h * 0.16 };
    let elbowR = { x: w * 0.16, y: shY + h * 0.08 };

    if (st === 'punch'){
      armR = { x: w * (0.18 + 0.52 * swing), y: shY + h * 0.06 };
      elbowR = { x: w * (0.14 + 0.26 * swing), y: shY + h * 0.07 };
    } else if (st === 'special'){
      armR = { x: w * (0.20 + 0.66 * swing), y: shY + h * (0.04 - 0.10 * swing) };
      elbowR = { x: w * (0.16 + 0.32 * swing), y: shY + h * 0.05 };
    } else if (st === 'block'){
      armR = { x: w * 0.06, y: shY + h * 0.02 };
      elbowR = { x: w * 0.14, y: shY + h * 0.10 };
      armL = { x: -w * 0.04, y: shY + h * 0.04 };
    } else if (st === 'hitstun'){
      armR = { x: w * 0.28, y: shY + h * 0.22 };
      elbowR = { x: w * 0.22, y: shY + h * 0.14 };
    }

    let legR = { x: w * (0.14 + walk * 0.10), y: 0 };
    let kneeR = { x: w * 0.13, y: hipY * 0.42 };
    if (st === 'kick'){
      legR = { x: w * (0.16 + 0.70 * swing), y: -h * (0.10 + 0.26 * swing) };
      kneeR = { x: w * (0.15 + 0.34 * swing), y: hipY * 0.42 - h * 0.06 * swing };
    }

    const legL = { x: -w * (0.14 + walk * 0.10), y: 0 };
    const kneeL = { x: -w * 0.13, y: hipY * 0.42 };

    return { hipY, shY, headY, armR, armL, elbowR, legR, legL, kneeR, kneeL };
  }
}

/* which photo to show for the current state */
function poseForFighter(f){
  if (f.state === 'block') return 'back';
  if (f.state === 'hitstun' || f.state === 'ko') return 'front';
  if (['punch','kick','special'].includes(f.state)) return 'side';
  if (Math.abs(f.vx) > 1.6 && !f.jumping) return 'side';
  return 'front';
}
