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

// ---- Skin definitions ----
const SKINS = {
  retro: {
    name: 'Retro',
    colors: [
      null,
      '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784',
      '#e57373', '#90caf9', '#ffb74d', '#9e9e9e',
    ],
    boardBg: null,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },

  neon: {
    name: 'Neon',
    colors: [
      null,
      '#00ffff', '#ffff00', '#ff00ff', '#00ff00',
      '#ff0040', '#00aaff', '#ff8000', '#8000ff',
    ],
    boardBg: '#000000',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      const a = alpha ?? 1;
      context.globalAlpha = a;
      context.shadowBlur = a < 0.5 ? 8 : 15;
      context.shadowColor = color;
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      context.fillStyle = `rgba(${r},${g},${b},0.55)`;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.strokeRect(x * size + 1.75, y * size + 1.75, size - 3.5, size - 3.5);
      context.shadowBlur = 0;
      context.globalAlpha = 1;
    },
  },

  pastel: {
    name: 'Pastel',
    colors: [
      null,
      '#bae1ff', '#ffffba', '#e8baff', '#baffc9',
      '#ffb3ba', '#ffdfba', '#ffd9ba', '#d9d9d9',
    ],
    boardBg: '#f8f0ff',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.65)';
      context.fillRect(x * size + 2, y * size + 2, size - 4, 5);
      context.fillRect(x * size + 2, y * size + 2, 5, size - 4);
      context.fillStyle = 'rgba(0,0,0,0.08)';
      context.fillRect(x * size + 2, y * size + size - 5, size - 4, 4);
      context.fillRect(x * size + size - 5, y * size + 2, 4, size - 4);
      context.globalAlpha = 1;
    },
  },

  pixel: {
    name: 'Pixel',
    colors: [
      null,
      '#3ab8c8', '#d4b840', '#9a50a8', '#60a060',
      '#c05060', '#7090d8', '#d08030', '#808080',
    ],
    boardBg: '#1a1a2e',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const dark = `rgba(${Math.max(0,r-60)},${Math.max(0,g-60)},${Math.max(0,b-60)},0.7)`;
      context.strokeStyle = dark;
      context.lineWidth = 0.5;
      const bx = x * size + 1;
      const by = y * size + 1;
      const bw = size - 2;
      for (let i = 4; i < bw; i += 4) {
        context.beginPath(); context.moveTo(bx + i, by); context.lineTo(bx + i, by + bw); context.stroke();
        context.beginPath(); context.moveTo(bx, by + i); context.lineTo(bx + bw, by + i); context.stroke();
      }
      context.globalAlpha = 1;
    },
  },
};

let activeSkin = SKINS[localStorage.getItem('tetris-skin')] || SKINS.retro;

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
const RECORDS_KEY = 'tetris_records';
const MAX_RECORDS = 5;

// --- Records module ---
function loadRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || []; }
  catch { return []; }
}

function saveRecord(name, score, lines, combo) {
  const records = loadRecords();
  const date = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
  records.push({ name: name.trim() || 'JUGADOR', score, lines, combo, date });
  records.sort((a, b) => b.score - a.score);
  records.splice(MAX_RECORDS);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  return records;
}

function isTopScore(s) {
  const records = loadRecords();
  return records.length < MAX_RECORDS || s > records[records.length - 1].score;
}

function clearRecords() {
  localStorage.removeItem(RECORDS_KEY);
}

function renderLeaderboard(tbodyId, highlightScore) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const records = loadRecords();
  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-records">Sin records aún</td></tr>';
    return;
  }
  tbody.innerHTML = records.map((r, i) => {
    const isNew = highlightScore !== undefined && r.score === highlightScore && i === records.findIndex(x => x.score === highlightScore);
    return `<tr class="${isNew ? 'record-new' : ''}">
      <td class="rank">${i + 1}</td>
      <td class="rec-name">${r.name}</td>
      <td class="rec-score">${r.score.toLocaleString()}</td>
      <td>${r.lines}</td>
      <td>${r.combo}</td>
    </tr>`;
  }).join('');
}

function showStartLeaderboard() {
  const records = loadRecords();
  const section = document.getElementById('leaderboard-start');
  if (records.length === 0) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  renderLeaderboard('leaderboard-start-body');
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const pauseOverlay = document.getElementById('pause-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsPanel = document.getElementById('controls-panel');
const levelDownBtn = document.getElementById('level-down');
const levelUpBtn = document.getElementById('level-up');
const startLevelDisplay = document.getElementById('start-level-display');
const nameInputSection = document.getElementById('name-input-section');
const playerNameInput = document.getElementById('player-name-input');
const saveRecordBtn = document.getElementById('save-record-btn');
const leaderboardOverlay = document.getElementById('leaderboard-overlay');
const clearRecordsBtn = document.getElementById('clear-records-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1;
let maxCombo, currentCombo, lastClearWasCombo;

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
    if (lastClearWasCombo) {
      currentCombo++;
    } else {
      currentCombo = 1;
    }
    lastClearWasCombo = true;
    if (currentCombo > maxCombo) maxCombo = currentCombo;
    updateHUD();
  } else {
    lastClearWasCombo = false;
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
  activeSkin.drawBlock(context, x, y, colorIndex, size, alpha);
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
  if (activeSkin.boardBg) {
    ctx.fillStyle = activeSkin.boardBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
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
  if (activeSkin.boardBg) {
    nextCtx.fillStyle = activeSkin.boardBg;
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  } else {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function showOverlayLeaderboard(highlightScore) {
  renderLeaderboard('leaderboard-overlay-body', highlightScore);
  leaderboardOverlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayScore.textContent = `Score: ${score.toLocaleString()}`;
  nameInputSection.classList.add('hidden');
  leaderboardOverlay.classList.add('hidden');

  if (isTopScore(score)) {
    playerNameInput.value = '';
    nameInputSection.classList.remove('hidden');
    setTimeout(() => playerNameInput.focus(), 50);
  } else {
    showOverlayLeaderboard(undefined);
  }
  gameoverOverlay.classList.remove('hidden');
}

function submitRecord() {
  const name = playerNameInput.value.trim() || 'JUGADOR';
  saveRecord(name, score, lines, maxCombo);
  nameInputSection.classList.add('hidden');
  showOverlayLeaderboard(score);
  showStartLeaderboard();
}

function showPauseMenu() {
  pauseOverlay.classList.remove('hidden');
  controlsPanel.classList.add('hidden');
  controlsBtn.textContent = 'View Controls';
}

function hidePauseMenu() {
  pauseOverlay.classList.add('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    hidePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showPauseMenu();
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
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
  dropAccum = 0;
  maxCombo = 0;
  currentCombo = 0;
  lastClearWasCombo = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  pauseOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!gameOver) togglePause();
    return;
  }
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

saveRecordBtn.addEventListener('click', submitRecord);

playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitRecord();
});

clearRecordsBtn.addEventListener('click', () => {
  clearRecords();
  showStartLeaderboard();
});

resumeBtn.addEventListener('click', togglePause);

pauseRestartBtn.addEventListener('click', () => {
  hidePauseMenu();
  init();
});

controlsBtn.addEventListener('click', () => {
  const isHidden = controlsPanel.classList.toggle('hidden');
  controlsBtn.textContent = isHidden ? 'View Controls' : 'Hide Controls';
});

function updateStartLevelDisplay() {
  startLevelDisplay.textContent = startLevel;
}

levelDownBtn.addEventListener('click', () => {
  if (startLevel > 1) { startLevel--; updateStartLevelDisplay(); }
});

levelUpBtn.addEventListener('click', () => {
  if (startLevel < 15) { startLevel++; updateStartLevelDisplay(); }
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

// ---- Skin selector ----
const skinSelect = document.getElementById('skin-select');

function applySkin(skinKey) {
  activeSkin = SKINS[skinKey] || SKINS.retro;
  localStorage.setItem('tetris-skin', skinKey);
  if (activeSkin.boardBg) {
    canvas.style.background = activeSkin.boardBg;
    nextCanvas.style.background = activeSkin.boardBg;
  } else {
    canvas.style.background = '';
    nextCanvas.style.background = '';
  }
  if (current && !gameOver && !paused) draw();
  if (next) drawNext();
}

const savedSkin = localStorage.getItem('tetris-skin') || 'retro';
if (skinSelect) {
  skinSelect.value = savedSkin;
  skinSelect.addEventListener('change', () => applySkin(skinSelect.value));
}
applySkin(savedSkin);

showStartLeaderboard();
init();
