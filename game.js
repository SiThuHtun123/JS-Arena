// game.js — main game loop, camera, border, HUD, multiplayer sync
// startLoad_init() begins asset loading; startGame_init() launches the game loop

const CANVAS_W = 1280;
const CANVAS_H = 720;
const BORDER_DURATION       = 120;
const BORDER_DAMAGE_PER_SEC = 5;

let ctx, gameCanvas;
let gameRunning = false;
let gameOver    = false;
let winnerName  = null;

// Kill feed — array of { text, timer }
const killFeed = [];
const KILLFEED_DURATION = 4;

function addKillFeed(killerName, targetName) {
  const text = killerName ? `${killerName} 💀 ${targetName}` : `${targetName} died to the border`;
  killFeed.unshift({ text, timer: KILLFEED_DURATION });
  if (killFeed.length > 4) killFeed.pop();
}

let gameStartTime = 0;

function startLoad_init(players, mySocketId) {
  gameCanvas = document.getElementById('gameCanvas');
  ctx        = gameCanvas.getContext('2d');

  // Fetch game config via AJAX and apply weapon stats from JSON
  fetch('data.json')
    .then(res => res.json())
    .then(data => {
      // Apply weapon damage/range from JSON into WEAPON_STATS
      Object.keys(data.weapons).forEach(key => {
        if (WEAPON_STATS[key]) {
          WEAPON_STATS[key].damage = data.weapons[key].damage;
          WEAPON_STATS[key].range  = data.weapons[key].range;
        }
      });
    })
    .catch(() => {});

  // Build player objects so sprites start loading
  Object.values(players).forEach(data => {
    if (data.id === mySocketId) {
      localPlayer = createLocalPlayer(data);
    } else {
      remotePlayers[data.id] = createRemotePlayer(data);
    }
  });

  // Reset ready flag and start loading
  waitForAssetsAndSignalReady.sent = false;
  waitForAssetsAndSignalReady();
}

function startGame_init(players, startTime) {
  gameStartTime = startTime;
  // Update any player data that may have changed
  Object.values(players).forEach(data => {
    const p = getAllPlayers().find(p => p.id === data.id);
    if (p) { p.color = data.color; p.kills = data.kills || 0; }
  });

  if (!gameRunning) {
    gameRunning = true;
    requestAnimationFrame(gameLoop);
  }
}

function waitForAssetsAndSignalReady() {
  // Draw loading screen
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#e8b84b';
  ctx.font      = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Loading assets...', CANVAS_W / 2, CANVAS_H / 2 - 20);

  const progress = localPlayer ? localPlayer.loaded / Math.max(localPlayer.total, 1) : 0;
  ctx.fillStyle = '#333';
  ctx.fillRect(CANVAS_W / 2 - 150, CANVAS_H / 2 + 10, 300, 18);
  ctx.fillStyle = '#e8b84b';
  ctx.fillRect(CANVAS_W / 2 - 150, CANVAS_H / 2 + 10, 300 * progress, 18);
  ctx.fillStyle = '#fff';
  ctx.font      = '14px Arial';
  ctx.fillText(`${Math.round(progress * 100)}%`, CANVAS_W / 2, CANVAS_H / 2 + 45);

  if (localPlayer && localPlayer.ready) {
    ctx.fillStyle = '#2ecc71';
    ctx.font      = 'bold 18px Arial';
    ctx.fillText('✔ Ready! Waiting for other players...', CANVAS_W / 2, CANVAS_H / 2 + 80);
    // Only emit once
    if (!waitForAssetsAndSignalReady.sent) {
      waitForAssetsAndSignalReady.sent = true;
      socket.emit('player_ready');
    }
    // Keep redrawing the ready screen while waiting
    setTimeout(waitForAssetsAndSignalReady, 200);
    return;
  }

  setTimeout(waitForAssetsAndSignalReady, 100);
}

// ---- Input ----
const keys = {};
window.addEventListener('keydown', e => {
  if (!keys[e.code]) {
    keys[e.code] = true;
    if (!localPlayer || localPlayer.dead) return;
    if (e.code === 'KeyE') localPlayer.switchWeapon();
    if (e.code === 'KeyJ') localPlayer.startAttack();
    if (e.code === 'Space') localPlayer.startDash(getMoveX(), getMoveY());
    if (e.code === 'KeyN')  localPlayer.startSlide(getMoveX(), getMoveY());
  }
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function getMoveX() { return (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0); }
function getMoveY() { return (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0); }

// ---- Map & Combat ----
const gameMap = new GameMap();
const combat  = new CombatSystem();

// ---- Players ----
const remotePlayers = {};
let   localPlayer   = null;

function createLocalPlayer(data) {
  const p    = new Player({ name: data.name, x: data.x, y: data.y });
  p.id       = data.id;
  p.color    = data.color || '#fff';
  p.kills    = data.kills || 0;
  p.onAttack = (attacker) => {
    const stats = WEAPON_STATS[attacker.weapon];
    if (attacker.weapon === 'pistol') {
      const dir = attacker.facingLeft ? -1 : 1;
      const cx  = attacker.x + attacker.w / 2 + dir * 60;
      const cy  = attacker.y + attacker.h * 0.55;
      combat.bullets.push(new Bullet(cx, cy, dir, 0, stats.damage, attacker.id));
      socket.emit('bullet_fired', { x: cx, y: cy, dirX: dir, dirY: 0, damage: stats.damage, ownerId: attacker.id });
      playSound('pistol', 0.8);
    } else {
      playSound(attacker.weapon === 'sword' ? 'sword' : 'punch', 0.8);
      const hitbox = attacker.getAttackHitbox();
      getAllPlayers().forEach(target => {
        if (target === attacker || target.dead) return;
        if (combat._overlaps(hitbox, target)) {
          socket.emit('player_damaged', { targetId: target.id, damage: stats.damage, killerId: socket.id });
          combat.hitEffects.push(new HitEffect(target.x + target.w / 2, target.y + target.h * 0.6));
        }
      });
    }
  };
  return p;
}

function createRemotePlayer(data) {
  const p  = new Player({ name: data.name, x: data.x, y: data.y });
  p.id     = data.id;
  p.color  = data.color || '#fff';
  p.kills  = data.kills || 0;
  return p;
}

function getAllPlayers() {
  const all = Object.values(remotePlayers);
  if (localPlayer) all.push(localPlayer);
  return all;
}

// ---- Socket events (socket is defined in index.html) ----
socket.on('player_update', (data) => {
  if (localPlayer && data.id === localPlayer.id) return;
  let p = remotePlayers[data.id];
  if (!p) { p = createRemotePlayer(data); remotePlayers[data.id] = p; }
  p.x = data.x; p.y = data.y; p.hp = data.hp; p.dead = data.dead;
  p.weapon = data.weapon; p.facingLeft = data.facingLeft;
  p.currentAnim = data.currentAnim; p.animFrame = data.animFrame;
});

socket.on('player_left', ({ id }) => { delete remotePlayers[id]; });

socket.on('bullet_fired', (data) => {
  combat.bullets.push(new Bullet(data.x, data.y, data.dirX, data.dirY, data.damage, data.ownerId));
});

socket.on('player_damaged', ({ targetId, hp, killerId, killed, killerName, targetName, killerKills }) => {
  try {
  const target = getAllPlayers().find(p => p.id === targetId);
  if (!target) return;
  const wasAlive = !target.dead;
  target.hp = hp;
  if (killed && wasAlive) {
    target.dead = true;
    target.currentAnim = 'death'; target.animFrame = 0; target.animTimer = 0;
    // Update killer's kill count
    if (killerId) {
      const killer = getAllPlayers().find(p => p.id === killerId);
      if (killer) killer.kills = killerKills;
    }
    // Heal local player if they got the kill
    if (killerId === socket.id && localPlayer && !localPlayer.dead) {
      localPlayer.heal(30);
    }
    // Add to kill feed
    if (killerName) {
      addKillFeed(killerName, targetName);
    } else {
      addKillFeed(null, targetName); // border kill
    }
  } else {
    target._setAnim('hit');
  }
  combat.hitEffects.push(new HitEffect(target.x + target.w / 2, target.y + target.h * 0.6));
  } catch (err) {
    console.error('player_damaged handler error:', err);
  }
});

socket.on('game_over', ({ winner }) => { gameOver = true; winnerName = winner; });

// ---- Camera — clamps to map edges so player stays centered ----
const camera = { x: 0, y: 0 };

function updateCamera() {
  if (!localPlayer) return;
  camera.x = Math.max(0, Math.min(localPlayer.x + localPlayer.w / 2 - CANVAS_W / 2, MAP_WIDTH  - CANVAS_W));
  camera.y = Math.max(0, Math.min(localPlayer.y + localPlayer.h / 2 - CANVAS_H / 2, MAP_HEIGHT - CANVAS_H));
}

// ---- Border ----
const border = {
  startX: 0, startY: 0, startW: MAP_WIDTH, startH: MAP_HEIGHT,
  endX: MAP_WIDTH / 2 - 80, endY: MAP_HEIGHT / 2 - 80, endW: 160, endH: 160,
  elapsed: 0,
};

function getBorderRect(elapsed) {
  const t = Math.min(elapsed / BORDER_DURATION, 1);
  return {
    x: border.startX + (border.endX - border.startX) * t,
    y: border.startY + (border.endY - border.startY) * t,
    w: border.startW + (border.endW - border.startW) * t,
    h: border.startH + (border.endH - border.startH) * t,
  };
}

function isOutsideBorder(player, rect) {
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;
  return cx < rect.x || cx > rect.x + rect.w || cy < rect.y || cy > rect.y + rect.h;
}

// ---- Game state ----
let borderHitCooldown = 0;
let netTimer          = 0;
const NET_RATE        = 1 / 20;

function sendUpdate(roomCode) {
  if (!localPlayer || !socket.connected) return;
  socket.emit('player_update', {
    id: socket.id, name: localPlayer.name,
    x: localPlayer.x, y: localPlayer.y,
    hp: localPlayer.hp, dead: localPlayer.dead,
    weapon: localPlayer.weapon, facingLeft: localPlayer.facingLeft,
    currentAnim: localPlayer.currentAnim, animFrame: localPlayer.animFrame,
  });
}

// ---- Draw ----
function drawBorder(rect) {
  ctx.save();
  ctx.fillStyle = 'rgba(180,0,0,0.22)';
  ctx.fillRect(-camera.x, -camera.y, MAP_WIDTH, rect.y);
  ctx.fillRect(-camera.x, rect.y + rect.h - camera.y, MAP_WIDTH, MAP_HEIGHT - rect.y - rect.h);
  ctx.fillRect(-camera.x, rect.y - camera.y, rect.x, rect.h);
  ctx.fillRect(rect.x + rect.w - camera.x, rect.y - camera.y, MAP_WIDTH - rect.x - rect.w, rect.h);
  ctx.shadowColor = 'rgba(255,50,50,0.8)'; ctx.shadowBlur = 16;
  ctx.strokeStyle = 'rgba(255,60,60,0.95)'; ctx.lineWidth = 3;
  ctx.strokeRect(rect.x - camera.x, rect.y - camera.y, rect.w, rect.h);
  ctx.restore();
}

function drawHUD(roomCode) {
  if (!localPlayer) return;
  const timeLeft = Math.max(0, BORDER_DURATION - border.elapsed);
  const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secs = Math.floor(timeLeft % 60).toString().padStart(2, '0');

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(CANVAS_W / 2 - 75, 10, 150, 38);
  ctx.fillStyle = timeLeft < 30 ? '#f55' : '#fff';
  ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
  ctx.fillText(`⏱ ${mins}:${secs}`, CANVAS_W / 2, 36);

  const alive = getAllPlayers().filter(p => !p.dead).length;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(CANVAS_W - 120, 10, 110, 38);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
  ctx.fillText(`👥 ${alive} alive`, CANVAS_W - 65, 34);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(10, 10, 130, 30);
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'left';
  ctx.fillText(`Room: ${roomCode}`, 16, 30);

  const ratio = localPlayer.hp / localPlayer.maxHp;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(10, CANVAS_H - 50, 200, 40);
  ctx.fillStyle = '#500'; ctx.fillRect(14, CANVAS_H - 34, 190, 14);
  ctx.fillStyle = `hsl(${ratio * 120},100%,40%)`; ctx.fillRect(14, CANVAS_H - 34, 190 * ratio, 14);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(14, CANVAS_H - 34, 190, 14);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'left';
  ctx.fillText(`${localPlayer.name}  HP: ${Math.ceil(localPlayer.hp)}`, 14, CANVAS_H - 38);

  if (border.elapsed < 10) {
    const alpha = Math.max(0, 1 - border.elapsed / 10);
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.5})`;
    ctx.fillRect(10, CANVAS_H - 72, 620, 20);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.font = '13px Arial'; ctx.textAlign = 'left';
    ctx.fillText('WASD: Move  |  Space: Dash  |  N: Slide  |  E: Switch Weapon  |  J: Attack', 14, CANVAS_H - 57);
  }
}

function drawKillFeed(dt) {
  // Update timers
  for (let i = killFeed.length - 1; i >= 0; i--) {
    killFeed[i].timer -= dt;
    if (killFeed[i].timer <= 0) killFeed.splice(i, 1);
  }
  if (killFeed.length === 0) return;

  const x      = CANVAS_W - 14;
  const startY = 170;
  const lineH  = 26;

  ctx.font      = 'bold 13px Arial';
  ctx.textAlign = 'right';

  killFeed.forEach((entry, i) => {
    const alpha = Math.min(1, entry.timer / 0.8);
    const y     = startY + i * lineH;
    const w     = ctx.measureText(entry.text).width + 16;

    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.6})`;
    ctx.beginPath();
    ctx.roundRect(x - w, y - 16, w, 20, 4);
    ctx.fill();

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillText(entry.text, x - 6, y - 1);
  });
}

function drawMinimap() {
  const SIZE   = 120;
  const PAD    = 14;
  const mx     = CANVAS_W - SIZE - PAD;
  const my     = CANVAS_H - SIZE - PAD;
  const scaleX = SIZE / MAP_WIDTH;
  const scaleY = SIZE / MAP_HEIGHT;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(mx, my, SIZE, SIZE);
  ctx.strokeStyle = '#555';
  ctx.lineWidth   = 1;
  ctx.strokeRect(mx, my, SIZE, SIZE);

  // Border zone
  const rect = getBorderRect(border.elapsed);
  ctx.strokeStyle = 'rgba(255,60,60,0.8)';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(
    mx + rect.x * scaleX,
    my + rect.y * scaleY,
    rect.w * scaleX,
    rect.h * scaleY
  );

  // Players
  getAllPlayers().forEach(p => {
    if (p.dead) return;
    const px = mx + (p.x + p.w / 2) * scaleX;
    const py = my + (p.y + p.h / 2) * scaleY;
    const isLocal = localPlayer && p.id === localPlayer.id;

    ctx.beginPath();
    ctx.arc(px, py, isLocal ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = p.color || '#fff';
    ctx.fill();

    if (isLocal) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
  });

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font      = '10px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('MAP', mx + 4, my + 11);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';

  const isWinner = winnerName && localPlayer && winnerName === localPlayer.name;

  if (winnerName) {
    if (isWinner) {
      // YOU WON
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 72px Arial';
      ctx.fillText('🏆 YOU WON!', CANVAS_W / 2, CANVAS_H / 2 - 30);
    } else {
      // YOU LOST
      ctx.fillStyle = '#ff4444'; ctx.font = 'bold 72px Arial';
      ctx.fillText('💀 YOU LOST!', CANVAS_W / 2, CANVAS_H / 2 - 50);
      ctx.fillStyle = '#aaa'; ctx.font = 'bold 28px Arial';
      ctx.fillText(`Winner: ${winnerName}`, CANVAS_W / 2, CANVAS_H / 2 + 10);
    }
  } else {
    ctx.fillStyle = '#f55'; ctx.font = 'bold 72px Arial';
    ctx.fillText('DRAW!', CANVAS_W / 2, CANVAS_H / 2 - 30);
  }

  ctx.fillStyle = '#888'; ctx.font = '20px Arial';
  ctx.fillText('Refresh to play again', CANVAS_W / 2, CANVAS_H / 2 + 80);
}

// ---- Game loop ----
let lastTime = null;

function gameLoop(timestamp) {
  if (!gameRunning) return;
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  // Get roomCode from the lobby variable
  const rc = (typeof myRoomCode !== 'undefined') ? myRoomCode : '';

  // Compute elapsed from server timestamp so all clients stay in sync
  border.elapsed = (Date.now() - gameStartTime) / 1000;
  const rect = getBorderRect(border.elapsed);

  if (localPlayer && !localPlayer.dead) {
    localPlayer.update(dt, getMoveX(), getMoveY());
    if (isOutsideBorder(localPlayer, rect)) {
      if (borderHitCooldown <= 0) {
        socket.emit('player_damaged', { targetId: socket.id, damage: BORDER_DAMAGE_PER_SEC * 2, killerId: null });
        borderHitCooldown = 2;
      } else {
        localPlayer.hp = Math.max(0, localPlayer.hp - BORDER_DAMAGE_PER_SEC * dt);
        if (localPlayer.hp <= 0 && !localPlayer.dead) {
          socket.emit('player_damaged', { targetId: socket.id, damage: 999, killerId: null });
        }
      }
      borderHitCooldown -= dt;
    } else {
      borderHitCooldown = 0;
    }
  } else if (localPlayer?.dead) {
    localPlayer._updateAnim(dt);
  }

  Object.values(remotePlayers).forEach(p => p._updateAnim(dt));
  updateCamera();
  combat.update(dt, getAllPlayers());

  netTimer += dt;
  if (netTimer >= NET_RATE) { netTimer = 0; sendUpdate(rc); }

  // Draw
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (gameMap.ready) {
    gameMap.draw(ctx, camera);
  } else {
    ctx.fillStyle = '#c8c8c8'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#333'; ctx.font = '20px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Loading assets...', CANVAS_W / 2, CANVAS_H / 2);
  }

  drawBorder(rect);
  Object.values(remotePlayers).forEach(p => p.draw(ctx, camera));
  if (localPlayer) localPlayer.draw(ctx, camera);
  combat.draw(ctx, camera);
  drawHUD(rc);
  drawKillFeed(dt);
  drawMinimap();

  if (gameOver) { drawGameOver(); }

  requestAnimationFrame(gameLoop);
}
