// script.js (ไฟล์เต็ม)
// ================== ตัวแปรหลัก ==================
let boardSize = 9; // ปรับได้ แต่ UI ปัจจุบันคุณเลือก 9x9
let board = [];
let previousBoard = null; // สำหรับกฎ ko (เก็บบอร์ดก่อนหน้า)
let currentPlayer = 'black';
let gameEnded = false;
let passCount = 0;
const komi = 6.5;

// สแต็กสถานะสำหรับ Undo/Redo (เก็บ snapshot ของ state)
let history = []; // array of snapshots
let redoStack = [];

// DOM
const settings = document.getElementById('settings');
const gameScene = document.getElementById('gameScene');
const canvas = document.getElementById('goBoard');
const ctx = canvas.getContext('2d');
const player1Box = document.getElementById('player1');
const player2Box = document.getElementById('player2');
const scoreBlackEl = document.querySelector('#player1 .playerScore');
const scoreWhiteEl = document.querySelector('#player2 .playerScore');
const currentPlayerEl = document.getElementById('currentPlayer');
const gameResultEl = document.getElementById('gameResult');

const letters = "ABCDEFGHJKLMNOPQRST"; // ไม่มี I ตามมาตรฐาน Go

// ================== เริ่มเกม / ตั้งค่าขนาดกระดาน ==================
function setBoardSize(size){
  boardSize = size;
}

function startGame(){
  initBoard();
  resizeCanvas();
  drawBoard();
  settings.style.display = 'none';
  gameScene.style.display = 'block';

  // แสดงกรอบผู้เล่นตอนเริ่มเกม
  player1Box.style.display = 'block';
  player2Box.style.display = 'block';

  currentPlayer = 'black';
  passCount = 0;
  gameEnded = false;

  currentPlayerEl.innerText = 'ดำ';
  gameResultEl.innerText = '';

  document.getElementById('passBtn').style.display = 'inline-block';
  document.getElementById('resignBtn').style.display = 'inline-block';
  document.getElementById('undoBtn').style.display = 'inline-block';
  document.getElementById('redoBtn').style.display = 'inline-block';
  updatePlayerHighlight();

  // สร้าง snapshot เริ่มต้น
  history = [];
  redoStack = [];
  pushState();
}

// ================== กระดาน ==================
function initBoard(){
  board = Array(boardSize).fill(null).map(()=>Array(boardSize).fill(null));
  previousBoard = null;
}

function resizeCanvas(){
  const cell = 40;
  canvas.width = boardSize * cell;
  canvas.height = boardSize * cell;
}

// ================== วาดกระดาน (รองรับการแสดงโซนหลังจบเกม) ==================
function drawBoard(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const cellSize = canvas.width / boardSize;

  // ===== พื้นไม้ =====
  ctx.fillStyle = '#f4d38e';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // ===== ลายไม้เบา ๆ =====
  ctx.strokeStyle = '#e5c07b';
  ctx.lineWidth = 1;
  for(let i=0;i<=boardSize;i++){
    ctx.beginPath();
    ctx.moveTo(0, i*cellSize);
    ctx.lineTo(canvas.width, i*cellSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i*cellSize, 0);
    ctx.lineTo(i*cellSize, canvas.height);
    ctx.stroke();
  }

  // ===== เส้นหลัก =====
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  for(let i=0;i<boardSize;i++){
    ctx.beginPath();
    ctx.moveTo(cellSize/2, cellSize/2 + i*cellSize);
    ctx.lineTo(canvas.width-cellSize/2, cellSize/2 + i*cellSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cellSize/2 + i*cellSize, cellSize/2);
    ctx.lineTo(cellSize/2 + i*cellSize, canvas.height - cellSize/2);
    ctx.stroke();
  }

  // ===== จุดดาว (hoshi) =====
  ctx.fillStyle = '#000';
  const hoshi = getHoshiPoints(boardSize);
  for(const [x,y] of hoshi){
    ctx.beginPath();
    ctx.arc(x*cellSize + cellSize/2, y*cellSize + cellSize/2, Math.max(2, cellSize/12), 0, Math.PI*2);
    ctx.fill();
  }

  // ===== label A..T, 1..N =====
  ctx.fillStyle = '#000';
  ctx.font = `${Math.floor(cellSize/3)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for(let i=0;i<boardSize;i++){
    const label = letters[i];
    ctx.fillText(label, i*cellSize + cellSize/2, cellSize/6);
    ctx.fillText(label, i*cellSize + cellSize/2, canvas.height - cellSize/6);
    ctx.fillText(String(i+1), cellSize/6, i*cellSize + cellSize/2);
    ctx.fillText(String(i+1), canvas.width - cellSize/6, i*cellSize + cellSize/2);
  }

  // ===== ถ้าจบเกม: วาดโซนคะแนน (ตาม board ปัจจุบัน) =====
  if(gameEnded){
    // ไปหาโซนว่างของ board (null) และตรวจสีรอบ ๆ
    const visited = {};
    for(let y=0;y<boardSize;y++){
      for(let x=0;x<boardSize;x++){
        if(board[y][x] == null && !visited[`${x},${y}`]){
          const {group, colorSet} = getEmptyGroupForDraw(x,y, visited, board);
          if(colorSet.size === 1){
            // ถูกรอบด้วยสีเดียว -> วาดทึบตามสี
            const isBlack = colorSet.has('black');
            ctx.fillStyle = isBlack ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)';
            for(const [gx,gy] of group){
              ctx.fillRect(gx*cellSize, gy*cellSize, cellSize, cellSize);
            }
            ctx.fillStyle = isBlack ? '#fff' : '#000';
            ctx.font = `${Math.floor(cellSize/2.6)}px Arial`;
            const cx = group.reduce((s,[gx,gy])=>s+gx,0)/group.length;
            const cy = group.reduce((s,[gx,gy])=>s+gy,0)/group.length;
            ctx.fillText(String(group.length), cx*cellSize + cellSize/2, cy*cellSize + cellSize/2);
          } else if(colorSet.size === 0){
            // ไม่มีหินรอบ → ไม่แสดง (เป็นกลาง)
          } else {
            // ผสม → เราจะวาดโปร่งแสงเล็กน้อย (ไม่คิดคะแนน)
            ctx.fillStyle = 'rgba(128,128,128,0.15)';
            for(const [gx,gy] of group) ctx.fillRect(gx*cellSize, gy*cellSize, cellSize, cellSize);
          }
        }
      }
    }
  }

  // ===== วาดหิน (วาดเฉพาะ black/white เท่านั้น) =====
  for(let y=0;y<boardSize;y++){
    for(let x=0;x<boardSize;x++){
      const cell = board[y][x];
      if(cell === 'black' || cell === 'white') drawStone(x,y,cell);
    }
  }
}

function drawStone(x,y,color){
  const cellSize = canvas.width / boardSize;
  ctx.beginPath();
  ctx.arc(x*cellSize + cellSize/2, y*cellSize + cellSize/2, cellSize/2 - 3, 0, Math.PI*2);
  ctx.fillStyle = color === 'black' ? '#000' : '#fff';
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.stroke();
}

// ================== จุดดาว ==================
function getHoshiPoints(size){
  const points = [];
  if(size === 9){
    const pos = [2,4,6];
    for(let x of pos) for(let y of pos) points.push([x,y]);
  } else if(size === 13){
    const pos = [3,6,9];
    for(let x of pos) for(let y of pos) points.push([x,y]);
  } else if(size === 19){
    const pos = [3,9,15];
    for(let x of pos) for(let y of pos) points.push([x,y]);
  }
  return points;
}

// ================== วางหมาก (รวม ko + capture + ป้องกัน self-capture) ==================
canvas.addEventListener('click', function(e){
  if(gameEnded) return;
  const rect = canvas.getBoundingClientRect();
  const cellSize = canvas.width / boardSize;
  const x = Math.floor((e.clientX - rect.left)/cellSize);
  const y = Math.floor((e.clientY - rect.top)/cellSize);
  if(x<0 || y<0 || x>=boardSize || y>=boardSize) return;
  placeStone(x,y);
});

function placeStone(x, y) {
  if (board[y][x] || gameEnded) return;

  // สำรองบอร์ดก่อน
  const boardBackup = board.map(r => [...r]);
  const temp = board.map(r => [...r]);
  temp[y][x] = currentPlayer;

  // 1) ลบหินเชลยฝ่ายตรงข้ามบน temp
  removeDeadStones(currentPlayer, temp);

  // 2) ตรวจกลุ่มตัวเองหลังวาง ถ้าไม่มี liberty => ห้าม (self-capture)
  const myGroup = getGroup(x, y, temp);
  if (!hasGroupLiberty(myGroup, temp)) {
    alert('ผิดกฎ! ไม่สามารถปิดลมหายใจตัวเองได้');
    return;
  }

  // 3) ตรวจ Ko (เปรียบเทียบกับ previousBoard)
  if (previousBoard && boardsAreEqual(previousBoard, temp)) {
    alert('ผิดกฎโคะ! ไม่สามารถวางตรงนี้ได้');
    return;
  }

  // ✅ อัปเดต state
  board = temp;
  previousBoard = boardBackup;
  passCount = 0;

  // เปลี่ยนผู้เล่น
  currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
  currentPlayerEl.innerText = currentPlayer === 'black' ? 'ดำ' : 'ขาว';
  updatePlayerHighlight();

  // เคลียร์ redo เมื่อเดินใหม่ และบันทึก snapshot (หลังเปลี่ยน state)
  redoStack = [];
  pushState();

  drawBoard();
}

// ================== ฟังก์ชันกลุ่ม/ลม/จับกิน ==================
function getAdjacent(x,y){
  const adj = [];
  if(x>0) adj.push([x-1,y]);
  if(x<boardSize-1) adj.push([x+1,y]);
  if(y>0) adj.push([x,y-1]);
  if(y<boardSize-1) adj.push([x, y+1]);
  return adj;
}

function getGroup(x,y,temp=null){
  const b = temp || board;
  const color = b[y][x];
  if(!color) return [];
  const group = [];
  const visited = {};
  function dfs(cx,cy){
    const key = `${cx},${cy}`;
    if(visited[key]) return;
    visited[key] = true;
    group.push([cx,cy]);
    for(const [nx,ny] of getAdjacent(cx,cy)){
      if(b[ny][nx] === color) dfs(nx,ny);
    }
  }
  dfs(x,y);
  return group;
}


// wrapper ให้ชื่อสั้น
function hasGroupLiberty(groupOrX, maybeTemp){
  // รองรับเรียกแบบ hasGroupLiberty(group, temp) หรือ hasGroupLiberty(group) (กลุ่มเป็น array)
  if(Array.isArray(groupOrX)) {
    const group = groupOrX;
    const b = maybeTemp || board;
    for(const [x,y] of group){
      for(const [nx,ny] of getAdjacent(x,y)){
        if(!b[ny][nx]) return true;
      }
    }
    return false;
  } else {
    // ไม่ควรเข้ามาที่นี่ แต่เก็บไว้เพื่อความปลอดภัย
    return false;
  }
}

// ลบหินเชลย (ใช้สำหรับ temp board หรือ board จริง)
function removeDeadStones(playerColor,temp=null){
  const b = temp || board;
  const toRemove = [];
  const visited = {};
  for(let y=0;y<boardSize;y++){
    for(let x=0;x<boardSize;x++){
      const key = `${x},${y}`;
      if(b[y][x] && b[y][x] !== playerColor && !visited[key]){
        const group = getGroup(x,y,b);
        for(const [gx,gy] of group) visited[`${gx},${gy}`] = true;
        // ถ้ากลุ่มไม่มี liberty → ลบ
        if(!hasGroupLiberty(group,b)) toRemove.push(...group);
      }
    }
  }
  for(const [x,y] of toRemove) b[y][x] = null;
}

// เปรียบเทียบบอร์ด (สำหรับ Ko)
function boardsAreEqual(b1,b2){
  for(let y=0;y<boardSize;y++){
    for(let x=0;x<boardSize;x++){
      if(b1[y][x] !== b2[y][x]) return false;
    }
  }
  return true;
}

// ================== โซนคะแนน ==================
function getEmptyGroupForDraw(x,y,visited, b=null){
  const boardToUse = b || board;
  const group = [];
  const stack = [[x,y]];
  const colorSet = new Set();
  while(stack.length){
    const [cx,cy] = stack.pop();
    const key = `${cx},${cy}`;
    if(visited[key]) continue;
    visited[key] = true;
    group.push([cx,cy]);
    for(const [nx,ny] of getAdjacent(cx,cy)){
      const v = boardToUse[ny][nx];
      if(v === 'black') colorSet.add('black');
      else if(v === 'white') colorSet.add('white');
      else if(!visited[`${nx},${ny}`]) stack.push([nx,ny]);
    }
  }
  return {group,colorSet};
}

// ================== ไฮไลต์ผู้เล่น ==================
function updatePlayerHighlight(){
  if(currentPlayer === 'black'){
    player1Box.classList.add('active');
    player2Box.classList.remove('active');
  } else {
    player1Box.classList.remove('active');
    player2Box.classList.add('active');
  }
}

// ================== ปุ่ม Pass / Resign ==================
document.getElementById('passBtn').addEventListener('click', function(){
  if(gameEnded) return;
  passCount++;
  if(passCount >= 2) endGame();
  else {
    currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
    currentPlayerEl.innerText = currentPlayer === 'black' ? 'ดำ' : 'ขาว';
    updatePlayerHighlight();
    redoStack = [];
    pushState(); // บันทึก snapshot หลัง pass
  }
});

document.getElementById('resignBtn').addEventListener('click', function(){
  if(gameEnded) return;
  gameEnded = true;
  const winner = currentPlayer === 'black' ? 'White' : 'Black';
  gameResultEl.innerText = winner + ' wins by resignation';
  document.getElementById('passBtn').style.display = 'none';
  document.getElementById('resignBtn').style.display = 'none';
  document.getElementById('undoBtn').style.display = 'none';
  document.getElementById('redoBtn').style.display = 'none';
  drawBoard();
});

// ================== Undo / Redo (snapshot) ==================
function snapshot(){
  return {
    board: board.map(r=>[...r]),
    previousBoard: previousBoard ? previousBoard.map(r=>[...r]) : null,
    currentPlayer,
    passCount
  };
}

function restoreSnapshot(snap){
  board = snap.board.map(r=>[...r]);
  previousBoard = snap.previousBoard ? snap.previousBoard.map(r=>[...r]) : null;
  currentPlayer = snap.currentPlayer;
  passCount = snap.passCount;
  currentPlayerEl.innerText = currentPlayer === 'black' ? 'ดำ' : 'ขาว';
  updatePlayerHighlight();
  drawBoard();
}

function pushState(){
  history.push(snapshot());
  if(history.length > 200) history.shift();
}

// Undo / Redo listeners (redundant guards but safe)
document.getElementById('undoBtn').addEventListener('click', function(){
  if(history.length <= 1 || gameEnded) return;
  const last = history.pop();
  redoStack.push(last);
  const prev = history[history.length - 1];
  restoreSnapshot(prev);
});

document.getElementById('redoBtn').addEventListener('click', function(){
  if(redoStack.length === 0 || gameEnded) return;
  const snap = redoStack.pop();
  history.push(snap);
  restoreSnapshot(snap);
});

// ================== ฟังก์ชันตรวจเศษหมากในอาณาเขต (improved) ==================
// วิธี: สำหรับแต่ละกลุ่มหิน -> เก็บ set ของตำแหน่งว่าง (libertyPositions).
// ถ้า unique liberty positions < 2 => ถือว่า "เศษหมากในอาณาเขต" (ตาย) ตามเงื่อนไขที่คุณต้องการ
function checkDeadInTerritory(boardToCheck){
  const visited = {};
  let blackCaptured = 0;
  let whiteCaptured = 0;

  for(let y=0;y<boardSize;y++){
    for(let x=0;x<boardSize;x++){
      const key = `${x},${y}`;
      if(boardToCheck[y][x] && !visited[key]){
        const group = getGroup(x,y,boardToCheck);
        for(const [gx,gy] of group) visited[`${gx},${gy}`] = true;

        // เก็บตำแหน่งว่างรอบกลุ่ม (unique)
        const libertySet = new Set();
        for(const [gx,gy] of group){
          for(const [nx,ny] of getAdjacent(gx,gy)){
            if(boardToCheck[ny][nx] == null) libertySet.add(`${nx},${ny}`);
          }
        }

        if(libertySet.size < 2){
          // ถือว่าเป็นตาย (ไม่มีสองช่องรอด)
          if(boardToCheck[y][x] === 'black') whiteCaptured += group.length;
          else blackCaptured += group.length;
          for(const [gx,gy] of group) boardToCheck[gy][gx] = null;
        }
      }
    }
  }

  return { blackCaptured, whiteCaptured };
}

// ================== จบเกม และคำนวณคะแนนแบบครบ ==================
// -------------------- ส่วนที่ 1 --------------------
// ฟังก์ชันช่วยสำหรับการจำลองพื้นที่เพื่อประเมิน "เจ้าของ" ของพื้นที่ว่าง (heuristic)
function cloneBoard(src){
  return src.map(r => [...r]);
}

// คืนค่า list ของตำแหน่งใน empty group และ set ของสีรอบ ๆ (reuse getEmptyGroupForDraw)
function getEmptyGroupPositions(x,y, visited, boardToUse){
  // wrapper ที่เรียก getEmptyGroupForDraw เดิมของคุณ เพื่อความเข้าใจ
  return getEmptyGroupForDraw(x,y, visited, boardToUse); // คืน {group, colorSet}
}

/*
 simulateFillAndScore:
  - เติมตำแหน่งใน groupPositions ทั้งหมดด้วย 'fillColor'
  - ทำการลูปลบหินเชลย (removeDeadStones) จนสเถียร (ไม่มีการถูกลบเพิ่ม)
  - คืนค่าเป็น { blackCount, whiteCount, territoryAssigned: {black: n, white: n} }
  - ใช้เพื่อเปรียบเทียบว่าเมื่อเติมเป็นดำ/ขาว พื้นที่นี้ให้ประโยชน์กับใครมากกว่า
*/
function simulateFillAndScore(boardSnapshot, groupPositions, fillColor){
  const b = cloneBoard(boardSnapshot);
  // เติมพื้นที่เปล่าด้วยสีที่ลอง
  for(const [ex,ey] of groupPositions){
    b[ey][ex] = fillColor;
  }

  // ฟังก์ชันลบหินเชลยที่ใช้กับ board snapshot ที่นี่ (ใช้งาน removeDeadStones ของคุณได้)
  // แต่ removeDeadStones ของคุณใช้ board/global; ดังนั้นเราจะสร้างเวอร์ชันท้องถิ่นที่ใช้ b
  function removeDeadLocal(playerColor, localBoard){
    const toRemove = [];
    const visitedLocal = {};
    for(let yy=0; yy<boardSize; yy++){
      for(let xx=0; xx<boardSize; xx++){
        const key = `${xx},${yy}`;
        if(localBoard[yy][xx] && localBoard[yy][xx] !== playerColor && !visitedLocal[key]){
          // getGroup ใช้ board global ถ้าส่งพารามิเตอร์ third arg จะใช้ boardนั้น -> เราสามารถเรียก getGroup(x,y,b)
          const group = getGroup(xx, yy, localBoard);
          for(const [gx,gy] of group) visitedLocal[`${gx},${gy}`] = true;
          // ตรวจ liberty บน localBoard
          let hasLib = false;
          for(const [gx,gy] of group){
            for(const [nx,ny] of getAdjacent(gx,gy)){
              if(localBoard[ny][nx] == null) { hasLib = true; break; }
            }
            if(hasLib) break;
          }
          if(!hasLib) toRemove.push(...group);
        }
      }
    }
    // ลบ
    for(const [rx,ry] of toRemove) localBoard[ry][rx] = null;
    return toRemove.length > 0;
  }

  // ทำซ้ำลบเชลยจนเสถียร (max รอบจำกัดเพื่อป้องกัน loop ไม่รู้จบ)
  let changed = true;
  let iter = 0;
  while(changed && iter < 8){ // 8 เป็นค่าพอเหมาะสำหรับ heuristic
    changed = false;
    // ลบกลุ่มที่ไม่มี liberty: ตรวจทั้งสองฝั่ง (ลบจากมุมมองทุกสี)
    // เรียก removeDeadLocal สำหรับทั้ง black/white (ถ้ามีกลุ่มคู่ต่อสู้ไม่มี liberty จะถูกลบ)
    if(removeDeadLocal('black', b)) changed = true;
    if(removeDeadLocal('white', b)) changed = true;
    iter++;
  }

  // นับหินที่เหลือและนับพื้นที่ (territory) แบบง่าย: พื้นที่ว่างที่ล้อมด้วยสีเดียว
  let blackCount = 0, whiteCount = 0;
  for(let yy=0; yy<boardSize; yy++){
    for(let xx=0; xx<boardSize; xx++){
      if(b[yy][xx] === 'black') blackCount++;
      else if(b[yy][xx] === 'white') whiteCount++;
    }
  }

  // territory: นับพื้นที่ว่างที่ถูกล้อมด้วยสีเดียว
  const visitedEmpty = {};
  let blackTerr = 0, whiteTerr = 0;
  for(let yy=0; yy<boardSize; yy++){
    for(let xx=0; xx<boardSize; xx++){
      const key = `${xx},${yy}`;
      if(b[yy][xx] == null && !visitedEmpty[key]){
        const {group, colorSet} = getEmptyGroupForDraw(xx, yy, visitedEmpty, b);
        if(colorSet.size === 1){
          if(colorSet.has('black')) blackTerr += group.length;
          else whiteTerr += group.length;
        }
      }
    }
  }

  return {
    blackCount,
    whiteCount,
    blackTerritory: blackTerr,
    whiteTerritory: whiteTerr
  };
}
// -------------------- ส่วนที่ 2 --------------------
// heuristic: ลบกลุ่มที่ liberty == 0 (ชัดเจน) และกลุ่มที่มี unique liberty < 2 (ถือว่า "น่าตาย") 
// ฟังก์ชันนี้จะทำงานกับ board snapshot ที่ส่งมา ไม่กระทบบอร์ดจริงจนกว่าจะคืนค่า
function removeObviousAndSuspectedDead(localBoard){
  const removed = [];
  const visited = {};
  let anyRemoved = true;
  // ทำซ้ำจนเสถียร (บางครั้งการลบกลุ่มหนึ่งจะทำให้กลุ่มอื่นไม่มี liberty)
  let rounds = 0;
  while(anyRemoved && rounds < 8){
    anyRemoved = false;
    for(let y=0;y<boardSize;y++){
      for(let x=0;x<boardSize;x++){
        const key = `${x},${y}`;
        if(localBoard[y][x] && !visited[key]){
          const group = getGroup(x,y,localBoard);
          for(const [gx,gy] of group) visited[`${gx},${gy}`] = true;

          // เก็บ liberté แบบ unique
          const libertySet = new Set();
          for(const [gx,gy] of group){
            for(const [nx,ny] of getAdjacent(gx,gy)){
              if(localBoard[ny][nx] == null) libertySet.add(`${nx},${ny}`);
            }
          }

          // ถ้าไม่มี liberty -> ลบ (ชัดเจน)
          if(libertySet.size === 0){
            for(const [gx,gy] of group){
              removed.push([gx,gy]);
              localBoard[gy][gx] = null;
            }
            anyRemoved = true;
          } else if(libertySet.size < 2){
            // heuristic: ถ้ามี liberty < 2 (เช่น 1) ถือว่า "น่าตาย" → ลบเป็นของจริงในการประเมิน
            for(const [gx,gy] of group){
              removed.push([gx,gy]);
              localBoard[gy][gx] = null;
            }
            anyRemoved = true;
          }
        }
      }
    }
    rounds++;
  }
  return removed; // ตำแหน่งที่ถูกลบ (เพื่อใช้เป็น captured count)
}
// -------------------- ส่วนที่ 3 --------------------
// แทนที่ฟังก์ชัน endGame เดิมของคุณด้วยอันนี้ (หรือแทนเฉพาะเนื้อหาภายใน)
function endGame(){
  gameEnded = true;
  // ซ่อนปุ่มควบคุม
  document.getElementById('passBtn').style.display = 'none';
  document.getElementById('resignBtn').style.display = 'none';
  document.getElementById('undoBtn').style.display = 'none';
  document.getElementById('redoBtn').style.display = 'none';

  // สำเนาบอร์ดหลัก
  const tempBoard = cloneBoard(board);

  // 1) ลบกลุ่มที่ชัดเจนว่าไม่มี liberty (liberty == 0)
  // ใช้ logic เดิม (ลักษณะเดียวกับ removeObviousAndSuspectedDead แต่เราจะแยกขั้นตอน)
  const removedClear = removeObviousAndSuspectedDead(tempBoard); // รวมทั้ง liberty==0 และ liberty<2 heuristic
  // คำนวณหินที่ถูกจับจากการลบนี้เทียบกับบอร์ดจริง (board)
  let blackCaptured = 0;
  let whiteCaptured = 0;
  for(const [rx,ry] of removedClear){
    // ตำแหน่งที่ถูกลบ มาจากกลุ่มที่มีหินบน board เดิม
    if(board[ry][rx] === 'black') blackCaptured++;
    else if(board[ry][rx] === 'white') whiteCaptured++;
  }

  // 2) ตอนนี้ tempBoard มีสถานะหลังลบหินตาย (heuristic)
  //    เราจะคำนวณคะแนนโดยการประเมินพื้นที่ว่างทีละกลุ่ม
  const visitedEmpty = {};
  let blackTerritory = 0;
  let whiteTerritory = 0;

  for(let y=0;y<boardSize;y++){
    for(let x=0;x<boardSize;x++){
      const key = `${x},${y}`;
      if(tempBoard[y][x] == null && !visitedEmpty[key]){
        const {group, colorSet} = getEmptyGroupForDraw(x,y, visitedEmpty, tempBoard);

        if(colorSet.size === 1){
          // ถูกรอบโดยสีเดียว -> นับเป็น territory ให้สีที่ครอบ
          if(colorSet.has('black')) blackTerritory += group.length;
          else whiteTerritory += group.length;
        } else if(colorSet.size === 0){
          // ไม่มีหินรอบ -> เป็นกลาง (ไม่ให้ใคร)
        } else {
          // contested area -> ทำ simulation สั้น ๆ ทั้งเติมเป็น black และเติมเป็น white แล้วเปรียบเทียบผล
          // ได้ผลลัพธ์จาก simulateFillAndScore ซึ่งนับหินและ territory หลังเติมและลบเชลยซ้ำ ๆ
          const simBlack = simulateFillAndScore(tempBoard, group, 'black');
          const simWhite = simulateFillAndScore(tempBoard, group, 'white');

          // เปรียบเทียบคะแนนภายในพื้นที่ (เราจะดูผลต่างหิน+territory ที่เกิดขึ้น)
          const blackGain = (simBlack.blackCount + simBlack.blackTerritory) - (simWhite.blackCount + simWhite.blackTerritory);
          const whiteGain = (simWhite.whiteCount + simWhite.whiteTerritory) - (simBlack.whiteCount + simBlack.whiteTerritory);

          // ตัดสินใจ: ให้พื้นที่กับฝ่ายที่ได้ประโยชน์มากกว่า (ถ้าผลต่างสูสีก็เป็น neutral)
          if(blackGain > whiteGain && blackGain - whiteGain > 0.5){
            blackTerritory += group.length;
          } else if(whiteGain > blackGain && whiteGain - blackGain > 0.5){
            whiteTerritory += group.length;
          } else {
            // ถ้าไม่ชัดเจน -> ให้เป็นกลาง (ไม่มีใครได้)
          }
        }
      }
    }
  }

  // 3) นับหินที่ยังเหลือ (หลังลบ) บน tempBoard
  let blackAlive = 0, whiteAlive = 0;
  for(let y=0;y<boardSize;y++){
    for(let x=0;x<boardSize;x++){
      if(tempBoard[y][x] === 'black') blackAlive++;
      else if(tempBoard[y][x] === 'white') whiteAlive++;
    }
  }

  // 4) สรุปคะแนน (ตามสไตล์ Japanese counting: territory + captured + komi)
  let blackScore = blackTerritory + blackAlive + blackCaptured;
  let whiteScore = whiteTerritory + whiteAlive + whiteCaptured + komi;

  // อัปเดต UI (คะแนน)
  scoreBlackEl.innerText = 'Score: ' + Number(blackScore.toFixed(1));
  scoreWhiteEl.innerText = 'Score: ' + Number(whiteScore.toFixed(1));

  // ผลการแข่งขัน
  let resultText = '';
  if(blackScore > whiteScore) resultText = `Black wins by ${(blackScore - whiteScore).toFixed(1)} points`;
  else if(whiteScore > blackScore) resultText = `White wins by ${(whiteScore - blackScore).toFixed(1)} points`;
  else resultText = `Draw (${blackScore.toFixed(1)} : ${whiteScore.toFixed(1)})`;
  gameResultEl.innerText = resultText;

  // วาดกระดาน (drawBoard ใช้ logic แสดงโซนตาม board จริง)
  drawBoard();
}