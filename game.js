'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const linesBefore = lines;
  clearLines();
  recordsOnLock(lines - linesBefore);
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  recordsOnGameOver();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  recordsOnInit();
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

const themeToggle = document.getElementById('theme-toggle');
const toggleIcon = themeToggle.querySelector('.toggle-icon');
const toggleLabel = themeToggle.querySelector('.toggle-label');

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    toggleIcon.textContent = '☀';
    toggleLabel.textContent = 'DARK';
  } else {
    document.body.classList.remove('light-mode');
    toggleIcon.textContent = '☾';
    toggleLabel.textContent = 'LIGHT';
  }
}

const savedTheme = localStorage.getItem('tetris-theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
});

// ---- Records (top 5 local, mejor combo, líneas máximas) ----
const HS_KEY = 'tetris-highscores';
const REC_KEY = 'tetris-records';
const HS_MAX = 5;
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const goRecords = document.getElementById('gameover-records');
const goEntry = document.getElementById('record-entry');
const goName = document.getElementById('record-name');
const goSave = document.getElementById('record-save');
const goTable = document.getElementById('gameover-table');
const goStats = document.getElementById('gameover-stats');
const startTable = document.getElementById('start-table');
const startStats = document.getElementById('start-stats');
let combo = 0, runBestCombo = 0, savedEntry = null;

function loadHighscores() {
  try {
    const a = JSON.parse(localStorage.getItem(HS_KEY));
    if (Array.isArray(a)) {
      return a.filter(e => e && typeof e.score === 'number')
        .map(e => ({ ...e, name: String(e.name ?? 'Anónimo').slice(0, 12), lines: +e.lines || 0, level: +e.level || 1 }))
        .sort((x, y) => y.score - x.score)
        .slice(0, HS_MAX);
    }
  } catch (e) {}
  return [];
}
function saveHighscores(list) {
  try { localStorage.setItem(HS_KEY, JSON.stringify(list)); } catch (e) {}
}
function loadRecordStats() {
  try {
    const o = JSON.parse(localStorage.getItem(REC_KEY));
    if (o && typeof o === 'object') return { bestCombo: +o.bestCombo || 0, maxLines: +o.maxLines || 0 };
  } catch (e) {}
  return { bestCombo: 0, maxLines: 0 };
}
function saveRecordStats(s) {
  try { localStorage.setItem(REC_KEY, JSON.stringify(s)); } catch (e) {}
}
function qualifiesForTop(s) {
  const list = loadHighscores();
  return s > 0 && (list.length < HS_MAX || s > list[list.length - 1].score);
}

function renderRecords(tableEl, statsEl, highlight) {
  tableEl.textContent = '';
  const list = loadHighscores();
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'rec-empty';
    p.textContent = 'Sin records todavía';
    tableEl.appendChild(p);
  } else {
    const ol = document.createElement('ol');
    ol.className = 'rec-list';
    list.forEach(e => {
      const li = document.createElement('li');
      if (highlight && e.date === highlight.date && e.score === highlight.score) li.className = 'rec-new';
      const n = document.createElement('span');
      n.className = 'rec-name';
      n.textContent = String(e.name);
      const s = document.createElement('span');
      s.className = 'rec-score';
      s.textContent = Number(e.score).toLocaleString();
      const d = document.createElement('span');
      d.className = 'rec-meta';
      d.textContent = `${e.lines} líneas · nv ${e.level}`;
      li.append(n, s, d);
      ol.appendChild(li);
    });
    tableEl.appendChild(ol);
  }
  const st = loadRecordStats();
  statsEl.textContent = `Mejor combo: ${st.bestCombo} · Líneas máximas: ${st.maxLines}`;
}

function recordsOnInit() {
  combo = 0;
  runBestCombo = 0;
  savedEntry = null;
  goRecords.classList.add('hidden');
}
function recordsOnLock(cleared) {
  if (cleared > 0) { combo++; if (combo > runBestCombo) runBestCombo = combo; }
  else combo = 0;
}
function recordsOnGameOver() {
  const st = loadRecordStats();
  if (runBestCombo > st.bestCombo) st.bestCombo = runBestCombo;
  if (lines > st.maxLines) st.maxLines = lines;
  saveRecordStats(st);
  goRecords.classList.remove('hidden');
  const q = qualifiesForTop(score);
  goEntry.classList.toggle('hidden', !q);
  renderRecords(goTable, goStats, null);
  if (q) { goName.value = ''; goName.focus(); }
}
function submitRecord() {
  if (savedEntry || !gameOver || !qualifiesForTop(score)) return;
  const entry = {
    name: goName.value.trim().slice(0, 12) || 'Anónimo',
    score, lines, level, date: new Date().toISOString(),
  };
  const list = loadHighscores();
  let i = list.findIndex(e => e.score < entry.score);
  if (i < 0) i = list.length;
  list.splice(i, 0, entry);
  list.length = Math.min(list.length, HS_MAX);
  saveHighscores(list);
  savedEntry = entry;
  goEntry.classList.add('hidden');
  renderRecords(goTable, goStats, entry);
}
function showStartScreen() {
  gameOver = true; // bloquea el teclado hasta pulsar Jugar
  renderRecords(startTable, startStats, null);
  startOverlay.classList.remove('hidden');
  startBtn.focus();
}
function startGame() {
  startOverlay.classList.add('hidden');
  init();
}

const resetBtn = document.getElementById('reset-records-btn');
const resetConfirm = document.getElementById('reset-confirm');
resetBtn.addEventListener('click', () => {
  resetBtn.classList.add('hidden');
  resetConfirm.classList.remove('hidden');
});
document.getElementById('reset-no').addEventListener('click', () => {
  resetConfirm.classList.add('hidden');
  resetBtn.classList.remove('hidden');
});
document.getElementById('reset-yes').addEventListener('click', () => {
  try { localStorage.removeItem(HS_KEY); localStorage.removeItem(REC_KEY); } catch (e) {}
  resetConfirm.classList.add('hidden');
  resetBtn.classList.remove('hidden');
  renderRecords(startTable, startStats, null);
});
startBtn.addEventListener('click', startGame);
goSave.addEventListener('click', submitRecord);
restartBtn.addEventListener('click', submitRecord, true); // no perder un record pendiente al reiniciar
goName.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') submitRecord();
});
document.addEventListener('keydown', e => {
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !startOverlay.classList.contains('hidden')
      && (e.target === startBtn || e.target.tagName !== 'BUTTON')) {
    e.preventDefault();
    startGame();
  }
});

showStartScreen();
