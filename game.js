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
  trackCombo(cleared);
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
  showGameOverRecords();
  overlay.classList.remove('hidden');
}

/* ---- Tabla de records local ---- */

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const recordsOverlay = document.getElementById('records-overlay');
const recordsForm = document.getElementById('records-form');
const recordsNameInput = document.getElementById('records-name');
const recordsListStart = document.getElementById('records-list-start');
const recordsStatsStart = document.getElementById('records-stats-start');
const recordsListOver = document.getElementById('records-list-over');
const recordsStatsOver = document.getElementById('records-stats-over');

let records = loadRecords();  // { scores, bestCombo, maxLines }
let combo = 0;                // locks consecutivos que han limpiado líneas
let pendingEntry = null;      // partida que entra al top, a la espera de nombre
let highlightId = null;       // date de la fila recién guardada (se resalta)

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const value = Number(entry.score);
  if (!Number.isFinite(value)) return null;
  return {
    name: String(entry.name ?? '').slice(0, 10).trim() || '---',
    score: Math.max(0, Math.floor(value)),
    lines: Math.max(0, Math.floor(Number(entry.lines) || 0)),
    level: Math.max(1, Math.floor(Number(entry.level) || 1)),
    date: typeof entry.date === 'string' ? entry.date : '',
  };
}

// Nunca debe lanzar: un localStorage corrupto no puede tumbar el juego.
function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return emptyRecords();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyRecords();
    const scores = Array.isArray(data.scores)
      ? data.scores.map(sanitizeEntry).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS)
      : [];
    return {
      scores,
      bestCombo: Math.max(0, Math.floor(Number(data.bestCombo) || 0)),
      maxLines: Math.max(0, Math.floor(Number(data.maxLines) || 0)),
    };
  } catch (err) {
    return emptyRecords();
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (err) {
    // almacenamiento lleno o no disponible: se juega igual, sin persistir
  }
}

function qualifies(value) {
  if (value <= 0) return false;
  return records.scores.length < MAX_RECORDS
    || value > records.scores[records.scores.length - 1].score;
}

// Llamado en cada lock (desde clearLines): cleared === 0 rompe el combo.
function trackCombo(cleared) {
  if (!cleared) {
    combo = 0;
    return;
  }
  combo++;
  let changed = false;
  if (combo > records.bestCombo) { records.bestCombo = combo; changed = true; }
  if (cleared > records.maxLines) { records.maxLines = cleared; changed = true; }
  if (changed) saveRecords();
}

function buildRow(cells, tag) {
  const tr = document.createElement('tr');
  for (const text of cells) {
    const cell = document.createElement(tag);
    cell.textContent = text;
    tr.appendChild(cell);
  }
  return tr;
}

// Render compartido por la pantalla de inicio y el overlay de game over.
function renderRecordsInto(listEl, statsEl) {
  listEl.textContent = '';
  if (!records.scores.length) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Sin records todavía';
    listEl.appendChild(empty);
  } else {
    const table = document.createElement('table');
    table.className = 'records-table';
    const thead = document.createElement('thead');
    thead.appendChild(buildRow(['#', 'NOMBRE', 'PUNTOS', 'LÍN.', 'NIV.'], 'th'));
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    records.scores.forEach((entry, i) => {
      const tr = buildRow([
        String(i + 1),
        entry.name,
        entry.score.toLocaleString(),
        String(entry.lines),
        String(entry.level),
      ], 'td');
      if (highlightId && entry.date === highlightId) tr.className = 'records-row-new';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    listEl.appendChild(table);
  }

  statsEl.textContent = '';
  const stats = [['MEJOR COMBO', `x${records.bestCombo}`], ['MÁX. LÍNEAS', String(records.maxLines)]];
  for (const [label, value] of stats) {
    const span = document.createElement('span');
    span.textContent = `${label} `;
    const b = document.createElement('b');
    b.textContent = value;
    span.appendChild(b);
    statsEl.appendChild(span);
  }
}

function renderRecords() {
  renderRecordsInto(recordsListStart, recordsStatsStart);
  renderRecordsInto(recordsListOver, recordsStatsOver);
}

function showGameOverRecords() {
  highlightId = null;
  pendingEntry = qualifies(score)
    ? { name: 'AAA', score, lines, level, date: new Date().toISOString() }
    : null;
  if (pendingEntry) {
    recordsNameInput.value = 'AAA';
    recordsForm.classList.remove('hidden');
  } else {
    recordsForm.classList.add('hidden');
  }
  renderRecords();
  recordsOverlay.classList.remove('hidden');
}

function savePendingEntry() {
  if (!pendingEntry) return;
  const name = recordsNameInput.value.trim().slice(0, 10).toUpperCase() || 'AAA';
  const entry = { ...pendingEntry, name };
  records.scores.push(entry);
  records.scores.sort((a, b) => b.score - a.score);
  records.scores = records.scores.slice(0, MAX_RECORDS);
  saveRecords();
  highlightId = entry.date;
  pendingEntry = null;
  recordsForm.classList.add('hidden');
  renderRecords();
}

function resetRecords() {
  if (!window.confirm('¿Borrar todos los records?')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (err) {
    // ignorado: igualmente se limpia la copia en memoria
  }
  records = emptyRecords();
  combo = 0;
  highlightId = null;
  pendingEntry = null;
  recordsForm.classList.add('hidden');
  renderRecords();
}

// Estado de records al arrancar una partida (llamado desde init).
function startRun() {
  combo = 0;
  pendingEntry = null;
  highlightId = null;
  recordsForm.classList.add('hidden');
  recordsOverlay.classList.add('hidden');
  startScreen.classList.add('hidden');
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
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  startRun();
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

recordsForm.addEventListener('submit', e => {
  e.preventDefault();
  savePendingEntry();
});
document.getElementById('records-reset-start').addEventListener('click', resetRecords);
document.getElementById('records-reset-over').addEventListener('click', resetRecords);
startBtn.addEventListener('click', init);

// Sin partida activa hasta pulsar "Jugar": la pantalla de inicio muestra los records.
gameOver = true;
renderRecords();
