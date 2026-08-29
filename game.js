const ASSET_LIST = [];
ROSTER.forEach(c=>['front','side','back','profile'].forEach(p=>ASSET_LIST.push(`assets/${c.id}_${p}.jpeg`)));
SHADOW_ROSTER.forEach(c=>['front','side','back','profile'].forEach(p=>ASSET_LIST.push(`assets/${c.id}_${p}.jpeg`)));
['song1.mp3','song2.mp3','song3.mp3'].forEach(a=>ASSET_LIST.push('audio/'+a));

let loadedCount = 0;
const totalAssets = ASSET_LIST.length;
const imageCache = {};

function preloadAssets(onDone){
  let done = 0;
  ASSET_LIST.forEach(path=>{
    if(path.endsWith('.mp3')){
      fetch(path, {method:'HEAD'}).catch(()=>{}).finally(()=>{ tick(); });
    } else {
      const img = new Image();
      img.onload = tick; img.onerror = tick;
      img.src = path;
      imageCache[path] = img;
    }
  });
  function tick(){
    done++;
    const pct = Math.round((done/totalAssets)*100);
    const fill = document.getElementById('loadingBarFill');
    const pctEl = document.getElementById('loadingPct');
    if(fill) fill.style.width = pct+'%';
    if(pctEl) pctEl.textContent = pct+'%';
    if(done >= totalAssets) setTimeout(onDone, 200);
  }
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

let gameState = {
  pickedId: null,
  ladder: [],
  currentRungIndex: 0,
  isFirstFightOfRun: true,
  currentFightType: null,
  paused: false
};

function initTitleMeta(){
  const clears = Progress.towerClears();
  const shadows = Progress.shadowUnlockCount();
  const el = document.getElementById('metaProgress');
  const pct = Math.round((Progress.difficultyMult()-1)*100);
  el.textContent = `TOWER CLEARS: ${clears} — SHADOW TIER ${shadows}/3 UNLOCKED — FIGHTERS ARE ${pct}% HARDER`;
}

function goToTitle(){
  showScreen('titleScreen');
  initTitleMeta();
  playMusic('song3.mp3');
  gameState.isFirstFightOfRun = true;
  armTitleGate();
}

let titleGateArmed = true;
function armTitleGate(){
  titleGateArmed = true;
  const titleScreen = document.getElementById('titleScreen');
  const overlay = document.getElementById('tapGateOverlay');
  const handler = (e)=>{
    if(!titleGateArmed) return;
    titleGateArmed = false;
    unlockAudioContext();
    overlay.classList.add('show');
    setTimeout(()=>{
      overlay.classList.remove('show');
      goToSelect();
    }, 1400);
  };
  titleScreen.onclick = handler;
  if(titleScreen._keyHandler){ window.removeEventListener('keydown', titleScreen._keyHandler); }
  titleScreen._keyHandler = (e)=>{
    if(!titleGateArmed) return;
    if(['Enter',' ','x','X'].includes(e.key)) handler(e);
  };
  window.addEventListener('keydown', titleScreen._keyHandler);
}

function goToSelect(){
  showScreen('selectScreen');
  renderRosterGrid();
}

let selectedFighterId = null;
function renderRosterGrid(){
  const grid = document.getElementById('rosterGrid');
  grid.innerHTML = '';
  ROSTER.forEach(c=>{
    const cell = document.createElement('div');
    cell.className = 'roster-cell';
    cell.innerHTML = `<img src="assets/${c.id}_front.jpeg"><div class="rc-name">${c.name}</div><div class="rc-rung">RUNG ${c.rung}</div>`;
    cell.onclick = ()=>selectFighter(c.id, cell);
    grid.appendChild(cell);
  });
}

function selectFighter(id, cellEl){
  const alreadySelected = selectedFighterId === id;
  document.querySelectorAll('.roster-cell').forEach(c=>c.classList.remove('selected'));
  if(alreadySelected){
    confirmSelection();
    return;
  }
  selectedFighterId = id;
  cellEl.classList.add('selected');
  const c = getById(id);
  document.getElementById('statPanel').classList.remove('hidden');
  document.getElementById('statName').textContent = c.name;
  document.getElementById('statHp').style.width = Math.min(100, c.hp/1.6)+'%';
  document.getElementById('statSpeed').style.width = (c.speed/9*100)+'%';
  document.getElementById('statReach').style.width = (c.reach/90*100)+'%';
  document.getElementById('statLight').style.width = (c.light/12*100)+'%';
  document.getElementById('statHeavy').style.width = (c.heavy/20*100)+'%';
  document.getElementById('statAi').style.width = (c.ai*100)+'%';
}

document.getElementById('confirmBtn').onclick = confirmSelection;
function confirmSelection(){
  if(!selectedFighterId) return;
  gameState.pickedId = selectedFighterId;
  gameState.ladder = buildLadder(selectedFighterId);
  gameState.currentRungIndex = 0;
  if(gameState.isFirstFightOfRun){
    startCutscene();
  } else {
    startVsScreen();
  }
}

const cutsceneCards = [
  "THE LOT NEVER SLEEPS. ONE FIGHTER STEPS IN. NINE ARE WAITING.",
  "EVERY WIN COSTS SOMETHING.",
  "CLIMB OR GET CLIMBED."
];
function startCutscene(){
  showScreen('cutsceneScreen');
  playMusic('song1.mp3');
  const cardEl = document.getElementById('cutsceneCard');
  const barFill = document.getElementById('cutsceneBarFill');
  const startTime = Date.now();
  const totalMs = 9000;
  let barInterval = setInterval(()=>{
    const elapsed = Date.now()-startTime;
    barFill.style.width = Math.min(100, (elapsed/totalMs)*100)+'%';
    if(elapsed >= totalMs){ clearInterval(barInterval); }
  }, 60);
  function showCard(i){
    if(i >= cutsceneCards.length){
      setTimeout(finishCutscene, 200);
      return;
    }
    cardEl.textContent = cutsceneCards[i];
    cardEl.classList.remove('show');
    requestAnimationFrame(()=>cardEl.classList.add('show'));
    setTimeout(()=>showCard(i+1), 3000);
  }
  showCard(0);
  document.getElementById('skipBtn').onclick = ()=>{ clearInterval(barInterval); finishCutscene(); };
}
function finishCutscene(){
  gameState.isFirstFightOfRun = false;
  startVsScreen();
}

function startVsScreen(){
  showScreen('vsScreen');
  const opponent = gameState.ladder[gameState.currentRungIndex];
  const isShadowTier = !!opponent.shadow;
  const player = getById(gameState.pickedId);
  document.getElementById('vsPlayerImg').src = `assets/${player.id}_profile.jpeg`;
  document.getElementById('vsPlayerName').textContent = player.name;
  document.getElementById('vsOpponentImg').src = isShadowTier ? '' : `assets/${opponent.mirror?opponent.sourceId:opponent.id}_profile.jpeg`;
  document.getElementById('vsOpponentName').textContent = isShadowTier ? '??? ??? ???' : opponent.name;
  document.getElementById('vsRung').textContent = isShadowTier ? 'SHADOW TIER' : `RUNG ${opponent.rung} / ${ROSTER.length}`;
  document.getElementById('vsTaunt').textContent = isShadowTier ? '???' : opponent.taunt;
  if(isShadowTier || (opponent.mirror)) {
    playMusic('song2.mp3');
  } else {
    playMusic('song3.mp3');
  }
  setTimeout(()=>{ startFight(opponent); }, 2600);
}

let match = null;
function startFight(opponentData){
  showScreen('fightScreen');
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  const playerData = getById(gameState.pickedId);
  const p1 = new Fighter(playerData, 260, 1, false, null);
  const tint = opponentData.mirror ? 'rgba(255,40,40,0.35)' : (opponentData.shadow ? 'rgba(180,0,0,0.4)' : null);
  const p2 = new Fighter(opponentData, 700, -1, true, tint);
  p1.loadImages('assets'); p2.loadImages('assets');
  match = {
    p1, p2, round:1, timeLeft:ROUND_TIME, roundActive:false, matchOver:false,
    difficultyMult: computeDifficultyMult(opponentData)
  };
  document.getElementById('hudP1Name').textContent = p1.name;
  document.getElementById('hudP2Name').textContent = p2.name;
  renderPips(document.getElementById('hudP1Pips'), 0);
  renderPips(document.getElementById('hudP2Pips'), 0);
  showRoundCallout('ROUND 1', ()=>showRoundCallout('FIGHT', startRound));
}

function computeDifficultyMult(opponentData){
  const rungMult = opponentData.rung ? 1 + (opponentData.rung-1)*0.045 : 1.3;
  return rungMult * Progress.difficultyMult();
}

function renderPips(el, wins){
  el.innerHTML = '';
  for(let i=0;i<2;i++){
    const s = document.createElement('span');
    if(i<wins) s.classList.add('filled');
    el.appendChild(s);
  }
}

function showRoundCallout(text, cb){
  const el = document.getElementById('roundCallout');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(()=>{ el.classList.remove('show'); if(cb) cb(); }, 900);
}

function startRound(){
  match.p1.hp = match.p1.maxHp; match.p2.hp = match.p2.maxHp;
  match.p1.x = 260; match.p2.x = 700;
  match.p1.state='idle'; match.p2.state='idle';
  match.timeLeft = ROUND_TIME;
  match.roundActive = true;
  lastTs = performance.now();
  requestAnimationFrame(gameLoop);
  clearInterval(match._clockInterval);
  match._clockInterval = setInterval(()=>{
    if(!match.roundActive || gameState.paused) return;
    match.timeLeft--;
    document.getElementById('hudClock').textContent = Math.max(0, match.timeLeft);
    if(match.timeLeft <= 0){ endRound(match.p1.hp >= match.p2.hp ? match.p1 : match.p2); }
  }, 1000);
}

function gameLoop(ts){
  if(!match || match.matchOver) return;
  const dt = Math.min(40, ts - lastTs);
  lastTs = ts;
  if(!gameState.paused && match.roundActive){
    updateMatch(dt);
  }
  drawMatch();
  requestAnimationFrame(gameLoop);
}

function updateMatch(dt){
  const { p1, p2 } = match;
  handlePlayerInput(p1, p2);
  updateAI(p2, p1, dt, match.difficultyMult);
  p1.update(dt, p2, {l:STAGE_L, r:STAGE_R});
  p2.update(dt, p1, {l:STAGE_L, r:STAGE_R});
  document.getElementById('hudP1Hp').style.width = (p1.hp/p1.maxHp*100)+'%';
  document.getElementById('hudP2Hp').style.width = (p2.hp/p2.maxHp*100)+'%';
  document.getElementById('hudP1Meter').style.width = (p1.meter/p1.maxMeter*100)+'%';
  document.getElementById('hudP2Meter').style.width = (p2.meter/p2.maxMeter*100)+'%';
  Input.latch();
  if(p1.hp <= 0 && match.roundActive){ endRound(p2); }
  else if(p2.hp <= 0 && match.roundActive){ endRound(p1); }
}

function handlePlayerInput(p1, p2){
  if(['hitstun','ko','punch','kick','special'].includes(p1.state)) {
    p1.blocking = false;
    return;
  }
  if(Input.left){ p1.x -= p1.speed*0.045; }
  if(Input.right){ p1.x += p1.speed*0.045; }
  if(Input.pressedUp() && !p1.jumping){ p1.jumping = true; p1.vy = -14; p1.setState('jump', 0); }
  p1.crouching = Input.down && !p1.jumping;
  p1.blocking = Input.block;
  if(p1.blocking){ p1.setState('block', 0); }
  else if(!p1.jumping && p1.state==='block'){ p1.setState('idle',0); }
  if(Input.pressedPunch()){ p1.tryAttack('punch', p2); }
  else if(Input.pressedKick()){ p1.tryAttack('kick', p2); }
  else if(Input.pressedSpecial()){ p1.tryAttack('special', p2); }
  if(Input.pressedPause()){ togglePause(); }
  pollGamepad();
}

function drawMatch(){
  const { p1, p2 } = match;
  ctx.fillStyle = '#1a1010';
  ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  ctx.fillStyle = '#0d0808';
  ctx.fillRect(0, GROUND_Y+140, CANVAS_W, 60);
  ctx.strokeStyle = '#3a1a1a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0,GROUND_Y+140); ctx.lineTo(CANVAS_W,GROUND_Y+140); ctx.stroke();
  drawFighter(p1);
  drawFighter(p2);
}

function poseForFighter(f){
  if(f.state === 'hitstun' || f.state === 'block') return 'front';
  if(f.state === 'punch' || f.state === 'kick' || f.state === 'special') return 'side';
  if(Math.abs(f.vx) > 2 && f.jumping) return 'back';
  return f.facing === 1 ? 'front' : 'side';
}

function drawFighter(f){
  const pose = poseForFighter(f);
  const img = f.images[pose] || f.images.front;
  const w = f.width*2.4, h = f.height*1.6;
  ctx.save();
  ctx.translate(f.x, f.y - h + 40);
  if(f.facing === -1 && pose !== 'side'){ ctx.scale(-1,1); ctx.translate(-w,0); }
  if(f.flashTimer > 0){ ctx.filter = 'brightness(2) saturate(0)'; }
  if(img && img.complete && img.naturalWidth > 0){
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#552222';
    ctx.fillRect(0,0,w,h);
  }
  ctx.filter = 'none';
  if(f.tint){
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = f.tint;
    ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation = 'source-over';
  }
  if(f.specialGlow > 0){
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.arc(w/2, h/2, w*0.6, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  drawSkeletonOverlay(f, pose, w, h);
}

function drawSkeletonOverlay(f, pose, w, h){
  ctx.save();
  ctx.translate(f.x, f.y - h + 40);
  if(f.facing === -1 && pose !== 'side'){ ctx.scale(-1,1); ctx.translate(-w,0); }
  if(f.state === 'punch'){
    ctx.strokeStyle = 'rgba(255,60,60,0.55)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(w*0.5,h*0.35); ctx.lineTo(w*0.85,h*0.32); ctx.stroke();
  } else if(f.state === 'kick'){
    ctx.strokeStyle = 'rgba(255,140,60,0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(w*0.5,h*0.7); ctx.lineTo(w*0.9,h*0.62); ctx.stroke();
  } else if(f.state === 'special'){
    drawWeaponSpecial(f, w, h);
  }
  ctx.restore();
}

function drawWeaponSpecial(f, w, h){
  const weapon = f.data.weapon || 'fist';
  const glow = f.data.shadow || f.data.mirror ? 'rgba(255,20,20,0.85)' : 'rgba(80,200,255,0.85)';
  ctx.lineCap = 'round';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;
  switch(weapon){
    case 'katana':
      ctx.strokeStyle = 'rgba(230,230,240,0.95)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(w*0.4,h*0.55); ctx.lineTo(w*1.05,h*0.15); ctx.stroke();
      ctx.strokeStyle = glow; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w*0.4,h*0.55); ctx.lineTo(w*1.05,h*0.15); ctx.stroke();
      break;
    case 'scythe':
    case 'bigscythe': {
      const scale = weapon === 'bigscythe' ? 1.3 : 1;
      ctx.strokeStyle = 'rgba(40,40,45,0.95)';
      ctx.lineWidth = 5*scale;
      ctx.beginPath(); ctx.moveTo(w*0.45,h*0.75); ctx.lineTo(w*0.55,h*0.05); ctx.stroke();
      ctx.strokeStyle = glow; ctx.lineWidth = 4*scale;
      ctx.beginPath(); ctx.arc(w*0.55, h*0.05, w*0.32*scale, Math.PI*0.1, Math.PI*1.1); ctx.stroke();
      break;
    }
    case 'chainscythe':
      ctx.strokeStyle = 'rgba(40,40,45,0.95)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(w*0.4,h*0.8); ctx.lineTo(w*0.5,h*0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w*0.6,h*0.8); ctx.lineTo(w*0.5,h*0.1); ctx.stroke();
      ctx.strokeStyle = glow; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(w*0.5, h*0.1, w*0.3, 0, Math.PI*2); ctx.stroke();
      break;
    case 'gun':
      ctx.fillStyle = 'rgba(30,30,30,0.95)';
      ctx.fillRect(w*0.55, h*0.32, w*0.35, h*0.06);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(w*0.92, h*0.35, 14, 0, Math.PI*2); ctx.fill();
      break;
    case 'bat':
      ctx.strokeStyle = 'rgba(160,110,60,0.95)';
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(w*0.45,h*0.6); ctx.lineTo(w*0.95,h*0.25); ctx.stroke();
      break;
    case 'mic':
      ctx.strokeStyle = 'rgba(200,200,200,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(w*0.5,h*0.5); ctx.lineTo(w*0.85,h*0.3); ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,20,0.95)';
      ctx.beginPath(); ctx.arc(w*0.87, h*0.28, 10, 0, Math.PI*2); ctx.fill();
      break;
    case 'vape':
      ctx.fillStyle = 'rgba(200,220,255,0.5)';
      for(let i=0;i<5;i++){ ctx.beginPath(); ctx.arc(w*0.7+i*8, h*0.25-i*6, 10-i, 0, Math.PI*2); ctx.fill(); }
      break;
    case 'cd':
      ctx.strokeStyle = glow; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(w*0.8, h*0.35, 22, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w*0.8, h*0.35, 6, 0, Math.PI*2); ctx.stroke();
      break;
    default:
      ctx.strokeStyle = glow; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(w*0.45,h*0.3); ctx.lineTo(w*0.95,h*0.28); ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function endRound(winner){
  match.roundActive = false;
  clearInterval(match._clockInterval);
  winner.roundsWon++;
  const isP1 = winner === match.p1;
  renderPips(document.getElementById(isP1?'hudP1Pips':'hudP2Pips'), winner.roundsWon);
  showRoundCallout((isP1?match.p1.name:match.p2.name).toUpperCase()+' WINS ROUND', ()=>{
    if(winner.roundsWon >= 2){ endMatch(winner); }
    else { match.round++; showRoundCallout('ROUND '+match.round, ()=>showRoundCallout('FIGHT', startRound)); }
  });
}

function endMatch(winner){
  match.matchOver = true;
  const playerWon = winner === match.p1;
  pauseMusic();
  showScreen('winScreen');
  const opponentData = match.p2.data;
  document.getElementById('winPortrait').src = playerWon ? `assets/${match.p1.data.id}_profile.jpeg` : `assets/${(opponentData.mirror?opponentData.sourceId:opponentData.id)}_profile.jpeg`;
  document.getElementById('winTitle').textContent = playerWon ? (match.p1.name.toUpperCase()+' WINS') : (match.p2.name.toUpperCase()+' WINS');
  document.getElementById('winTaunt').textContent = playerWon ? 'The lot remembers this one.' : match.p2.data.taunt;
  const footageEl = document.getElementById('footageLink');
  const isFinalOrShadow = opponentData.id === 'wraith' || opponentData.shadow;
  if(playerWon && isFinalOrShadow){
    footageEl.classList.remove('hidden');
    footageEl.href = 'https://youtube.com/@bosthrowdown';
  } else {
    footageEl.classList.add('hidden');
  }
  document.getElementById('continueBtn').onclick = ()=>handleContinue(playerWon);
}

function handleContinue(playerWon){
  if(!playerWon){ goToTitle(); return; }
  gameState.currentRungIndex++;
  if(gameState.currentRungIndex < gameState.ladder.length){
    startVsScreen();
    return;
  }
  const clearedWraith = match.p2.data.id === 'wraith' || (match.p2.data.mirror && match.p2.data.sourceId==='wraith');
  if(clearedWraith){
    Progress.addClear();
  }
  const currentShadowUnlocked = Progress.shadowUnlockCount();
  if(match.p2.data.shadow){
    const idx = SHADOW_ROSTER.findIndex(s=>s.id === match.p2.data.id);
    if(idx === currentShadowUnlocked - 1){ Progress.unlockNextShadow(); }
  } else if(clearedWraith && currentShadowUnlocked === 0){
    Progress.unlockNextShadow();
  }
  const nextShadowIdx = Progress.shadowUnlockCount() - 1;
  if(clearedWraith || match.p2.data.shadow){
    const availableShadow = SHADOW_ROSTER[nextShadowIdx];
    if(availableShadow && shouldOfferNextShadow(match.p2.data)){
      startFight(availableShadow);
      return;
    }
  }
  goToTitle();
}

function shouldOfferNextShadow(justBeatenData){
  if(justBeatenData.id === 'wraith' && Progress.shadowUnlockCount() >= 1) return true;
  if(justBeatenData.id === 'shadowx' && Progress.shadowUnlockCount() >= 2) return true;
  if(justBeatenData.id === 'shadowtsspectre' && Progress.shadowUnlockCount() >= 3) return true;
  return false;
}

function togglePause(){
  gameState.paused = !gameState.paused;
  document.getElementById('pauseMenu').classList.toggle('hidden', !gameState.paused);
  if(gameState.paused) pauseMusic(); else resumeMusic();
}
document.getElementById('pauseIconBtn').onclick = togglePause;
document.getElementById('resumeBtn').onclick = togglePause;
document.getElementById('toTitleBtn').onclick = ()=>{ gameState.paused=false; document.getElementById('pauseMenu').classList.add('hidden'); match.matchOver = true; clearInterval(match._clockInterval); goToTitle(); };

let soundOn = true;
document.getElementById('soundToggleBtn').onclick = ()=>{
  soundOn = !soundOn;
  setMusicEnabled(soundOn);
  document.getElementById('soundToggleBtn').textContent = 'SOUND: '+(soundOn?'ON':'OFF');
};

['btnLeft','btnRight','btnUp','btnDown'].forEach(id=>{
  bindTouchButton(id, id.replace('btn','').toLowerCase());
});
bindTouchButton('btnBlock','block');
bindTouchButton('btnPunch','punch');
bindTouchButton('btnKick','kick');
bindTouchButton('btnSpecial','special');

window.addEventListener('load', ()=>{
  preloadAssets(()=>{
    showScreen('titleScreen');
    initTitleMeta();
    armTitleGate();
  });
});
