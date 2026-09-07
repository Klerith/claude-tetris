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
  '#bbdefb', // J - pale blue
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

const ENERGY_PER_LINE = 25;   // 4 líneas sueltas (o un Tetris) llenan la barra
const SLOW_FACTOR = 2.5;      // multiplicador del intervalo de caída con "Ralentizar"
const PREVIEW_COUNT = 5;      // piezas en cola / piezas mostradas con "Ver siguientes 5"
const NEXT_BOX_H = 120;       // alto del canvas NEXT en modo normal (1 pieza)
const NEXT_BOX_H_EXPANDED = 400; // alto del canvas NEXT mostrando las 5 siguientes

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const holdSection = document.getElementById('hold-section');
const energySection = document.getElementById('energy-section');
const energyFill = document.getElementById('energy-fill');
const abilityOverlay = document.getElementById('ability-overlay');
const abilityGrid = document.getElementById('ability-grid');
const undoCard = abilityGrid.querySelector('[data-ability="undo"]');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, nextQueue, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let hold, holdLocked, energy, undoSnapshot, preview5Remaining, slowUntil, abilityMenuOpen;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function resetPiecePosition(piece) {
  piece.x = Math.floor(COLS / 2) - Math.floor(piece.shape[0].length / 2);
  piece.y = 0;
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  const piece = { type, shape, x: 0, y: 0 };
  resetPiecePosition(piece);
  return piece;
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * 8) + 1);
}

function clonePiece(p) {
  return { type: p.type, x: p.x, y: p.y, shape: p.shape.map(row => [...row]) };
}

function fillQueue() {
  while (nextQueue.length < PREVIEW_COUNT) nextQueue.push(randomPiece());
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
    energy = Math.min(100, energy + cleared * ENERGY_PER_LINE);
    updateHUD();
    updateEnergy();
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
  // Snapshot previo a la colocación, para "Deshacer última colocación".
  undoSnapshot = {
    board: board.map(r => [...r]),
    score, lines, level, dropInterval, energy,
    current: clonePiece(current),
    nextQueue: nextQueue.map(clonePiece),
    hold: hold ? clonePiece(hold) : null,
    holdLocked,
  };
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = nextQueue.shift();
  fillQueue();
  resetPiecePosition(current);
  holdLocked = false;
  updateHoldLockIndicator();
  if (preview5Remaining > 0) {
    preview5Remaining--;
  }
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

// Dibuja una pieza centrada horizontalmente en una franja de 4 celdas de ancho,
// con su esquina superior en la fila `rowOffset` (en unidades de `blockSize`).
function drawPieceInBox(context, shape, rowOffset, blockSize) {
  const offX = Math.floor((4 - shape[0].length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, rowOffset + r, shape[r][c], blockSize);
}

function drawNext() {
  const expanded = preview5Remaining > 0;
  const targetH = expanded ? NEXT_BOX_H_EXPANDED : NEXT_BOX_H;
  if (nextCanvas.height !== targetH) nextCanvas.height = targetH;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

  if (expanded) {
    const NB = 20;
    nextQueue.forEach((piece, i) => {
      drawPieceInBox(nextCtx, piece.shape, i * 4 + 0.5, NB);
    });
  } else {
    const NB = 30;
    const shape = nextQueue[0].shape;
    const offY = Math.floor((4 - shape.length) / 2);
    drawPieceInBox(nextCtx, shape, offY, NB);
  }
}

function drawHold() {
  const NB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!hold) return;
  const offY = Math.floor((4 - hold.shape.length) / 2);
  drawPieceInBox(holdCtx, hold.shape, offY, NB);
}

function updateHoldLockIndicator() {
  holdSection.classList.toggle('locked', holdLocked);
}

function updateEnergy() {
  energyFill.style.width = energy + '%';
  energySection.classList.toggle('ready', energy >= 100 && !gameOver);
}

function doHold() {
  if (holdLocked || paused || gameOver || abilityMenuOpen) return;
  const stored = makePiece(current.type); // forma base, sin rotaciones
  if (hold === null) {
    hold = stored;
    spawn();
  } else {
    const incoming = hold;
    resetPiecePosition(incoming);
    hold = stored;
    current = incoming;
    if (collide(current.shape, current.x, current.y)) endGame();
  }
  holdLocked = true;
  updateHoldLockIndicator();
  drawHold();
}

function tryOpenAbilityMenu() {
  if (energy < 100 || paused || gameOver || abilityMenuOpen) return;
  openAbilityMenu();
}

function openAbilityMenu() {
  abilityMenuOpen = true;
  cancelAnimationFrame(animId);
  undoCard.disabled = undoSnapshot === null;
  abilityOverlay.classList.remove('hidden');
}

function closeAbilityMenu() {
  abilityMenuOpen = false;
  abilityOverlay.classList.add('hidden');
  if (gameOver) return;
  // Sin este reset, el primer dt del loop incluiría todo el tiempo con el menú
  // abierto y la pieza caería de golpe (mismo patrón que togglePause).
  lastTime = performance.now();
  dropAccum = 0;
  animId = requestAnimationFrame(loop);
}

function useAbility(id) {
  if (id === 'undo' && undoSnapshot === null) return; // no gasta energía

  switch (id) {
    case 'preview':
      preview5Remaining = PREVIEW_COUNT;
      drawNext();
      break;
    case 'swap': {
      const swapped = randomPiece();
      while (swapped.type === current.type) {
        swapped.type = Math.floor(Math.random() * 8) + 1;
        swapped.shape = PIECES[swapped.type].map(row => [...row]);
      }
      resetPiecePosition(swapped);
      if (!collide(swapped.shape, swapped.x, swapped.y)) current = swapped;
      break;
    }
    case 'slow':
      slowUntil = performance.now() + 10000;
      break;
    case 'undo':
      restoreSnapshot(undoSnapshot);
      undoSnapshot = null;
      break;
  }

  energy = 0;
  updateEnergy();
  closeAbilityMenu();
}

function restoreSnapshot(s) {
  board = s.board.map(r => [...r]);
  score = s.score;
  lines = s.lines;
  level = s.level;
  dropInterval = s.dropInterval;
  energy = s.energy;
  current = clonePiece(s.current);
  nextQueue = s.nextQueue.map(clonePiece);
  hold = s.hold ? clonePiece(s.hold) : null;
  holdLocked = s.holdLocked;
  updateHUD();
  updateEnergy();
  updateHoldLockIndicator();
  drawNext();
  drawHold();
}

abilityGrid.addEventListener('click', e => {
  const card = e.target.closest('[data-ability]');
  if (!card || card.disabled) return;
  useAbility(card.dataset.ability);
});

energySection.addEventListener('click', tryOpenAbilityMenu);

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  updateEnergy();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver || abilityMenuOpen) return;
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
  const effectiveInterval = ts < slowUntil ? dropInterval * SLOW_FACTOR : dropInterval;
  if (dropAccum >= effectiveInterval) {
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
  hold = null;
  holdLocked = false;
  energy = 0;
  undoSnapshot = null;
  preview5Remaining = 0;
  slowUntil = 0;
  abilityMenuOpen = false;
  nextQueue = [];
  fillQueue();
  spawn();
  updateHUD();
  updateEnergy();
  updateHoldLockIndicator();
  drawHold();
  overlay.classList.add('hidden');
  abilityOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (abilityMenuOpen) {
    if (e.code === 'Escape') closeAbilityMenu();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  if (e.code === 'KeyE') { tryOpenAbilityMenu(); return; }
  switch (e.code) {
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      doHold();
      break;
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

init();
