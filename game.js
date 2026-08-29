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
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const startHighscoreList = document.getElementById('start-highscore-list');
const startCombo = document.getElementById('start-combo');
const startMaxLines = document.getElementById('start-maxlines');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const highscoreEntry = document.getElementById('highscore-entry');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayHighscoreList = document.getElementById('overlay-highscore-list');
const overlayCombo = document.getElementById('overlay-combo');
const overlayMaxLines = document.getElementById('overlay-maxlines');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let comboCount = 0, maxCombo = 0, gameStarted = false;
let resetConfirmPending = false;

// Highscore persistence: localStorage['tetris-highscores'] holds a single JSON
// object { scores: [{name, score}, ...] (top 5, desc), maxCombo, maxLines }.
const HIGHSCORE_KEY = 'tetris-highscores';

function loadHighscoreData() {
  try {
    const raw = localStorage.getItem(HIGHSCORE_KEY);
    if (!raw) return { scores: [], maxCombo: 0, maxLines: 0 };
    const data = JSON.parse(raw);
    const scores = Array.isArray(data.scores)
      ? data.scores
          .filter(entry => entry && typeof entry === 'object' && Number.isFinite(Number(entry.score)))
          .map(entry => ({ name: String(entry.name || 'JUGADOR'), score: Number(entry.score) }))
      : [];
    return {
      scores,
      maxCombo: Number(data.maxCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch (e) {
    return { scores: [], maxCombo: 0, maxLines: 0 };
  }
}

function saveHighscoreData(data) {
  localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(data));
}

function qualifiesForTop5(finalScore) {
  const data = loadHighscoreData();
  if (data.scores.length < 5) return true;
  return finalScore > data.scores[data.scores.length - 1].score;
}

function insertHighscore(name, finalScore) {
  const data = loadHighscoreData();
  const entry = { name: name || 'JUGADOR', score: finalScore };
  data.scores.push(entry);
  data.scores.sort((a, b) => b.score - a.score);
  data.scores = data.scores.slice(0, 5);
  const index = data.scores.indexOf(entry);
  saveHighscoreData(data);
  return index;
}

function renderHighscoreList(listEl, highlightIndex) {
  const data = loadHighscoreData();
  listEl.innerHTML = '';
  if (data.scores.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
    return;
  }
  data.scores.forEach((entry, i) => {
    const li = document.createElement('li');
    li.textContent = `${entry.name}: ${entry.score.toLocaleString()}`;
    if (i === highlightIndex) li.classList.add('highscore-current');
    listEl.appendChild(li);
  });
}

function renderStats(comboEl, linesEl2) {
  const data = loadHighscoreData();
  comboEl.textContent = `Mejor combo: ${data.maxCombo}`;
  linesEl2.textContent = `Líneas máximas: ${data.maxLines}`;
}

function resetHighscores() {
  localStorage.removeItem(HIGHSCORE_KEY);
  renderHighscoreList(startHighscoreList, -1);
  renderStats(startCombo, startMaxLines);
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

  if (cleared > 0) {
    comboCount++;
    if (comboCount > maxCombo) maxCombo = comboCount;
  } else {
    comboCount = 0;
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
  clearLines();
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

  const data = loadHighscoreData();
  let updated = false;
  if (maxCombo > data.maxCombo) { data.maxCombo = maxCombo; updated = true; }
  if (lines > data.maxLines) { data.maxLines = lines; updated = true; }
  if (updated) saveHighscoreData(data);

  renderStats(overlayCombo, overlayMaxLines);

  if (qualifiesForTop5(score)) {
    highscoreEntry.classList.remove('hidden');
    playerNameInput.value = '';
    renderHighscoreList(overlayHighscoreList, -1);
    setTimeout(() => playerNameInput.focus(), 0);
  } else {
    highscoreEntry.classList.add('hidden');
    renderHighscoreList(overlayHighscoreList, -1);
  }
}

function submitHighscore() {
  const name = playerNameInput.value.trim().slice(0, 12) || 'JUGADOR';
  const index = insertHighscore(name, score);
  renderHighscoreList(overlayHighscoreList, index);
  highscoreEntry.classList.add('hidden');
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
  comboCount = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  highscoreEntry.classList.add('hidden');
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

saveScoreBtn.addEventListener('click', submitHighscore);
playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') submitHighscore();
});

function handleResetClick() {
  if (!resetConfirmPending) {
    resetConfirmPending = true;
    resetScoresBtn.textContent = '¿Seguro?';
    setTimeout(() => {
      resetConfirmPending = false;
      resetScoresBtn.textContent = 'Resetear récords';
    }, 3000);
    return;
  }
  resetConfirmPending = false;
  resetScoresBtn.textContent = 'Resetear récords';
  resetHighscores();
}

resetScoresBtn.addEventListener('click', handleResetClick);

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

function showStartScreen() {
  renderHighscoreList(startHighscoreList, -1);
  renderStats(startCombo, startMaxLines);
  startScreen.classList.remove('hidden');
}

playBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  gameStarted = true;
  init();
});

showStartScreen();
