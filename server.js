const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// Serve all static files from this folder
app.use(express.static(path.join(__dirname)));

// Root serves index.html (lobby + game on one page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = {};

const PLAYER_COLORS = [
  '#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6',
  '#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a',
  '#ff5722','#607d8b','#ff9800','#673ab7','#009688',
  '#f44336','#2196f3','#4caf50','#ffeb3b','#ff4081',
  '#00e5ff','#76ff03','#ff6d00','#d500f9','#00e676',
  '#ff1744','#2979ff','#00e676','#ffd740','#e040fb',
];

function generateCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let letter;
  let code;
  do {
    letter = letters[Math.floor(Math.random() * letters.length)];
    code   = letter + letter + letter;
  } while (rooms[code]);
  return code;
}

function getAlivePlayers(room) {
  return Object.values(room.players).filter(p => !p.dead);
}

function checkWin(room, code) {
  if (!room.started) return;
  const alive = getAlivePlayers(room);
  if (alive.length === 1) {
    io.to(code).emit('game_over', { winner: alive[0].name });
  } else if (alive.length === 0) {
    io.to(code).emit('game_over', { winner: null });
  }
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create_room', ({ name }, cb) => {
    const code = generateCode();
    rooms[code] = { host: socket.id, started: false, players: {} };
    rooms[code].players[socket.id] = {
      id: socket.id, name,
      x: 1600, y: 1200,
      hp: 100, maxHp: 100, dead: false,
      weapon: 'fighter', facingLeft: false,
      currentAnim: 'idle', animFrame: 0,
      color: PLAYER_COLORS[0], kills: 0, ready: false,
    };
    socket.join(code);
    socket.roomCode = code;
    console.log(`Room created: ${code} by ${name}`);
    cb({ code, players: rooms[code].players });
  });

  socket.on('join_room', ({ name, code }, cb) => {
    code = code.toUpperCase();
    const room = rooms[code];
    if (!room)   return cb({ error: 'Room not found' });
    if (room.started) return cb({ error: 'Game already started' });
    if (Object.keys(room.players).length >= 30) return cb({ error: 'Room is full (max 30)' });

    const count  = Object.keys(room.players).length;
    const spawnX = 1200 + (count % 5) * 250;
    const spawnY = 1000 + Math.floor(count / 5) * 250;

    const colorIndex = Object.keys(room.players).length % PLAYER_COLORS.length;
    room.players[socket.id] = {
      id: socket.id, name,
      x: spawnX, y: spawnY,
      hp: 100, maxHp: 100, dead: false,
      weapon: 'fighter', facingLeft: false,
      currentAnim: 'idle', animFrame: 0,
      color: PLAYER_COLORS[colorIndex], kills: 0, ready: false,
    };
    socket.join(code);
    socket.roomCode = code;
    io.to(code).emit('player_joined', { players: room.players });
    console.log(`${name} joined room ${code}`);
    cb({ code, players: room.players, host: room.host });
  });

  socket.on('start_game', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    room.started  = true;
    room.starting = true; // loading phase
    // Tell everyone to start loading assets
    io.to(code).emit('load_assets', { players: room.players });
    console.log(`Loading phase started in room ${code}`);
  });

  socket.on('player_ready', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].ready = true;
    console.log(`${room.players[socket.id].name} is ready in room ${code}`);

    // Broadcast updated ready status to lobby
    io.to(code).emit('player_ready_update', {
      id:   socket.id,
      name: room.players[socket.id].name,
      readyCount: Object.values(room.players).filter(p => p.ready).length,
      totalCount: Object.keys(room.players).length,
    });

    // Check if ALL players are ready
    const allReady = Object.values(room.players).every(p => p.ready);
    if (allReady) {
      room.startTime = Date.now();
      room.starting  = false;
      io.to(code).emit('game_started', { players: room.players, startTime: room.startTime });
      console.log(`Game started in room ${code} with ${Object.keys(room.players).length} players`);
    }
  });

  socket.on('player_update', (data) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];
    p.x = data.x; p.y = data.y; p.hp = data.hp; p.dead = data.dead;
    p.weapon = data.weapon; p.facingLeft = data.facingLeft;
    p.currentAnim = data.currentAnim; p.animFrame = data.animFrame;
    socket.to(code).emit('player_update', { id: socket.id, ...data });
  });

  socket.on('bullet_fired', (data) => {
    const code = socket.roomCode;
    if (code) socket.to(code).emit('bullet_fired', data);
  });

  socket.on('player_damaged', ({ targetId, damage, killerId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;
    const target = room.players[targetId];
    if (!target || target.dead) return;
    target.hp = Math.max(0, target.hp - damage);
    const killed = target.hp <= 0 && !target.dead;
    if (killed) target.dead = true;
    let killerName = null;
    if (killed && killerId && room.players[killerId]) {
      room.players[killerId].kills++;
      killerName = room.players[killerId].name;
    }
    io.to(code).emit('player_damaged', {
      targetId, damage, hp: target.hp, killerId,
      killed, killerName, targetName: target.name,
      killerKills: killerId && room.players[killerId] ? room.players[killerId].kills : 0,
    });
    checkWin(room, code);
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;
    const name = room.players[socket.id]?.name || 'Unknown';
    delete room.players[socket.id];
    console.log(`${name} disconnected from room ${code}`);
    io.to(code).emit('player_left', { id: socket.id });

    if (Object.keys(room.players).length === 0) {
      delete rooms[code];
      console.log(`Room ${code} deleted`);
    } else if (room.host === socket.id) {
      room.host = Object.keys(room.players)[0];
      io.to(code).emit('host_changed', { newHost: room.host });
    }
    checkWin(room, code);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`JS Arena server running on http://localhost:${PORT}`);
});
