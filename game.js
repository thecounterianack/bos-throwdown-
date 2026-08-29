'use strict';

/* ============================================================
BOS THROWDOWN - GAME
Loader, skull, Jung cutscene, screen flow, combat loop,
render, tower progression, global controller navigation.
============================================================ */

/* ==================== ASSET MANIFEST + LOADER ==================== */
const IMAGE_JOBS = [];
ROSTER.forEach(c => POSES.forEach(p => IMAGE_JOBS.push([c.id, p])));
SHADOW_ROSTER.forEach(c => POSES.forEach(p => IMAGE_JOBS.push([c.id, p])));
const AUDIO_JOBS = ['song1.mp3', 'song2.mp3', 'song3.mp3'];
const TOTAL_JOBS = IMAGE_JOBS.length + AUDIO_JOBS.length;

let jobsDone = 0;

function tickLoader(){
  jobsDone++;
  const pct = Math.round(jobsDone / TOTAL_JOBS * 100);
  const fill = document.getElementById('loadingBarFill');
  const pctEl = document.getElementById('loadingPct');
  if (fill) fill.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
}

async function preloadAssets(){
  const sub = document.getElementById('loadingSub');
  if (sub) sub.textContent = 'LOADING THE LOT...';

  // batches of 6 so mobile does not choke decoding 48 photos at once
  for (let i = 0; i < IMAGE_JOBS.length; i += 6){
    const batch = IMAGE_JOBS.slice(i, i + 6);
    await Promise.all(batch.map(([id, pose]) => loadImageAsset(id, pose).then(tickLoader)));
  }

  if (sub) sub.textContent = 'LOADING AUDIO...';
  await Promise.all(AUDIO_JOBS.map(n => loadAudioAsset(n).then(tickLoader)));

  if (loadFailures.length){
    if (sub) sub.textContent = loadFailures.length + ' FILE(S) FAILED TO LOAD';
    const box = document.getElementById('loadFailBox');
    const list = document.getElementById('loadFailList');
    list.innerHTML = loadFailures.map(f => '&bull; ' + f).join('');
    box.classList.remove('hidden');
    document.getElementById('loadAnywayBtn').onclick = goToTitle;
    Nav.refresh();
  } else {
    if (sub) sub.textContent = 'THE LOT IS READY';
    setTimeout(goToTitle, 450);
  }
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  if (typeof fitAllStages === 'function') fitAllStages();
  Nav.idx = 0;
  Nav.refresh();
}

function currentScreenId(){
  const el = document.querySelector('.screen.active');
  return el ? el.id : null;
}

/* ==================== 8-BIT SKULL ==================== */
const SKULL = [
'...######...',
'..########..',
'.##########.',
'############',
'##.##..##.##',
'##.##..##.##',
'############',
'############',
'.#.######.#.',
'..########..',
'..#.#..#.#..',
'...######...'
];
let skullCtx = null;

function drawSkull(ts){
  if (!skullCtx) return;
  const c = skullCtx.canvas;
  const cell = c.width / SKULL[0].length;
  skullCtx.clearRect(0, 0, c.width, c.height);

  const pulse = 0.55 + 0.45 * Math.sin(ts * 0.0022);
  const eyeOn = (Math.floor(ts / 640) % 6) !== 0;

  for (let y = 0; y < SKULL.length; y++){
    for (let x = 0; x < SKULL[y].length; x++){
      if (SKULL[y][x] === '.') continue;
      skullCtx.fillStyle = '#d8d2c8';
      skullCtx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    }
  }
  if (eyeOn){
    skullCtx.fillStyle = 'rgba(255,42,42,' + pulse.toFixed(2) + ')';
    skullCtx.fillRect(3 * cell, 4 * cell, cell, 2 * cell);
    skullCtx.fillRect(8 * cell, 4 * cell, cell, 2 * cell);
  }
}

/* ==================== GAME STATE ==================== */
let gameState = {
  pickedId: null,
  ladder: [],
  currentRungIndex: 0,
  isFirstFightOfRun: true,
  paused: false,
  inShadowGauntlet: false
};

function initTitleMeta(){
  const el = document.getElementById('metaProgress');
  const pct = Math.round((Progress.difficultyMult - 1) * 100);
  el.innerHTML =
    'TOWER CLEARS: ' + Progress.towerClears + '<br>' +
    'SHADOW TIER: ' + Progress.shadowUnlockCount + ' / ' + SHADOW_ROSTER.length + ' UNLOCKED' +
    (pct > 0 ? '<br>FIGHTERS ARE ' + pct + '% HARDER' : '');
}

function goToTitle(){
  if (match){ match.matchOver = true; clearInterval(match.clockInterval); match = null; }
  showScreen('titleScreen');
  initTitleMeta();
  playMusic('song3.mp3');
  gameState.isFirstFightOfRun = true;
  gameState.inShadowGauntlet = false;
  gameState.paused = false;
  document.getElementById('pauseMenu').classList.add('hidden');
  titleGateArmed = true;
}

/* ---- title tap gate: unlocks browser audio ---- */
let titleGateArmed = true;

function fireTitleGate(){
  if (!titleGateArmed || currentScreenId() !== 'titleScreen') return;
  titleGateArmed = false;
  unlockAudioContext();
  const overlay = document.getElementById('tapGateOverlay');
  overlay.classList.add('show');
  setTimeout(() => { overlay.classList.remove('show'); goToSelect(); }, 1400);
}
document.getElementById('titleScreen').addEventListener('pointerdown', fireTitleGate);

/* ==================== SELECT ==================== */
let selectedFighterId = null;

function goToSelect(){
  showScreen('selectScreen');
  renderRosterGrid();
}

function artToElement(art, w, h){
  if (!art) return null;
  if (art instanceof HTMLCanvasElement){
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const cx = out.getContext('2d');
    const s = Math.min(w / art.width, h / art.height);
    cx.drawImage(art, (w - art.width*s)/2, (h - art.height*s)/2, art.width*s, art.height*s);
    return out;
  }
  const im = document.createElement('img');
  im.src = art.src;
  return im;
}

function renderRosterGrid(){
  const grid = document.getElementById('rosterGrid');
  grid.innerHTML = '';
  ROSTER.forEach(c => {
    const cell = document.createElement('div');
    cell.className = 'roster-cell focusable';
    cell.dataset.fid = c.id;

    const art = getArt(c.id, 'front');
    const node = artToElement(art, 160, 120);
    if (node) cell.appendChild(node);
    else {
      const ph = document.createElement('div');
      ph.style.cssText = 'width:100%;height:88px;background:#3a1414;';
      cell.appendChild(ph);
    }

    const nm = document.createElement('div');
    nm.className = 'rc-name'; nm.textContent = c.name;
    const rg = document.createElement('div');
    rg.className = 'rc-rung'; rg.textContent = 'RUNG ' + c.rung;
    cell.appendChild(nm); cell.appendChild(rg);

    cell.onclick = () => selectFighter(c.id, cell);
    grid.appendChild(cell);
  });
  Nav.refresh();
}

function selectFighter(id, cellEl){
  const already = selectedFighterId === id;
  document.querySelectorAll('.roster-cell').forEach(c => c.classList.remove('selected'));
  if (already){ confirmSelection(); return; }

  selectedFighterId = id;
  cellEl.classList.add('selected');
  const c = getById(id);

  document.getElementById('statPanel').classList.remove('hidden');
  document.getElementById('statName').textContent = c.name;
  document.getElementById('statHp').style.width = Math.min(100, (c.hp / 180) * 100) + '%';
  document.getElementById('statSpeed').style.width = Math.min(100, (c.speed / 9) * 100) + '%';
  document.getElementById('statReach').style.width = Math.min(100, (c.reach / 90) * 100) + '%';
  document.getElementById('statLight').style.width = Math.min(100, (c.light / 13) * 100) + '%';
  document.getElementById('statHeavy').style.width = Math.min(100, (c.heavy / 20) * 100) + '%';
  document.getElementById('statAi').style.width = Math.min(100, c.ai * 100) + '%';
  document.getElementById('statWeapon').textContent = 'SPECIAL WEAPON: ' + String(c.weapon).toUpperCase();
  Nav.refresh();
}

document.getElementById('confirmBtn').onclick = confirmSelection;

function confirmSelection(){
  if (!selectedFighterId) return;
  gameState.pickedId = selectedFighterId;
  gameState.ladder = buildLadder(selectedFighterId);
  gameState.currentRungIndex = 0;
  gameState.inShadowGauntlet = false;
  if (gameState.isFirstFightOfRun) startCutscene();
  else startVsScreen();
}

/* ==================== JUNG CUTSCENE (75s, synced to song1) ==================== */
const INTRO_CARDS = [
[0, 'CARL JUNG CALLED IT THE SHADOW.', 'The unknown dark side of the personality. The part of you nobody asked you to approve.'],
[11, 'INSTINCTIVE. IRRATIONAL.', 'It takes what you can\u2019t stand about yourself and goes looking for it in somebody else.'],
[19, 'THAT\u2019S CALLED PROJECTION.', 'Every fight that ever started in this lot started right there.'],
[26, 'A VEIL THAT KEEPS THICKENING.', 'Your ego on one side. The real world on the other. Everybody carries one.'],
[35, 'THE LESS YOU LIVE WITH IT,', 'the blacker and denser it gets. Jung wrote that. He never had to prove it in a parking lot.'],
[44, 'SO WE DON\u2019T RUN FROM OURS.', 'That is why they call us the BROTHERS OF SHADOW.'],
[51, 'WE FIGHT THE DEMON HEAD ON.', 'The demon fights back. It always fights back \u2014 you never get fully rid of it.'],
[60, 'EVERYBODY HAS A SHADOW.', 'Accept that and you get accepted in. Nine deep, one leader, and the leader gets decided tonight.'],
[68, 'THEY TRY TO SHORTEN MY LIFESPAN.', 'I never wanted the fight. It came my way anyway. So I stand my ground.']
];
const INTRO_LEN = 75;

let introRaf = null, introTrack = null, introFallbackStart = 0, introIndex = -1;

function startCutscene(){
  showScreen('cutsceneScreen');
  introIndex = -1;
  introFallbackStart = performance.now();
  introTrack = playMusic('song1.mp3', 0);
  document.getElementById('cutsceneCardA').classList.remove('show');
  document.getElementById('cutsceneCardB').classList.remove('show');
  cancelAnimationFrame(introRaf);
  introRaf = requestAnimationFrame(introLoop);
}

/* drive off the song's real clock so text can never drift from audio */
function introClock(){
  if (introTrack && !introTrack.paused && introTrack.currentTime > 0) return introTrack.currentTime;
  return (performance.now() - introFallbackStart) / 1000;
}

function introLoop(){
  if (currentScreenId() !== 'cutsceneScreen') return;
  const sec = introClock();

  let ix = 0;
  for (let i = 0; i < INTRO_CARDS.length; i++){
    if (sec >= INTRO_CARDS[i][0]) ix = i;
  }

  if (ix !== introIndex){
    introIndex = ix;
    const a = document.getElementById('cutsceneCardA');
    const b = document.getElementById('cutsceneCardB');
    a.classList.remove('show'); b.classList.remove('show');
    setTimeout(() => {
      if (introIndex !== ix) return;
      a.textContent = INTRO_CARDS[ix][1];
      b.textContent = INTRO_CARDS[ix][2];
      a.classList.add('show'); b.classList.add('show');
    }, 240);
  }

  document.getElementById('cutsceneBarFill').style.width =
    Math.min(100, sec / INTRO_LEN * 100) + '%';

  if (sec >= INTRO_LEN){ finishCutscene(); return; }
  introRaf = requestAnimationFrame(introLoop);
}

function finishCutscene(){
  cancelAnimationFrame(introRaf);
  gameState.isFirstFightOfRun = false;
  startVsScreen();
}
document.getElementById('skipBtn').onclick = finishCutscene;

/* ==================== VS SCREEN ==================== */
function paintPortrait(imgEl, artId, pose){
  const art = getArt(artId, pose);
  if (!art){ imgEl.removeAttribute('src'); return; }
  try {
    imgEl.src = (art instanceof HTMLCanvasElement) ? art.toDataURL('image/png') : art.src;
  } catch(e){
    if (art.src) imgEl.src = art.src;
  }
}

let vsPending = null;

function startVsScreen(){
  showScreen('vsScreen');
  const opponent = gameState.ladder[gameState.currentRungIndex];
  const hideName = !!opponent.shadow && !opponent.mirror;
  const player = getById(gameState.pickedId);

  paintPortrait(document.getElementById('vsPlayerImg'), player.id, 'profile');
  document.getElementById('vsPlayerName').textContent = player.name;
  paintPortrait(document.getElementById('vsOpponentImg'), artIdFor(opponent), 'profile');
  document.getElementById('vsOpponentName').textContent = hideName ? '??? ??? ???' : opponent.name;

  document.getElementById('vsRung').textContent = gameState.inShadowGauntlet
    ? 'SHADOW TIER'
    : 'RUNG ' + (gameState.currentRungIndex + 1) + ' OF ' + gameState.ladder.length;
  document.getElementById('vsTaunt').textContent = hideName ? '???' : (opponent.taunt || '');

  // song1 rides straight out of the cutscene into fight one
  if (opponent.shadow || opponent.id === 'wraith') playMusic('song2.mp3');
  else if (currentTrackName !== 'song1.mp3') playMusic('song3.mp3');

  vsPending = opponent;
  document.getElementById('vsBeginBtn').onclick = () => { if (vsPending) startFight(vsPending); };
  Nav.refresh();
}

/* ==================== FIGHT ==================== */
let match = null;

function startFight(opponentData){
  vsPending = null;
  showScreen('fightScreen');
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  const playerData = getById(gameState.pickedId);
  const p1 = new Fighter(playerData, 300, 1, false, null);
  const tint = opponentData.mirror ? 'rgba(255,40,40,0.32)'
    : opponentData.shadow ? 'rgba(180,0,0,0.42)' : null;
  const p2 = new Fighter(opponentData, 660, -1, true, tint);

  match = {
    p1: p1, p2: p2, round: 1, timeLeft: ROUND_TIME,
    roundActive: false, matchOver: false,
    difficultyMult: computeDifficultyMult(opponentData),
    clockInterval: null
  };

  document.getElementById('hudP1Name').textContent = p1.name;
  document.getElementById('hudP2Name').textContent =
    (opponentData.shadow && !opponentData.mirror) ? '???' : p2.name;
  renderPips(document.getElementById('hudP1Pips'), 0);
  renderPips(document.getElementById('hudP2Pips'), 0);
  document.getElementById('hudClock').textContent = ROUND_TIME;

  if (opponentData.shadow || opponentData.id === 'wraith') playMusic('song2.mp3');

  showRoundCallout('ROUND 1', () => showRoundCallout('FIGHT', startRound));
}

function computeDifficultyMult(d){
  const rungMult = d.rung ? 1 + (d.rung - 1) * 0.045 : 1.3;
  return rungMult * Progress.difficultyMult;
}

function renderPips(el, wins){
  el.innerHTML = '';
  for (let i = 0; i < 2; i++){
    const s = document.createElement('span');
    if (i < wins) s.classList.add('filled');
    el.appendChild(s);
  }
}

function showRoundCallout(text, cb){
  const el = document.getElementById('roundCallout');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); if (cb) cb(); }, 950);
}

function startRound(){
  const m = match;
  if (!m) return;
  m.p1.hp = m.p1.maxHp; m.p2.hp = m.p2.maxHp;
  m.p1.x = 300; m.p2.x = 660;
  m.p1.y = GROUND_Y; m.p2.y = GROUND_Y;
  m.p1.setState('idle'); m.p2.setState('idle');
  m.p1.meter = 0; m.p2.meter = 0;
  m.p1.stun = 0; m.p2.stun = 0;
  m.p1.jumping = false; m.p2.jumping = false;
  m.timeLeft = ROUND_TIME;
  m.roundActive = true;
  lastTs = performance.now();
  requestAnimationFrame(gameLoop);

  clearInterval(m.clockInterval);
  m.clockInterval = setInterval(() => {
    if (!m.roundActive || gameState.paused) return;
    m.timeLeft--;
    document.getElementById('hudClock').textContent = Math.max(0, m.timeLeft);
    if (m.timeLeft <= 0) endRound(m.p1.hp >= m.p2.hp ? m.p1 : m.p2);
  }, 1000);
}

function gameLoop(ts){
  if (!match || match.matchOver) return;
  const dt = Math.min(40, ts - lastTs);
  lastTs = ts;
  if (!gameState.paused && match.roundActive) updateMatch(dt);
  drawMatch();
  requestAnimationFrame(gameLoop);
}

function updateMatch(dt){
  const p1 = match.p1, p2 = match.p2;
  handlePlayerInput(p1, p2);
  updateAI(p2, p1, dt, match.difficultyMult);
  p1.update(dt, p2, STAGE_L, STAGE_R);
  p2.update(dt, p1, STAGE_L, STAGE_R);

  document.getElementById('hudP1Hp').style.width = (p1.hp / p1.maxHp * 100) + '%';
  document.getElementById('hudP2Hp').style.width = (p2.hp / p2.maxHp * 100) + '%';
  document.getElementById('hudP1Meter').style.width = (p1.meter / p1.maxMeter * 100) + '%';
  document.getElementById('hudP2Meter').style.width = (p2.meter / p2.maxMeter * 100) + '%';

  if (p1.hp <= 0 && match.roundActive) endRound(p2);
  else if (p2.hp <= 0 && match.roundActive) endRound(p1);
}

function handlePlayerInput(p1, p2){
  if (['hitstun','ko','punch','kick','special'].includes(p1.state)){
    p1.blocking = false;
    return;
  }

  if (Input.left) p1.vx -= p1.data.speed * 0.5;
  if (Input.right) p1.vx += p1.data.speed * 0.5;

  if (Input.pressed('up') && !p1.jumping){
    p1.jumping = true; p1.vy = -1.55; p1.setState('jump');
  }

  p1.crouching = Input.down && !p1.jumping;
  p1.blocking = Input.block;
  if (p1.blocking) p1.setState('block');
  else if (p1.state === 'block') p1.setState('idle');

  if (Input.pressed('punch')) p1.tryAttack('punch', p2);
  else if (Input.pressed('kick')) p1.tryAttack('kick', p2);
  else if (Input.pressed('special')) p1.tryAttack('special', p2);
}

function updateAI(a, p, dt, mult){
  if (a.state === 'hitstun' || a.state === 'ko') return;
  a.aiCD -= dt;
  if (a.aiCD > 0) return;
  if (['punch','kick','special'].includes(a.state)) return;

  const dist = Math.abs(a.x - p.x);
  const dir = p.x > a.x ? 1 : -1;
  const eAi = Math.min(0.98, a.data.ai * mult);
  a.aiCD = Math.max(80, (240 + Math.random() * 420) * (1 - eAi * 0.55));

  if (dist > a.data.reach * 1.15){
    a.vx += dir * a.data.speed * 0.55;
    a.blocking = false;
    if (a.state === 'block') a.setState('idle');
  } else {
    const r = Math.random();
    if (r < eAi * 0.26){
      a.blocking = true; a.setState('block');
    } else {
      a.blocking = false;
      if (a.meter >= a.maxMeter && r > 0.86) a.tryAttack('special', p);
      else if (r < 0.58) a.tryAttack('punch', p);
      else a.tryAttack('kick', p);
    }
  }
}

/* ==================== RENDER ==================== */
function drawMatch(){
  if (!match) return;
  const p1 = match.p1, p2 = match.p2;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  grad.addColorStop(0, '#140808');
  grad.addColorStop(1, '#2a1414');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, GROUND_Y);

  ctx.fillStyle = '#0d0808';
  ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);

  ctx.strokeStyle = '#3a1a1a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(CANVAS_W, GROUND_Y); ctx.stroke();

  // parking-lot perspective lines
  ctx.globalAlpha = 0.35;
  for (let x = 0; x <= CANVAS_W; x += 80){
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(CANVAS_W/2 + (x - CANVAS_W/2) * 2.2, CANVAS_H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // draw the further fighter first
  if (p1.x <= p2.x){ drawFighter(p1); drawFighter(p2); }
  else { drawFighter(p2); drawFighter(p1); }
}

function drawFighter(f){
  const pose = poseForFighter(f);
  const art = getArt(f.artId, pose);
  const r = f.rig();
  const isShadow = f.data.shadow || f.data.mirror;
  const boneCol = isShadow ? '#ff3a3a' : '#e2dcd2';
  const baseAlpha = f.flashTimer > 0 ? 0.62 : 1;

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.facing, 1);
  ctx.globalAlpha = baseAlpha;

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 2, f.width * 0.34, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // BACK limbs
  ctx.strokeStyle = boneCol;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.globalAlpha = baseAlpha * 0.65;
  ctx.beginPath();
  ctx.moveTo(0, r.hipY); ctx.lineTo(r.kneeL.x, r.kneeL.y); ctx.lineTo(r.legL.x, r.legL.y);
  ctx.moveTo(0, r.shY); ctx.lineTo(r.armL.x * 0.7, r.armL.y - 10); ctx.lineTo(r.armL.x, r.armL.y);
  ctx.stroke();
  ctx.globalAlpha = baseAlpha;

  // PHOTO BODY sits inside the rig
  if (art){
    const dh = f.height, dw = f.width;
    ctx.save();
    if (f.flashTimer > 0) ctx.filter = 'brightness(2) saturate(0)';
    ctx.drawImage(art, -dw / 2, -dh, dw, dh);
    ctx.filter = 'none';
    if (f.tint){
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = f.tint;
      ctx.fillRect(-dw / 2, -dh, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  } else {
    ctx.fillStyle = '#552222';
    ctx.fillRect(-f.width / 2, -f.height, f.width, f.height);
  }

  // FRONT limbs
  ctx.strokeStyle = boneCol;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, r.hipY); ctx.lineTo(r.kneeR.x, r.kneeR.y); ctx.lineTo(r.legR.x, r.legR.y);
  ctx.moveTo(0, r.shY); ctx.lineTo(r.elbowR.x, r.elbowR.y); ctx.lineTo(r.armR.x, r.armR.y);
  ctx.stroke();

  // hand joint
  ctx.fillStyle = boneCol;
  ctx.beginPath(); ctx.arc(r.armR.x, r.armR.y, 6, 0, Math.PI * 2); ctx.fill();

  // weapon spawns AT the animated hand, not a fixed coordinate
  if (f.state === 'special') drawWeapon(f, r.armR.x, r.armR.y, isShadow);

  // shadow rage aura
  if (isShadow && f.specialGlow > 0){
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.arc(0, -f.height * 0.5, f.width * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawWeapon(f, hx, hy, isShadow){
  const weapon = f.data.weapon || 'fist';
  const glow = isShadow ? 'rgba(255,20,20,0.9)' : 'rgba(80,200,255,0.9)';
  ctx.save();
  ctx.translate(hx, hy);
  ctx.lineCap = 'round';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;

  switch (weapon){
    case 'katana':
      ctx.strokeStyle = 'rgba(232,232,242,0.95)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(78,-46); ctx.stroke();
      ctx.strokeStyle = glow; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(78,-46); ctx.stroke();
      break;
    case 'scythe':
    case 'bigscythe': {
      const s = weapon === 'bigscythe' ? 1.35 : 1;
      ctx.strokeStyle = 'rgba(42,42,48,0.95)'; ctx.lineWidth = 6 * s;
      ctx.beginPath(); ctx.moveTo(0,14); ctx.lineTo(14,-76*s); ctx.stroke();
      ctx.strokeStyle = glow; ctx.lineWidth = 5 * s;
      ctx.beginPath(); ctx.arc(14,-76*s, 34*s, Math.PI*0.1, Math.PI*1.1); ctx.stroke();
      break;
    }
    case 'chainscythe':
      ctx.strokeStyle = 'rgba(42,42,48,0.95)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0,12); ctx.lineTo(12,-70); ctx.stroke();
      ctx.strokeStyle = glow; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(12,-70, 30, 0, Math.PI*2); ctx.stroke();
      break;
    case 'gun':
      ctx.fillStyle = 'rgba(30,30,30,0.95)';
      ctx.fillRect(0,-8, 44, 11);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(52,-3, 13, 0, Math.PI*2); ctx.fill();
      break;
    case 'bat':
      ctx.strokeStyle = 'rgba(162,112,60,0.95)'; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(0,6); ctx.lineTo(58,-30); ctx.stroke();
      break;
    case 'mic':
      ctx.strokeStyle = 'rgba(200,200,200,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(40,-22); ctx.stroke();
      ctx.fillStyle = 'rgba(22,22,22,0.95)';
      ctx.beginPath(); ctx.arc(44,-25, 11, 0, Math.PI*2); ctx.fill();
      break;
    case 'vape':
      ctx.fillStyle = 'rgba(200,220,255,0.5)';
      for (let i = 0; i < 5; i++){
        ctx.beginPath(); ctx.arc(18 + i*13, -14 - i*9, 11 - i, 0, Math.PI*2); ctx.fill();
      }
      break;
    case 'cd':
      ctx.strokeStyle = glow; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(44,-18, 22, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(44,-18, 6, 0, Math.PI*2); ctx.stroke();
      break;
    default:
      ctx.strokeStyle = glow; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(46,-4); ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

/* ==================== ROUND / MATCH FLOW ==================== */
function endRound(winner){
  if (!match || !match.roundActive) return;
  match.roundActive = false;
  clearInterval(match.clockInterval);
  winner.roundsWon++;

  const isP1 = winner === match.p1;
  renderPips(document.getElementById(isP1 ? 'hudP1Pips' : 'hudP2Pips'), winner.roundsWon);

  showRoundCallout(winner.name.toUpperCase() + ' WINS ROUND', () => {
    if (winner.roundsWon >= 2) endMatch(winner);
    else {
      match.round++;
      showRoundCallout('ROUND ' + match.round, () => showRoundCallout('FIGHT', startRound));
    }
  });
}

function endMatch(winner){
  match.matchOver = true;
  clearInterval(match.clockInterval);
  const playerWon = winner === match.p1;
  const opp = match.p2.data;
  const me = match.p1.data;

  showScreen('winScreen');
  paintPortrait(
    document.getElementById('winPortrait'),
    playerWon ? match.p1.artId : match.p2.artId,
    'profile'
  );
  document.getElementById('winTitle').textContent =
    (playerWon ? match.p1.name : match.p2.name).toUpperCase() + ' WINS';
  document.getElementById('winSub').textContent =
    playerWon ? 'SPECIAL WEAPON: ' + String(me.weapon).toUpperCase() : 'RUN THE LADDER AGAIN';
  document.getElementById('winTaunt').textContent =
    playerWon ? 'The lot remembers this one. Keep climbing.' : (opp.taunt || 'The lot remembers.');

  document.getElementById('continueBtn').onclick = () => handleContinue(playerWon, opp);
  playMusic('song3.mp3');
  Nav.refresh();
}

function handleContinue(playerWon, opp){
  if (!playerWon){ goToTitle(); return; }

  // already inside the shadow gauntlet
  if (gameState.inShadowGauntlet){
    const idx = SHADOW_ROSTER.findIndex(s => s.id === opp.id);
    if (idx === Progress.shadowUnlockCount - 1) Progress.unlockNextShadow();
    const next = SHADOW_ROSTER[Progress.shadowUnlockCount - 1];
    if (next && next.id !== opp.id){ startFight(next); return; }
    goToTitle();
    return;
  }

  gameState.currentRungIndex++;
  if (gameState.currentRungIndex < gameState.ladder.length){
    startVsScreen();
    return;
  }

  // tower cleared
  Progress.addClear();
  if (Progress.shadowUnlockCount === 0) Progress.unlockNextShadow();
  const firstShadow = SHADOW_ROSTER[Progress.shadowUnlockCount - 1];
  if (firstShadow){
    gameState.inShadowGauntlet = true;
    startFight(firstShadow);
  } else {
    goToTitle();
  }
}

/* ==================== PAUSE / SOUND ==================== */
function togglePause(){
  if (currentScreenId() !== 'fightScreen') return;
  gameState.paused = !gameState.paused;
  document.getElementById('pauseMenu').classList.toggle('hidden', !gameState.paused);
  if (gameState.paused) pauseMusic(); else resumeMusic();
  Nav.idx = 0;
  Nav.refresh();
}

document.getElementById('pauseIconBtn').onclick = togglePause;
document.getElementById('resumeBtn').onclick = togglePause;
document.getElementById('toTitleBtn').onclick = () => {
  gameState.paused = false;
  document.getElementById('pauseMenu').classList.add('hidden');
  goToTitle();
};

let soundOn = true;
document.getElementById('soundToggleBtn').onclick = (e) => {
  e.stopPropagation();
  soundOn = !soundOn;
  setMusicEnabled(soundOn);
  document.getElementById('soundToggleBtn').textContent = 'SOUND: ' + (soundOn ? 'ON' : 'OFF');
};

['btnLeft','btnRight','btnUp','btnDown'].forEach(id =>
  bindTouchButton(id, id.replace('btn','').toLowerCase())
);
bindTouchButton('btnBlock','block');
bindTouchButton('btnPunch','punch');
bindTouchButton('btnKick','kick');
bindTouchButton('btnSpecial','special');

/* ==================== GLOBAL CONTROLLER NAVIGATION ====================
Runs on EVERY screen, not just during a fight.
====================================================================== */
const Nav = {
  items: [],
  idx: 0,

  refresh(){
    const screen = document.querySelector('.screen.active');
    if (!screen){ this.items = []; return; }

    let scope = screen;
    const pm = document.getElementById('pauseMenu');
    if (screen.id === 'fightScreen' && pm && !pm.classList.contains('hidden')) scope = pm;

    this.items = Array.from(scope.querySelectorAll('.focusable'))
      .filter(el => el.offsetParent !== null);
    if (this.idx >= this.items.length) this.idx = 0;
    this.paint();
  },

  paint(){
    document.querySelectorAll('.focused').forEach(e => e.classList.remove('focused'));
    const el = this.items[this.idx];
    if (el){
      el.classList.add('focused');
      if (el.scrollIntoView) el.scrollIntoView({ block:'nearest' });
    }
  },

  move(d){
    if (!this.items.length) return;
    this.idx = (this.idx + d + this.items.length) % this.items.length;
    this.paint();
  },

  activate(){
    const el = this.items[this.idx];
    if (el) el.click();
  }
};

function inputLoop(ts){
  pollGamepad();

  const screen = currentScreenId();
  const pm = document.getElementById('pauseMenu');
  const isPaused = pm && !pm.classList.contains('hidden');
  const inFight = screen === 'fightScreen' && !isPaused;

  if (screen === 'titleScreen'){
    drawSkull(ts);
    if (Input.pressed('confirm') || Input.pressed('punch')) fireTitleGate();
  }
  else if (!inFight){
    const cols = (screen === 'selectScreen') ? (window.innerWidth >= 700 ? 5 : 3) : 1;
    const movedRight = Input.pressed('right');
    const movedLeft = Input.pressed('left');
    const movedDown = Input.pressed('down');
    const movedUp = Input.pressed('up');

    if (movedRight) Nav.move(1);
    if (movedLeft) Nav.move(-1);
    if (movedDown) Nav.move(cols);
    if (movedUp) Nav.move(-cols);
    if (Input.pressed('confirm') || Input.pressed('punch')) Nav.activate();

    // roster focus doubles as a live stat preview
    if (screen === 'selectScreen' && (movedRight || movedLeft || movedDown || movedUp)){
      const el = Nav.items[Nav.idx];
      if (el && el.dataset && el.dataset.fid && el.dataset.fid !== selectedFighterId){
        selectFighter(el.dataset.fid, el);
      }
    }
    if (Input.pressed('pause') && screen === 'fightScreen') togglePause();
  }
  else {
    if (Input.pressed('pause')) togglePause();
  }

  Input.latch();
  requestAnimationFrame(inputLoop);
}

/* ==================== BOOT ==================== */
window.addEventListener('load', () => {
  const sc = document.getElementById('skullCanvas');
  if (sc) skullCtx = sc.getContext('2d');
  showScreen('loadingScreen');
  requestAnimationFrame(inputLoop);
  preloadAssets();
});
