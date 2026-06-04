const BULLET_SPEED = 650;

class HitEffect {
  constructor(x, y) {
    this.x       = x;
    this.y       = y;
    this.timer   = 0.25; // seconds to live
    this.maxTime = 0.25;
  }

  update(dt) { this.timer -= dt; }
  get alive() { return this.timer > 0; }

  draw(ctx, camera) {
    const sx      = this.x - camera.x;
    const sy      = this.y - camera.y;
    const ratio   = this.timer / this.maxTime;
    const radius  = (1 - ratio) * 40 + 10;
    const alpha   = ratio;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Outer ring
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff4400';
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Inner flash
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffdd00';
    ctx.fill();

    // Star spikes
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth   = 2;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(angle) * radius * 0.5, sy + Math.sin(angle) * radius * 0.5);
      ctx.lineTo(sx + Math.cos(angle) * radius * 1.2, sy + Math.sin(angle) * radius * 1.2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

class Bullet {
  constructor(x, y, dirX, dirY, damage, ownerId) {
    this.x       = x;
    this.y       = y;
    this.dirX    = dirX;
    this.dirY    = dirY;
    this.damage  = damage;
    this.ownerId = ownerId;
    this.alive   = true;
    this.w       = 20;
    this.h       = 10;

    // Load bullet image once (shared)
    if (!Bullet.img) {
      Bullet.img     = new Image();
      Bullet.img.src = 'assets/environment/bullet.png';
    }
  }

  update(dt) {
    this.x += this.dirX * BULLET_SPEED * dt;
    this.y += this.dirY * BULLET_SPEED * dt;
    // Kill if out of map
    if (this.x < 0 || this.x > MAP_WIDTH || this.y < 0 || this.y > MAP_HEIGHT) {
      this.alive = false;
    }
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const angle = Math.atan2(this.dirY, this.dirX);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    if (Bullet.img && Bullet.img.complete && Bullet.img.naturalWidth > 0) {
      ctx.drawImage(Bullet.img, -this.w / 2, -this.h / 2, this.w, this.h);
    } else {
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}
Bullet.img = null;

class CombatSystem {
  constructor() {
    this.bullets    = [];
    this.hitEffects = [];
  }

  // Called when a player's attack animation hits
  processAttack(attacker, allPlayers) {
    const stats = WEAPON_STATS[attacker.weapon];

    if (attacker.weapon === 'pistol') {
      // Fire a bullet
      const dir  = attacker.facingLeft ? -1 : 1;
      const cx   = attacker.x + attacker.w / 2 + dir * 60;
      const cy   = attacker.y + attacker.h * 0.55;
      this.bullets.push(new Bullet(cx, cy, dir, 0, stats.damage, attacker.name));
    } else {
      // Melee — check hitbox overlap
      const hitbox = attacker.getAttackHitbox();
      allPlayers.forEach(target => {
        if (target === attacker || target.dead) return;
        if (this._overlaps(hitbox, target)) {
          target.takeDamage(stats.damage);
          const cx = target.x + target.w / 2;
          const cy = target.y + target.h * 0.6;
          this.hitEffects.push(new HitEffect(cx, cy));
        }
      });
    }
  }

  // Called each frame — updates bullets and checks bullet hits
  update(dt, allPlayers) {
    // Update bullets
    this.bullets.forEach(b => {
      if (!b.alive) return;
      b.update(dt);
      // Check bullet vs players
      allPlayers.forEach(target => {
        if (!b.alive || target.id === b.ownerId || target.dead) return;
        if (this._overlaps(b, target)) {
          target.takeDamage(b.damage);
          const cx = target.x + target.w / 2;
          const cy = target.y + target.h * 0.6;
          this.hitEffects.push(new HitEffect(cx, cy));
          b.alive = false;
        }
      });
    });

    this.bullets    = this.bullets.filter(b => b.alive);
    this.hitEffects.forEach(e => e.update(dt));
    this.hitEffects = this.hitEffects.filter(e => e.alive);
  }

  draw(ctx, camera) {
    this.bullets.forEach(b    => b.draw(ctx, camera));
    this.hitEffects.forEach(e => e.draw(ctx, camera));
  }

  _overlaps(a, b) {
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + (a.h || 20) > b.y;
  }
}
