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

// High-score & stats elements
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const startHsBody = document.getElementById('start-hs-body');
const startBestCombo = document.getElementById('start-best-combo');
const startMaxLines = document.getElementById('start-max-lines');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const gameoverHs = document.getElementById('gameover-hs');
const gameoverHsBody = document.getElementById('gameover-hs-body');
const gameoverBestCombo = document.getElementById('gameover-best-combo');
const gameoverMaxLines = document.getElementById('gameover-max-lines');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');

const HS_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';
const MAX_SCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo;
let stats = loadStats();
let pendingRank = -1;

/* ---- High-score persistence ---- */
function loadHighscores() {
  try {
    const raw = JSON.parse(localStorage.getItem(HS_KEY));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(e => e && typeof e.name === 'string' && typeof e.score === 'number')
      .map(e => ({ name: e.name, score: e.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch {
    return [];
  }
}

function saveHighscores(list) {
  localStorage.setItem(HS_KEY, JSON.stringify(list.slice(0, MAX_SCORES)));
}

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY)) || {};
    return {
      bestCombo: Number.isFinite(raw.bestCombo) ? raw.bestCombo : 0,
      maxLines: Number.isFinite(raw.maxLines) ? raw.maxLines : 0,
    };
  } catch {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// Returns the 0-based rank the given score would occupy, or -1 if it doesn't qualify.
function rankFor(value) {
  if (value <= 0) return -1;
  const hs = loadHighscores();
  let i = 0;
  while (i < hs.length && hs[i].score >= value) i++;
  return i < MAX_SCORES ? i : -1;
}

/* ---- Rendering ---- */
function renderHighscores(bodyEl, highlightIndex) {
  bodyEl.textContent = '';
  const hs = loadHighscores();
  if (hs.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'hs-empty';
    td.textContent = 'Aún no hay récords';
    tr.appendChild(td);
    bodyEl.appendChild(tr);
    return;
  }
  hs.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('hs-highlight');
    const rankTd = document.createElement('td');
    rankTd.className = 'hs-rank';
    rankTd.textContent = (i + 1) + '.';
    const nameTd = document.createElement('td');
    nameTd.className = 'hs-name';
    nameTd.textContent = entry.name; // textContent: never innerHTML with user input
    const scoreTd = document.createElement('td');
    scoreTd.className = 'hs-score';
    scoreTd.textContent = Number(entry.score).toLocaleString();
    tr.append(rankTd, nameTd, scoreTd);
    bodyEl.appendChild(tr);
  });
}

function renderStats() {
  startBestCombo.textContent = stats.bestCombo;
  startMaxLines.textContent = stats.maxLines;
  gameoverBestCombo.textContent = stats.bestCombo;
  gameoverMaxLines.textContent = stats.maxLines;
}

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
  return cleared;
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
  const cleared = clearLines();
  let statsChanged = false;
  if (cleared > 0) {
    combo++;
    if (combo > stats.bestCombo) { stats.bestCombo = combo; statsChanged = true; }
    if (cleared > stats.maxLines) { stats.maxLines = cleared; statsChanged = true; }
  } else {
    combo = 0;
  }
  if (statsChanged) saveStats();
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

  gameoverHs.classList.remove('hidden');
  pendingRank = rankFor(score);
  if (pendingRank >= 0) {
    nameEntry.classList.remove('hidden');
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 0);
  } else {
    nameEntry.classList.add('hidden');
  }
  renderHighscores(gameoverHsBody, -1);
  renderStats();

  overlay.classList.remove('hidden');
}

function saveScore() {
  if (pendingRank < 0) return;
  let name = nameInput.value.trim().slice(0, 12);
  if (!name) name = 'Anónimo';
  const hs = loadHighscores();
  hs.splice(pendingRank, 0, { name, score });
  saveHighscores(hs);
  nameEntry.classList.add('hidden');
  renderHighscores(gameoverHsBody, pendingRank);
  pendingRank = -1;
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    nameEntry.classList.add('hidden');
    gameoverHs.classList.add('hidden');
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
  combo = 0;
  pendingRank = -1;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  nameEntry.classList.add('hidden');
  gameoverHs.classList.add('hidden');
  startOverlay.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!startOverlay.classList.contains('hidden') || !current) return; // start screen active
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

function showStartScreen() {
  renderHighscores(startHsBody, -1);
  renderStats();
  startOverlay.classList.remove('hidden');
}

startBtn.addEventListener('click', init);

saveScoreBtn.addEventListener('click', saveScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); saveScore(); }
});

resetScoresBtn.addEventListener('click', () => {
  localStorage.removeItem(HS_KEY);
  localStorage.removeItem(STATS_KEY);
  stats = loadStats();
  renderHighscores(startHsBody, -1);
  renderStats();
});

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

showStartScreen();
