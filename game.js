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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, maxCombo, gameStarted;

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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
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
  const clearedCount = clearLines();
  if (!clearedCount) combo = 0;
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
  handleGameOverRecords();
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
  combo = 0;
  maxCombo = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  resetGameOverRecordsPanel();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!gameStarted) return;
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

// init() ya no se llama automáticamente al cargar: arranca desde la pantalla
// de inicio (ver bloque "Tabla de records" más abajo), que llama a init()
// cuando el jugador pulsa "JUGAR".

// ---- Tabla de records ----
// Persistencia en localStorage['tetris-records'] como un único objeto:
//   { top: [{ name, score }, ...] (máx. 5, orden descendente),
//     maxCombo: número más alto de combo conseguido en cualquier partida,
//     maxLines: número más alto de líneas limpiadas en una sola partida }
// No se usan claves adicionales: todo vive junto en 'tetris-records'.

const RECORDS_KEY = 'tetris-records';
const RECORDS_MAX_ENTRIES = 5;
const RECORDS_NAME_MAX_LEN = 12;

const startScreen = document.getElementById('start-screen');
const recordsStartList = document.getElementById('records-start-list');
const recordsStartMaxCombo = document.getElementById('records-start-max-combo');
const recordsStartMaxLines = document.getElementById('records-start-max-lines');
const recordsPlayBtn = document.getElementById('records-play-btn');
const recordsResetBtn = document.getElementById('records-reset-btn');
const recordsResetConfirm = document.getElementById('records-reset-confirm');
const recordsResetConfirmYes = document.getElementById('records-reset-confirm-yes');
const recordsResetConfirmNo = document.getElementById('records-reset-confirm-no');

const recordsGameoverPanel = document.getElementById('records-gameover-panel');
const recordsNameForm = document.getElementById('records-name-form');
const recordsNameInput = document.getElementById('records-name-input');
const recordsSaveBtn = document.getElementById('records-save-btn');
const recordsGameoverList = document.getElementById('records-gameover-list');
const recordsGameoverMaxCombo = document.getElementById('records-gameover-max-combo');
const recordsGameoverMaxLines = document.getElementById('records-gameover-max-lines');

let recordsData = loadRecords();
// Referencia al registro insertado en la partida actual (para resaltarlo).
let pendingHighlightRecord = null;

function defaultRecordsData() {
  return { top: [], maxCombo: 0, maxLines: 0 };
}

// Lee y valida lo guardado en localStorage. Ante cualquier dato corrupto o
// con forma inesperada, se descarta y se devuelve el valor por defecto para
// no romper el arranque del juego.
function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return defaultRecordsData();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.top)) {
      return defaultRecordsData();
    }

    const top = parsed.top
      .filter(r => r && typeof r.name === 'string' && typeof r.score === 'number' && isFinite(r.score))
      .map(r => ({ name: sanitizeName(r.name), score: r.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RECORDS_MAX_ENTRIES);

    const maxCombo = typeof parsed.maxCombo === 'number' && isFinite(parsed.maxCombo) ? parsed.maxCombo : 0;
    const maxLines = typeof parsed.maxLines === 'number' && isFinite(parsed.maxLines) ? parsed.maxLines : 0;

    return { top, maxCombo, maxLines };
  } catch (e) {
    return defaultRecordsData();
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(recordsData));
  } catch (e) {
    // localStorage no disponible (modo privado, cuota llena, etc.): se ignora.
  }
}

// Recorta y limpia el nombre del jugador. Siempre se inserta vía
// textContent, así que esto es solo higiene de datos, no una defensa XSS.
function sanitizeName(name) {
  const trimmed = String(name).trim();
  // Se recorta por puntos de código (no por unidades UTF-16) para no partir
  // un par subrogado a la mitad si el nombre incluye, por ejemplo, un emoji.
  const clipped = Array.from(trimmed).slice(0, RECORDS_NAME_MAX_LEN).join('');
  return clipped || 'JUGADOR';
}

function qualifiesForTop(currentScore) {
  if (recordsData.top.length < RECORDS_MAX_ENTRIES) return true;
  const lowest = recordsData.top[recordsData.top.length - 1];
  return currentScore > lowest.score;
}

function insertRecord(name, currentScore) {
  const rec = { name: sanitizeName(name), score: currentScore };
  recordsData.top.push(rec);
  recordsData.top.sort((a, b) => b.score - a.score);
  recordsData.top = recordsData.top.slice(0, RECORDS_MAX_ENTRIES);
  saveRecords();
  return rec;
}

function renderRecordsList(listEl, highlightRec) {
  listEl.textContent = '';

  if (recordsData.top.length === 0) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin puntuaciones aún';
    listEl.appendChild(li);
    return;
  }

  recordsData.top.forEach((rec, i) => {
    const li = document.createElement('li');
    li.className = 'records-row';
    if (rec === highlightRec) li.classList.add('records-highlight');

    const rank = document.createElement('span');
    rank.className = 'records-rank';
    rank.textContent = (i + 1) + '.';

    const name = document.createElement('span');
    name.className = 'records-name';
    name.textContent = rec.name;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'records-score';
    scoreSpan.textContent = rec.score.toLocaleString();

    li.append(rank, name, scoreSpan);
    listEl.appendChild(li);
  });
}

function renderStartPanel() {
  renderRecordsList(recordsStartList, null);
  recordsStartMaxCombo.textContent = recordsData.maxCombo;
  recordsStartMaxLines.textContent = recordsData.maxLines;
}

function renderGameoverPanel() {
  renderRecordsList(recordsGameoverList, pendingHighlightRecord);
  recordsGameoverMaxCombo.textContent = recordsData.maxCombo;
  recordsGameoverMaxLines.textContent = recordsData.maxLines;
}

// Se llama al terminar cada partida (desde endGame()): actualiza los
// récords históricos de combo/líneas, decide si la puntuación entra en el
// top 5 y muestra el panel de records en el overlay de game over.
function handleGameOverRecords() {
  if (maxCombo > recordsData.maxCombo) recordsData.maxCombo = maxCombo;
  if (lines > recordsData.maxLines) recordsData.maxLines = lines;
  saveRecords();

  pendingHighlightRecord = null;
  recordsGameoverPanel.classList.remove('records-hidden');

  if (qualifiesForTop(score)) {
    recordsNameForm.classList.remove('records-hidden');
    recordsNameInput.value = '';
    // Mientras el nombre no se guarde, se bloquea "Reiniciar": si el
    // jugador reiniciara ahora, la puntuación que ya calificó para el top 5
    // se perdería sin llegar a guardarse.
    restartBtn.disabled = true;
    renderGameoverPanel();
    // Se difiere el foco un tick para no pelear con el resto del renderizado.
    setTimeout(() => recordsNameInput.focus(), 0);
  } else {
    recordsNameForm.classList.add('records-hidden');
    restartBtn.disabled = false;
    renderGameoverPanel();
  }
}

function saveCurrentScoreRecord() {
  if (recordsNameForm.classList.contains('records-hidden')) return;
  pendingHighlightRecord = insertRecord(recordsNameInput.value, score);
  recordsNameForm.classList.add('records-hidden');
  restartBtn.disabled = false;
  renderGameoverPanel();
}

// Se llama desde init(): oculta el panel de game over para que no aparezca
// reutilizado en el overlay compartido de pausa en la siguiente partida.
function resetGameOverRecordsPanel() {
  pendingHighlightRecord = null;
  recordsGameoverPanel.classList.add('records-hidden');
  recordsNameForm.classList.add('records-hidden');
  restartBtn.disabled = false;
}

function resetAllRecords() {
  recordsData = defaultRecordsData();
  saveRecords();
  pendingHighlightRecord = null;
  renderStartPanel();
}

recordsSaveBtn.addEventListener('click', saveCurrentScoreRecord);
recordsNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveCurrentScoreRecord();
});

recordsResetBtn.addEventListener('click', () => {
  recordsResetBtn.classList.add('records-hidden');
  recordsResetConfirm.classList.remove('records-hidden');
});

recordsResetConfirmYes.addEventListener('click', () => {
  resetAllRecords();
  recordsResetConfirm.classList.add('records-hidden');
  recordsResetBtn.classList.remove('records-hidden');
});

recordsResetConfirmNo.addEventListener('click', () => {
  recordsResetConfirm.classList.add('records-hidden');
  recordsResetBtn.classList.remove('records-hidden');
});

recordsPlayBtn.addEventListener('click', () => {
  gameStarted = true;
  startScreen.classList.add('hidden');
  init();
});

renderStartPanel();
