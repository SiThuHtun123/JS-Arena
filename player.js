// player.js — Player class with animation state machine, movement, combat, and healing
const PLAYER_SPEED   = 200;
const DASH_SPEED     = 520;
const DASH_DURATION  = 0.36;
const DASH_COOLDOWN  = 1.0;
const SLIDE_DURATION = 0.5;
const SLIDE_COOLDOWN = 1.2;
const SLIDE_SPEED    = 380;

const WEAPON_STATS = {
  fighter: { damage: 4,  range: 15,  cooldown: 0.6,  animKey: 'combo',  animCount: 19, animStart: 64, fps: 18 },
  sword:   { damage: 12, range: 25,  cooldown: 0.8,  animKey: 'combo',  animCount: 11, animStart: 65, fps: 16 },
  pistol:  { damage: 8,  range: 900, cooldown: 1.0,  animKey: 'shot',   animCount: 2,  animStart: 64, fps: 10 },
};

const ANIM = {
  idle:          { prefix: 'Idle',  start: 1,  count: 8,  fps: 8,  loop: true  },
  walk:          { prefix: 'walk',  start: 9,  count: 8,  fps: 10, loop: true  },
  run:           { prefix: 'run',   start: 17, count: 8,  fps: 12, loop: true  },
  dash:          { prefix: 'dash',  start: 33, count: 6,  fps: 14, loop: false },
  slide:         { prefix: 'slide', start: 25, count: 8,  fps: 12, loop: false },
  hit:           { prefix: 'hit',   start: 48, count: 4,  fps: 10, loop: false },
  death:         { prefix: 'death', start: 52, count: 10, fps: 8,  loop: false },
  combo_fighter: { prefix: 'combo', start: 64, count: 19, fps: 18, loop: false },
  combo_sword:   { prefix: 'combo', start: 65, count: 11, fps: 16, loop: false },
  shot:          { prefix: 'shot',  start: 64, count: 2,  fps: 10, loop: false },
};

// Each weapon uses a different attack animation
const WEAPON_ANIM = { fighter: 'combo_fighter', sword: 'combo_sword', pistol: 'shot' };

// Sword has different combo start frame
const SWORD_COMBO_START = 65;

class Player {
  constructor({ name, x, y, weapon = 'fighter', color = null }) {
    this.name   = name;
    this.x      = x;
    this.y      = y;
    this.w      = 220;
    this.h      = 220;
    this.weapon = weapon;
    this.weapons      = ['fighter', 'sword', 'pistol'];
    this.weaponIndex  = 0;

    this.hp    = 100;
    this.maxHp = 100;
    this.dead  = false;

    this.speed      = PLAYER_SPEED;
    this.facingLeft = false;
    this.color      = color;

    this.vx = 0;
    this.vy = 0;

    this.dashing      = false;
    this.dashTimer    = 0;
    this.dashCooldown = 0;
    this.dashDirX     = 0;
    this.dashDirY     = 0;

    this.sliding       = false;
    this.slideTimer    = 0;
    this.slideCooldown = 0;
    this.slideDirX     = 0;
    this.slideDirY     = 0;

    // Attack state
    this.attacking      = false;
    this.attackCooldown = 0;
    // Called back by combat system when attack frame hits
    this.onAttack = null;

    this.currentAnim = 'idle';
    this.animFrame   = 0;
    this.animTimer   = 0;
    this.animDone    = false;

    this.healFlash   = 0;
    this.kills       = 0;

    this.sprites = {};
    this.loaded  = 0;
    this.total   = 0;
    this.ready   = false;

    this._loadSprites();
  }

  _loadSprites() {
    ['fighter', 'sword', 'pistol'].forEach(wp => {
      this.sprites[wp] = {};
      Object.keys(ANIM).forEach(animKey => {
        const def = ANIM[animKey];
        this.sprites[wp][animKey] = [];

        // Sword combo starts at frame 65 not 64
        let startFrame = def.start;
        if (wp === 'sword' && animKey === 'combo') startFrame = SWORD_COMBO_START;

        // Only load the matching combo for each weapon
        if (animKey === 'combo_fighter' && wp !== 'fighter') return;
        if (animKey === 'combo_sword'   && wp !== 'sword')   return;
        if (animKey === 'shot' && wp !== 'pistol') return;

        for (let i = 0; i < def.count; i++) {
          const frameNum   = startFrame + i;
          const paddedNum  = frameNum.toString().padStart(4, '0');
          const filename   = `${wp}_${def.prefix}_${paddedNum}.png`;
          const img        = new Image();
          img.src          = `assets/characters/${wp}/${filename}`;
          this.total++;
          img.onload  = () => { this.loaded++; if (this.loaded >= this.total) this.ready = true; };
          img.onerror = () => { this.loaded++; if (this.loaded >= this.total) this.ready = true; };
          this.sprites[wp][animKey].push(img);
        }
      });
    });
  }

  _setAnim(name) {
    if (this.currentAnim === name) return;
    if (this.currentAnim === 'death') return;
    // Don't interrupt attack unless hit or death
    if (this.attacking && name !== 'hit' && name !== 'death') return;
    if (this.currentAnim === 'hit' && !this.animDone && name !== 'death') return;
    this.currentAnim = name;
    this.animFrame   = 0;
    this.animTimer   = 0;
    this.animDone    = false;
  }

  switchWeapon() {
    if (this.dead || this.attacking) return;
    this.weaponIndex = (this.weaponIndex + 1) % this.weapons.length;
    this.weapon      = this.weapons[this.weaponIndex];
    playSound('weapon_switch', 0.5);
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.dead      = true;
      this.attacking = false;
      this.currentAnim = 'death';
      this.animFrame   = 0;
      this.animTimer   = 0;
      this.animDone    = false;
      playSound('death', 0.8);
    } else {
      this.attacking = false;
      this._setAnim('hit');
      playSound('get_hit', 0.7);
    }
  }

  // Called when this player gets a kill — restores HP up to max
  heal(amount) {
    if (this.dead) return;
    this.hp        = Math.min(this.maxHp, this.hp + amount);
    this.healFlash = 0.8; // seconds of green flash
  }

  startAttack() {
    if (this.dead || this.attacking || this.attackCooldown > 0) return;
    const stats        = WEAPON_STATS[this.weapon];
    this.attacking      = true;
    this.attackCooldown = stats.cooldown;

    const animKey = WEAPON_ANIM[this.weapon];
    this.currentAnim = animKey;
    this.animFrame   = 0;
    this.animTimer   = 0;
    this.animDone    = false;
  }

  startDash(dx, dy) {
    if (this.dashing || this.dashCooldown > 0 || this.sliding || this.dead) return;
    this.dashDirX = dx !== 0 || dy !== 0 ? dx : (this.facingLeft ? -1 : 1);
    this.dashDirY = dy;
    const len     = Math.sqrt(this.dashDirX ** 2 + this.dashDirY ** 2) || 1;
    this.dashDirX /= len;
    this.dashDirY /= len;
    this.dashing   = true;
    this.dashTimer = DASH_DURATION;
    this._setAnim('dash');
  }

  startSlide(dx, dy) {
    if (this.sliding || this.slideCooldown > 0 || this.dashing || this.dead) return;
    this.slideDirX = dx !== 0 || dy !== 0 ? dx : (this.facingLeft ? -1 : 1);
    this.slideDirY = dy;
    const len      = Math.sqrt(this.slideDirX ** 2 + this.slideDirY ** 2) || 1;
    this.slideDirX /= len;
    this.slideDirY /= len;
    this.sliding    = true;
    this.slideTimer = SLIDE_DURATION;
    this._setAnim('slide');
  }

  // Returns a hitbox {x,y,w,h} in front of the player for melee
  getAttackHitbox() {
    const stats = WEAPON_STATS[this.weapon];
    const cx    = this.x + this.w / 2;
    const cy    = this.y + this.h * 0.6;
    const dir   = this.facingLeft ? -1 : 1;
    return {
      x: this.facingLeft ? cx - stats.range : cx,
      y: cy - 60,
      w: stats.range,
      h: 120,
    };
  }

  update(dt, dx, dy) {
    if (this.dead) { this._updateAnim(dt); return; }

    if (this.attackCooldown  > 0) this.attackCooldown  -= dt;
    if (this.dashCooldown    > 0) this.dashCooldown    -= dt;
    if (this.slideCooldown   > 0) this.slideCooldown   -= dt;
    if (this.healFlash       > 0) this.healFlash       -= dt;

    // Movement — locked during attack (except dash/slide)
    if (this.dashing) {
      this.dashTimer -= dt;
      this.vx = this.dashDirX * DASH_SPEED;
      this.vy = this.dashDirY * DASH_SPEED;
      if (this.dashTimer <= 0) { this.dashing = false; this.dashCooldown = DASH_COOLDOWN; }
    } else if (this.sliding) {
      this.slideTimer -= dt;
      this.vx = this.slideDirX * SLIDE_SPEED;
      this.vy = this.slideDirY * SLIDE_SPEED;
      if (this.slideTimer <= 0) { this.sliding = false; this.slideCooldown = SLIDE_COOLDOWN; }
    } else if (!this.attacking) {
      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
      this.vx = dx * this.speed;
      this.vy = dy * this.speed;
    } else {
      // Slow down while attacking
      this.vx *= 0.85;
      this.vy *= 0.85;
    }

    this.x = Math.max(0, Math.min(this.x + this.vx * dt, MAP_WIDTH  - this.w));
    this.y = Math.max(0, Math.min(this.y + this.vy * dt, MAP_HEIGHT - this.h));

    if (this.vx < 0) this.facingLeft = true;
    if (this.vx > 0) this.facingLeft = false;

    // Movement animation (only when not in special state)
    if (!this.dashing && !this.sliding && !this.attacking) {
      const moving = dx !== 0 || dy !== 0;
      if (!moving) this._setAnim('idle');
      else         this._setAnim('run');
    }

    this._updateAnim(dt);
  }

  _updateAnim(dt) {
    const def = ANIM[this.currentAnim];
    if (!def) return;

    this.animTimer += dt;
    const frameDur = 1 / def.fps;

    if (this.animTimer >= frameDur) {
      this.animTimer -= frameDur;
      if (this.animFrame < def.count - 1) {
        this.animFrame++;

        // Trigger attack hit at midpoint of attack animation
        if (this.attacking && this.onAttack) {
          const midFrame = Math.floor(def.count / 2);
          if (this.animFrame === midFrame) {
            this.onAttack(this);
          }
        }
      } else if (def.loop) {
        this.animFrame = 0;
      } else {
        this.animDone = true;
        if (this.currentAnim === 'hit') {
          this.currentAnim = 'idle'; this.animFrame = 0; this.animTimer = 0; this.animDone = false;
        }
        if (['combo_fighter', 'combo_sword', 'shot'].includes(this.currentAnim)) {
          this.attacking   = false;
          this.currentAnim = 'idle'; this.animFrame = 0; this.animTimer = 0; this.animDone = false;
        }
      }
    }
  }

  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (sx + this.w < 0 || sx > 1280 || sy + this.h < 0 || sy > 720) return;

    const animKey = this.currentAnim;
    const frames  = this.sprites[this.weapon]?.[animKey]
                 ?? this.sprites['fighter']?.[animKey]
                 ?? this.sprites[this.weapon]?.['idle'];
    const frame   = frames?.[this.animFrame];

    ctx.save();
    if (this.facingLeft) {
      ctx.translate(sx + this.w / 2, sy + this.h / 2);
      ctx.scale(-1, 1);
      ctx.translate(-(this.w / 2), -(this.h / 2));
    } else {
      ctx.translate(sx, sy);
    }

    if (frame && frame.complete && frame.naturalWidth > 0) {
      ctx.drawImage(frame, 0, 0, this.w, this.h);
    } else {
      ctx.fillStyle = this.color || '#4af';
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.restore();

    this._drawHUD(ctx, sx, sy);
  }

  _drawHUD(ctx, sx, sy) {
    const barW   = 100;
    const barX   = sx + this.w / 2 - barW / 2;
    const charTop = sy + this.h * 0.38;
    const barY   = charTop - 20;

    ctx.fillStyle = '#500';
    ctx.fillRect(barX, barY, barW, 7);
    const ratio = this.hp / this.maxHp;

    // Heal flash — pulse bright green
    if (this.healFlash > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.healFlash * 20);
      ctx.fillStyle = `hsl(120, 100%, ${40 + pulse * 30}%)`;
    } else {
      ctx.fillStyle = `hsl(${ratio * 120}, 100%, 40%)`;
    }
    ctx.fillRect(barX, barY, barW * ratio, 7);
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 1;
    ctx.strokeRect(barX, barY, barW, 7);

    // Name tag with kill count
    const label   = this.kills > 0 ? `${this.name} 💀x${this.kills}` : this.name;
    ctx.font      = 'bold 12px Arial';
    ctx.textAlign = 'center';
    const nameW   = ctx.measureText(label).width;
    const nameX   = sx + this.w / 2;
    const nameY   = barY - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(nameX - nameW / 2 - 5, nameY - 13, nameW + 10, 16, 4);
    ctx.fill();
    ctx.fillStyle = this.color || '#fff';
    ctx.fillText(label, nameX, nameY);

  }
}
