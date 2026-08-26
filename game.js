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
  '#26a69a', // J - teal (blue-green)
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
  [[8,8,8],[8,0,8],[8,8,8]]                   // N - tuerca (hueco centro)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

let currentSkin = localStorage.getItem('tetris-skin') || 'retro';

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
const gameoverPanel = document.querySelector('.gameover-panel');
const pausePanel = document.querySelector('.pause-panel');
const controlsPanel = document.querySelector('.controls-panel');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const showControlsBtn = document.getElementById('show-controls-btn');
const backToPauseBtn = document.getElementById('back-to-pause-btn');
const startLevelSelect = document.getElementById('start-level-select');
const highscoreListEl = document.getElementById('highscore-list');
const gameoverHighscoreListEl = document.getElementById('gameover-highscore-list');
const bestComboEl = document.getElementById('best-combo');
const bestLinesEl = document.getElementById('best-lines');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, runStartLevel;
let combo = 0;
let bestCombo = getBestCombo();
let bestLines = getBestLines();

function getHighscores() {
  try {
    const raw = JSON.parse(localStorage.getItem('tetris-highscores'));
    if (!Array.isArray(raw)) return [];
    return raw.filter(h => h && typeof h.name === 'string' && Number.isFinite(h.score));
  } catch (e) {
    return [];
  }
}

function setHighscores(arr) {
  localStorage.setItem('tetris-highscores', JSON.stringify(arr));
}

function getBestCombo() {
  return parseInt(localStorage.getItem('tetris-best-combo'), 10) || 0;
}

function setBestCombo(n) {
  localStorage.setItem('tetris-best-combo', n);
}

function getBestLines() {
  return parseInt(localStorage.getItem('tetris-best-lines'), 10) || 0;
}

function setBestLines(n) {
  localStorage.setItem('tetris-best-lines', n);
}

let highscores = getHighscores();
let lastSavedEntry = null;

function renderHighscoreRow(h) {
  const li = document.createElement('li');
  li.textContent = `${h.name} — ${h.score.toLocaleString()}`;
  if (lastSavedEntry && h === lastSavedEntry) li.classList.add('new-record');
  return li;
}

function renderHighscores() {
  highscoreListEl.innerHTML = '';
  highscores.forEach(h => highscoreListEl.appendChild(renderHighscoreRow(h)));

  gameoverHighscoreListEl.innerHTML = '';
  if (!overlay.classList.contains('hidden') && gameOver) {
    highscores.forEach(h => gameoverHighscoreListEl.appendChild(renderHighscoreRow(h)));
  }
}

function renderStats() {
  bestComboEl.textContent = bestCombo;
  bestLinesEl.textContent = bestLines;
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
    level = runStartLevel + Math.floor(lines / 10);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (lines > bestLines) {
      bestLines = lines;
      setBestLines(bestLines);
      renderStats();
    }
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
  if (cleared > 0) {
    combo++;
    if (combo > bestCombo) {
      bestCombo = combo;
      setBestCombo(bestCombo);
      renderStats();
    }
  } else {
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

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function pastelize(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * 0.5, g + (255 - g) * 0.5, b + (255 - b) * 0.5);
}

function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;

  switch (currentSkin) {
    case 'neon': {
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = color;
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      break;
    }
    case 'pastel': {
      const soft = pastelize(color);
      context.fillStyle = soft;
      if (typeof context.roundRect === 'function') {
        context.beginPath();
        context.roundRect(x * size + 1, y * size + 1, size - 2, size - 2, 5);
        context.fill();
      } else {
        context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      }
      break;
    }
    case 'pixel': {
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      const dark = darken(color, 0.2);
      const cell = (size - 2) / 3;
      for (let sr = 0; sr < 3; sr++) {
        for (let sc = 0; sc < 3; sc++) {
          if ((sr + sc) % 2 === 0) continue;
          context.fillStyle = dark;
          context.fillRect(
            x * size + 1 + sc * cell,
            y * size + 1 + sr * cell,
            cell,
            cell
          );
        }
      }
      break;
    }
    case 'retro':
    default: {
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      break;
    }
  }

  context.shadowBlur = 0;
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

// Muestra exclusivamente uno de los paneles del overlay compartido
// ('gameover' | 'pause' | 'controls'), ocultando los otros.
function setOverlayPanel(panelName) {
  gameoverPanel.classList.toggle('hidden', panelName !== 'gameover');
  pausePanel.classList.toggle('hidden', panelName !== 'pause');
  controlsPanel.classList.toggle('hidden', panelName !== 'controls');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  setOverlayPanel('gameover');
  overlay.classList.remove('hidden');

  lastSavedEntry = null;
  const qualifies = highscores.length < 5 || score > Math.min(...highscores.map(h => h.score));
  if (qualifies) {
    playerNameInput.classList.remove('hidden');
    saveScoreBtn.classList.remove('hidden');
    playerNameInput.value = '';
  } else {
    playerNameInput.classList.add('hidden');
    saveScoreBtn.classList.add('hidden');
  }
  renderHighscores();
}

function togglePause() {
  if (gameOver) return;
  if (paused) {
    if (!controlsPanel.classList.contains('hidden')) {
      hideControlsPanel();
      return;
    }
    resumeGame();
  } else {
    paused = true;
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    setOverlayPanel('pause');
    overlay.classList.remove('hidden');
  }
}

function resumeGame() {
  if (!paused) return;
  paused = false;
  overlay.classList.add('hidden');
  lastTime = performance.now();
  loop(lastTime);
}

function restartFromMenu() {
  const startLevel = parseInt(startLevelSelect.value, 10) || 1;
  localStorage.setItem('tetris-start-level', String(startLevel));
  overlay.classList.add('hidden');
  init(startLevel);
}

function showControlsPanel() {
  setOverlayPanel('controls');
}

function hideControlsPanel() {
  setOverlayPanel('pause');
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

function init(startLevel) {
  const lvl = startLevel != null ? startLevel : (parseInt(localStorage.getItem('tetris-start-level'), 10) || 1);
  board = createBoard();
  score = 0;
  lines = 0;
  runStartLevel = lvl;
  level = lvl;
  paused = false;
  gameOver = false;
  combo = 0;
  dropInterval = Math.max(100, 1000 - (lvl - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  setOverlayPanel('gameover');
  playerNameInput.classList.add('hidden');
  saveScoreBtn.classList.add('hidden');
  lastSavedEntry = null;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
  renderHighscores();
  renderStats();
}

document.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'SELECT') {
    if (e.code === 'Escape') e.target.blur();
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
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

restartBtn.addEventListener('click', () => init());
resumeBtn.addEventListener('click', resumeGame);
pauseRestartBtn.addEventListener('click', restartFromMenu);
showControlsBtn.addEventListener('click', showControlsPanel);
backToPauseBtn.addEventListener('click', hideControlsPanel);
startLevelSelect.addEventListener('change', () => {
  localStorage.setItem('tetris-start-level', startLevelSelect.value);
});

const savedStartLevel = parseInt(localStorage.getItem('tetris-start-level'), 10);
if (savedStartLevel >= 1 && savedStartLevel <= 9) {
  startLevelSelect.value = String(savedStartLevel);
}

saveScoreBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Jugador';
  const entry = { name, score };
  highscores.push(entry);
  highscores.sort((a, b) => b.score - a.score);
  highscores = highscores.slice(0, 5);
  setHighscores(highscores);
  lastSavedEntry = highscores.includes(entry) ? entry : null;
  playerNameInput.classList.add('hidden');
  saveScoreBtn.classList.add('hidden');
  renderHighscores();
});

resetScoresBtn.addEventListener('click', () => {
  localStorage.removeItem('tetris-highscores');
  localStorage.removeItem('tetris-best-combo');
  localStorage.removeItem('tetris-best-lines');
  highscores = [];
  bestCombo = 0;
  bestLines = 0;
  lastSavedEntry = null;
  renderHighscores();
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

const skinSelect = document.getElementById('skin-select');

function applySkinClass(skin) {
  document.body.classList.remove('skin-retro', 'skin-neon', 'skin-pastel', 'skin-pixel');
  document.body.classList.add(`skin-${skin}`);
}

applySkinClass(currentSkin);
skinSelect.value = currentSkin;

skinSelect.addEventListener('change', () => {
  currentSkin = skinSelect.value;
  localStorage.setItem('tetris-skin', currentSkin);
  applySkinClass(currentSkin);
  draw();
  drawNext();
});

init();
