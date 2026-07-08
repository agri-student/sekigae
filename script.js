// ===== STATE =====
let seatGrid = [];       // 2D array of { active:bool, fixed:string|null }
let students = [];        // All students from CSV
let lotteryStudents = []; // Students participating in lottery (excluding fixed)
let cols = 6, rows = 7;
let availableSeats = [];
let assignedSeats = {};   // lotteryIndex -> seat
let currentIdx = 0;
let mode = 'fancy';
let isSpinning = false;

// ===== AUDIO =====
let audioCtx;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTick() {
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 800 + Math.random() * 600;
    o.type = 'sine'; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + 0.04);
  } catch (e) {}
}
function playFanfare() {
  try {
    const ctx = getAudio();
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; o.type = 'triangle';
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.5);
      o.start(ctx.currentTime + i * 0.15);
      o.stop(ctx.currentTime + i * 0.15 + 0.5);
    });
  } catch (e) {}
}
function playSimpleBeep() {
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; o.type = 'sine'; g.gain.value = 0.1;
    o.start(); o.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

// ===== TABS =====
function showTab(tab) {
  document.getElementById('setup-tab').style.display = tab === 'setup' ? 'block' : 'none';
  document.getElementById('lottery-tab').style.display = tab === 'lottery' ? 'flex' : 'none';
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && tab === 'setup') || (i === 1 && tab === 'lottery'));
  });
}

// ===== SETUP: SEAT PREVIEW =====
function generatePreview() {
  cols = Math.max(1, Math.min(12, parseInt(document.getElementById('cols').value) || 6));
  rows = Math.max(1, Math.min(12, parseInt(document.getElementById('rows').value) || 7));
  seatGrid = [];
  for (let r = 0; r < rows; r++) {
    seatGrid[r] = [];
    for (let c = 0; c < cols; c++) seatGrid[r][c] = { active: true, fixed: null };
  }
  renderPreview();
}

function renderPreview() {
  const el = document.getElementById('seat-preview');
  el.style.gridTemplateColumns = `repeat(${cols}, 50px)`;
  let html = ''; let num = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = seatGrid[r][c];
      let cls = 'seat-cell';
      let content = '';
      if (!cell.active) {
        cls += ' disabled';
        content = '×';
      } else if (cell.fixed) {
        cls += ' fixed';
        num++;
        content = `${num}<br><span class="fixed-name">${cell.fixed}</span>`;
      } else {
        num++;
        content = num;
      }
      html += `<div class="${cls}" data-r="${r}" data-c="${c}">${content}</div>`;
    }
  }
  el.innerHTML = html;
  const totalActive = seatGrid.flat().filter(s => s.active).length;
  const totalFixed = seatGrid.flat().filter(s => s.fixed).length;
  let statusText = `有効な席: ${totalActive}席`;
  if (totalFixed > 0) statusText += `（うち固定: ${totalFixed}席）`;
  document.getElementById('active-count').textContent = statusText;
}

let selectedSeatR = null;
let selectedSeatC = null;

function seatClicked(r, c) {
  const cell = seatGrid[r][c];

  // If no students loaded yet, just toggle active/disabled
  if (students.length === 0) {
    cell.active = !cell.active;
    cell.fixed = null;
    renderPreview();
    return;
  }

  // Show modal menu
  selectedSeatR = r;
  selectedSeatC = c;
  const currentState = !cell.active ? '無効' : cell.fixed ? `固定（${cell.fixed}）` : '通常';
  document.getElementById('modal-title').textContent = `席の設定`;
  document.getElementById('modal-status').textContent = `現在: ${currentState}`;
  document.getElementById('modal-student-list').style.display = 'none';
  const btns = document.getElementById('modal-buttons');
  btns.innerHTML = `
    <button class="btn btn-primary" onclick="setSeatNormal()">✅ 通常の席（抽選対象）</button>
    <button class="btn btn-danger" onclick="setSeatDisabled()">🚫 使わない（無効化）</button>
    <button class="btn btn-secondary" onclick="showStudentPicker()" style="border-color:var(--accent2); color:var(--accent2);">👤 生徒を固定配置</button>
  `;
  document.getElementById('seat-modal').style.display = 'flex';
}

function closeSeatModal() {
  document.getElementById('seat-modal').style.display = 'none';
}

function setSeatNormal() {
  seatGrid[selectedSeatR][selectedSeatC] = { active: true, fixed: null };
  renderPreview();
  closeSeatModal();
}

function setSeatDisabled() {
  seatGrid[selectedSeatR][selectedSeatC] = { active: false, fixed: null };
  renderPreview();
  closeSeatModal();
}

function showStudentPicker() {
  const cell = seatGrid[selectedSeatR][selectedSeatC];
  const alreadyFixed = seatGrid.flat().filter(s => s.fixed).map(s => s.fixed);
  const available = students.filter(s => !alreadyFixed.includes(s) || s === cell.fixed);

  if (available.length === 0) {
    alert('固定可能な生徒がいません。');
    return;
  }

  document.getElementById('modal-buttons').innerHTML = '';
  document.getElementById('modal-title').textContent = '固定する生徒を選択';
  document.getElementById('modal-status').textContent = '';
  const listEl = document.getElementById('modal-student-list');
  listEl.style.display = 'flex';
  listEl.innerHTML = available.map((s, i) =>
    `<button class="student-option" data-student="${s}">${i + 1}. ${s}</button>`
  ).join('');
}

// Event delegation for student picker
document.getElementById('modal-student-list').addEventListener('click', function(e) {
  const btn = e.target.closest('[data-student]');
  if (!btn) return;
  const name = btn.getAttribute('data-student');
  seatGrid[selectedSeatR][selectedSeatC] = { active: true, fixed: name };
  renderPreview();
  closeSeatModal();
});

// ===== CSV =====
const csvDrop = document.getElementById('csv-drop');
csvDrop.addEventListener('dragover', e => { e.preventDefault(); csvDrop.style.borderColor = 'var(--accent)'; });
csvDrop.addEventListener('dragleave', () => { csvDrop.style.borderColor = ''; });
csvDrop.addEventListener('drop', e => {
  e.preventDefault(); csvDrop.style.borderColor = '';
  if (e.dataTransfer.files.length) readCSVFile(e.dataTransfer.files[0]);
});
function handleCSV(input) { if (input.files.length) readCSVFile(input.files[0]); }
function readCSVFile(file) {
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
}
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  students = [];
  for (let i = 0; i < lines.length; i++) {
    const csvCols = lines[i].split(',');
    const name = (csvCols[0] || '').trim().replace(/^["']|["']$/g, '');
    if (!name) continue;
    if (i === 0 && /^(名前|氏名|Name|生徒|番号|No)/i.test(name)) continue;
    students.push(name);
  }
  document.getElementById('csv-status').textContent = `${students.length}人の生徒を読み込みました`;
  document.getElementById('csv-drop').innerHTML = `✅ ${students.length}人読み込み済み（クリックで再選択）`;
  document.getElementById('csv-drop').classList.add('has-data');
  document.getElementById('student-preview').innerHTML =
    students.map((s, i) => `<span style="margin-right:0.8rem;">${i + 1}. ${s}</span>`).join('');
}

// ===== START LOTTERY =====
function startLottery() {
  const totalActive = seatGrid.flat().filter(s => s.active).length;
  const fixedNames = seatGrid.flat().filter(s => s.fixed).map(s => s.fixed);
  const freeSeatCount = totalActive - fixedNames.length;
  lotteryStudents = students.filter(s => !fixedNames.includes(s));

  if (students.length === 0) return alert('生徒名簿を読み込んでください');
  if (lotteryStudents.length > freeSeatCount) {
    return alert(`抽選対象の生徒(${lotteryStudents.length}人)が空き席(${freeSeatCount}席)より多いです。\n席を増やすか固定席を調整してください。`);
  }

  // Build seat list
  availableSeats = [];
  let num = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = seatGrid[r][c];
      if (!cell.active) continue;
      num++;
      if (cell.fixed) {
        availableSeats.push({ r, c, num, taken: true, student: cell.fixed, isFixed: true });
      } else {
        availableSeats.push({ r, c, num, taken: false, student: null, isFixed: false });
      }
    }
  }

  assignedSeats = {};
  currentIdx = 0;
  showTab('lottery');
  renderSeatMap();
  renderQueue();
  showCurrentStudent();
  updateProgress();
  document.getElementById('slot-num').textContent = '？';
  document.getElementById('slot-num').classList.remove('spinning');
  document.getElementById('go-btn').disabled = false;
  document.getElementById('bulk-btn').disabled = false;
}

function setMode(m) {
  mode = m;
  document.getElementById('mode-fancy').classList.toggle('active', m === 'fancy');
  document.getElementById('mode-simple').classList.toggle('active', m === 'simple');
}

// ===== SEAT MAP =====
function renderSeatMap() {
  const el = document.getElementById('seat-map');
  const cellW = Math.max(55, Math.min(85, Math.floor(600 / cols)));
  el.style.gridTemplateColumns = `repeat(${cols}, ${cellW}px)`;
  let html = ''; let num = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = seatGrid[r][c];
      if (!cell.active) { html += `<div class="seat disabled"></div>`; continue; }
      num++;
      const seat = availableSeats.find(s => s.r === r && s.c === c);
      let cls = 'seat'; let content = num;
      if (seat && seat.taken && seat.isFixed) {
        cls += ' taken fixed';
        content = seat.student;
      } else if (seat && seat.taken) {
        cls += ' taken';
        content = seat.student;
      }
      html += `<div class="${cls}" id="seat-${r}-${c}" style="min-width:${cellW}px">${content}</div>`;
    }
  }
  el.innerHTML = html;
}

function highlightSeat(r, c) {
  const el = document.getElementById(`seat-${r}-${c}`);
  if (el) el.classList.add('highlight');
}
function unhighlightAll() {
  document.querySelectorAll('.seat.highlight').forEach(e => e.classList.remove('highlight'));
}

// ===== QUEUE =====
function renderQueue() {
  const el = document.getElementById('queue'); let html = '';
  for (let i = 0; i < lotteryStudents.length; i++) {
    let cls = 'queue-item'; let seatText = '—';
    if (assignedSeats[i] !== undefined) { cls += ' done'; seatText = `席${assignedSeats[i].num}`; }
    else if (i === currentIdx) { cls += ' current'; seatText = '◀ 次'; }
    html += `<div class="${cls}"><span>${i + 1}. ${lotteryStudents[i]}</span><span class="q-seat">${seatText}</span></div>`;
  }
  el.innerHTML = html;
}

function showCurrentStudent() {
  if (currentIdx >= lotteryStudents.length) {
    document.getElementById('cur-name').textContent = '全員完了！';
    document.getElementById('cur-number').textContent = '';
    document.getElementById('go-btn').disabled = true;
    document.getElementById('bulk-btn').disabled = true;
    document.getElementById('skip-btn').style.display = 'none';
    showComplete(); return;
  }
  document.getElementById('cur-name').textContent = lotteryStudents[currentIdx];
  document.getElementById('cur-number').textContent = `${currentIdx + 1}番目 / ${lotteryStudents.length}人`;
  document.getElementById('go-btn').disabled = false;
}

function updateProgress() {
  const done = Object.keys(assignedSeats).length;
  const pct = lotteryStudents.length > 0 ? (done / lotteryStudents.length * 100) : 0;
  document.getElementById('progress').style.width = pct + '%';
}

// ===== DRAW (one at a time) =====
async function drawSeat() {
  if (isSpinning || currentIdx >= lotteryStudents.length) return;
  isSpinning = true;
  document.getElementById('go-btn').disabled = true;
  document.getElementById('bulk-btn').disabled = true;
  unhighlightAll();
  const free = availableSeats.filter(s => !s.taken && !s.isFixed);
  const chosen = free[Math.floor(Math.random() * free.length)];
  if (mode === 'fancy') await fancySpin(free, chosen);
  else await simpleDraw(chosen);
  chosen.taken = true; chosen.student = lotteryStudents[currentIdx];
  assignedSeats[currentIdx] = chosen;
  renderSeatMap(); highlightSeat(chosen.r, chosen.c); renderQueue(); updateProgress();
  if (mode === 'fancy') { playFanfare(); spawnConfetti(8); } else { playSimpleBeep(); }
  await sleep(mode === 'fancy' ? 1500 : 600);
  unhighlightAll(); renderSeatMap();
  currentIdx++; showCurrentStudent(); renderQueue();
  isSpinning = false;
  if (currentIdx < lotteryStudents.length) document.getElementById('bulk-btn').disabled = false;
}

// ===== BULK ASSIGN =====
async function bulkAssign() {
  if (isSpinning) return;
  isSpinning = true;
  document.getElementById('go-btn').disabled = true;
  document.getElementById('bulk-btn').disabled = true;
  document.getElementById('skip-btn').style.display = 'none';
  unhighlightAll();

  const remaining = [];
  for (let i = currentIdx; i < lotteryStudents.length; i++) remaining.push(i);
  const free = availableSeats.filter(s => !s.taken && !s.isFixed);
  // Shuffle (Fisher-Yates)
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }

  if (mode === 'fancy') {
    const slotEl = document.getElementById('slot-num');
    for (let i = 0; i < remaining.length; i++) {
      const si = remaining[i];
      const seat = free[i];
      slotEl.classList.add('spinning');
      for (let t = 0; t < 6; t++) {
        const rand = free[Math.floor(Math.random() * free.length)];
        slotEl.textContent = rand.num;
        playTick();
        await sleep(50);
      }
      slotEl.textContent = seat.num;
      slotEl.classList.remove('spinning');
      seat.taken = true; seat.student = lotteryStudents[si];
      assignedSeats[si] = seat;
      currentIdx = si + 1;
      document.getElementById('cur-name').textContent = lotteryStudents[si];
      document.getElementById('cur-number').textContent = `${si + 1}番目 / ${lotteryStudents.length}人`;
      renderSeatMap(); highlightSeat(seat.r, seat.c); renderQueue(); updateProgress();
      playSimpleBeep();
      await sleep(350);
      unhighlightAll(); renderSeatMap();
    }
    playFanfare(); spawnConfetti(20);
  } else {
    for (let i = 0; i < remaining.length; i++) {
      const si = remaining[i];
      const seat = free[i];
      seat.taken = true; seat.student = lotteryStudents[si];
      assignedSeats[si] = seat;
    }
    currentIdx = lotteryStudents.length;
    renderSeatMap(); renderQueue(); updateProgress();
    playSimpleBeep();
  }
  showCurrentStudent();
  isSpinning = false;
}

async function fancySpin(free, chosen) {
  const slotEl = document.getElementById('slot-num');
  slotEl.classList.add('spinning');
  const totalTicks = 25 + Math.floor(Math.random() * 10);
  for (let i = 0; i < totalTicks; i++) {
    const rand = free[Math.floor(Math.random() * free.length)];
    slotEl.textContent = rand.num; playTick();
    const delay = i < totalTicks - 8 ? 60 : 60 + (i - (totalTicks - 8)) * 40;
    await sleep(delay);
  }
  slotEl.textContent = chosen.num;
  slotEl.classList.remove('spinning');
}
async function simpleDraw(chosen) {
  const slotEl = document.getElementById('slot-num');
  slotEl.textContent = '…'; await sleep(200);
  slotEl.textContent = chosen.num;
}
function skipStudent() {
  if (isSpinning || currentIdx >= lotteryStudents.length) return;
  currentIdx++; showCurrentStudent(); renderQueue();
}
function showComplete() {
  const ctrl = document.querySelector('.control-area');
  ctrl.innerHTML = `
    <div class="complete-banner">
      <h2>🎉 席替え完了！</h2>
      <p style="color:var(--text-dim)">全員の席が決まりました</p>
    </div>
    <button class="btn btn-secondary" onclick="location.reload()">🔄 最初からやり直す</button>
  `;
  if (mode === 'fancy') for (let i = 0; i < 5; i++) setTimeout(() => spawnConfetti(15), i * 400);
}
function spawnConfetti(n) {
  const colors = ['#0d9668', '#0284c7', '#d97706', '#dc2626', '#7c3aed', '#f59e0b'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.width = (6 + Math.random() * 8) + 'px';
    el.style.height = (6 + Math.random() * 8) + 'px';
    el.style.animationDuration = (1.5 + Math.random() * 2) + 's';
    el.style.animationDelay = (Math.random() * 0.5) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== INIT =====
generatePreview();

// Event delegation for seat preview clicks
document.getElementById('seat-preview').addEventListener('click', function(e) {
  const cell = e.target.closest('[data-r]');
  if (!cell) return;
  const r = parseInt(cell.getAttribute('data-r'));
  const c = parseInt(cell.getAttribute('data-c'));
  seatClicked(r, c);
});
