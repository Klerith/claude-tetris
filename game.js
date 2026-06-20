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
const nameInputSection = document.getElementById('name-input-section');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const highScoresSection = document.getElementById('high-scores-section');
const highScoresList = document.getElementById('high-scores-list');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');

// localStorage keys
const LS_SCORES = 'tetris-highscores';
const LS_BESTCOMBO = 'tetris-bestcombo';
const LS_MAXLINES = 'tetris-maxlines';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// combo tracking
let combo, maxLinesClear, currentNewEntryIndex;

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
    // track max lines in one clear
    if (cleared > maxLinesClear) maxLinesClear = cleared;
    // increment combo
    combo++;
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
  if (cleared === 0) {
    // reset combo when a piece locks without clearing any lines
    combo = 0;
  }
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

// ---- High Scores ----

function loadHighScores() {
  try {
    const raw = localStorage.getItem(LS_SCORES);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function saveHighScores(scores) {
  localStorage.setItem(LS_SCORES, JSON.stringify(scores));
}

function loadBestCombo() {
  return parseInt(localStorage.getItem(LS_BESTCOMBO) || '0', 10);
}

function loadMaxLines() {
  return parseInt(localStorage.getItem(LS_MAXLINES) || '0', 10);
}

function updateGlobalStats() {
  const bestCombo = Math.max(loadBestCombo(), combo);
  const maxLines = Math.max(loadMaxLines(), maxLinesClear);
  localStorage.setItem(LS_BESTCOMBO, String(bestCombo));
  localStorage.setItem(LS_MAXLINES, String(maxLines));
  bestComboEl.textContent = bestCombo;
  maxLinesEl.textContent = maxLines;
}

function refreshStatDisplay() {
  bestComboEl.textContent = loadBestCombo();
  maxLinesEl.textContent = loadMaxLines();
}

/**
 * Insert score into top-5 list. Returns the index of the new entry, or -1 if
 * it didn't make the top 5.
 */
function insertScore(name, scoreValue) {
  const scores = loadHighScores();
  // Tag the new entry with a unique sentinel so we can find it after sort.
  const newEntry = { name, score: scoreValue, _new: true };
  scores.push(newEntry);
  scores.sort((a, b) => b.score - a.score);
  const top5 = scores.slice(0, 5);
  // Remove sentinel before persisting.
  top5.forEach(e => delete e._new);
  saveHighScores(top5);
  // Re-find using the sentinel on the in-memory array (before it was deleted
  // from `top5` — but the reference still has _new removed, so use object identity).
  const idx = top5.indexOf(newEntry);
  return idx;
}

function renderHighScores(highlightIndex) {
  const scores = loadHighScores();
  highScoresList.innerHTML = '';
  if (scores.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No records yet';
    li.className = 'hs-empty';
    highScoresList.appendChild(li);
    return;
  }
  scores.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'hs-row' + (i === highlightIndex ? ' hs-highlight' : '');
    const rank = document.createElement('span');
    rank.className = 'hs-rank';
    rank.textContent = `#${i + 1}`;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'hs-name';
    nameSpan.textContent = entry.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'hs-score';
    scoreSpan.textContent = entry.score.toLocaleString();
    li.appendChild(rank);
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    highScoresList.appendChild(li);
  });
}

function showGameOverOverlay() {
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Score: ${score.toLocaleString()}`;

  // determine if score qualifies for top 5
  const existing = loadHighScores();
  const qualifies = existing.length < 5 || score >= existing[existing.length - 1].score;

  if (qualifies) {
    saveScoreBtn.disabled = false;
    nameInputSection.classList.remove('hidden');
    highScoresSection.classList.add('hidden');
    playerNameInput.value = '';
    // focus after overlay is visible
    setTimeout(() => playerNameInput.focus(), 50);
  } else {
    nameInputSection.classList.add('hidden');
    highScoresSection.classList.remove('hidden');
    currentNewEntryIndex = -1;
    renderHighScores(-1);
  }

  overlay.classList.remove('hidden');
}

function showStartOverlay() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = 'High Scores';
  nameInputSection.classList.add('hidden');
  highScoresSection.classList.remove('hidden');
  renderHighScores(-1);
  overlay.classList.remove('hidden');
}

saveScoreBtn.addEventListener('click', () => {
  if (saveScoreBtn.disabled) return;
  saveScoreBtn.disabled = true;
  const name = playerNameInput.value.trim() || 'Player';
  updateGlobalStats();
  currentNewEntryIndex = insertScore(name, score);
  nameInputSection.classList.add('hidden');
  highScoresSection.classList.remove('hidden');
  renderHighScores(currentNewEntryIndex);
});

playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveScoreBtn.click();
});

resetRecordsBtn.addEventListener('click', () => {
  localStorage.removeItem(LS_SCORES);
  localStorage.removeItem(LS_BESTCOMBO);
  localStorage.removeItem(LS_MAXLINES);
  refreshStatDisplay();
  renderHighScores(-1);
});

// ---- End High Scores ----

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  updateGlobalStats();
  showGameOverOverlay();
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
    nameInputSection.classList.add('hidden');
    highScoresSection.classList.add('hidden');
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
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxLinesClear = 0;
  currentNewEntryIndex = -1;
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
  if (!current || paused || gameOver) return;
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

// Show start screen with high scores before first game
refreshStatDisplay();
showStartOverlay();
