const MAP_WIDTH  = 3200;
const MAP_HEIGHT = 2400;

const OBSTACLES = [
  // Buildings
  { type: 'building1', x: 300,  y: 400,  w: 220, h: 180 },
  { type: 'building2', x: 700,  y: 800,  w: 200, h: 160 },
  { type: 'building3', x: 1400, y: 300,  w: 210, h: 170 },
  { type: 'building1', x: 2100, y: 900,  w: 220, h: 180 },
  { type: 'building2', x: 2600, y: 400,  w: 200, h: 160 },
  { type: 'building3', x: 2900, y: 1500, w: 210, h: 170 },
  { type: 'building1', x: 1050, y: 500,  w: 220, h: 180 },
  { type: 'building2', x: 1800, y: 1400, w: 200, h: 160 },
  { type: 'building3', x: 500,  y: 1100, w: 210, h: 170 },
  { type: 'building1', x: 2400, y: 600,  w: 220, h: 180 },
  { type: 'building2', x: 150,  y: 1700, w: 200, h: 160 },
  { type: 'building3', x: 2700, y: 1900, w: 210, h: 170 },
  { type: 'building1', x: 1600, y: 700,  w: 220, h: 180 },
  { type: 'building2', x: 1000, y: 1100, w: 200, h: 160 },

  // Houses
  { type: 'house1',    x: 500,  y: 1500, w: 250, h: 160 },
  { type: 'house2',    x: 1100, y: 1800, w: 240, h: 150 },
  { type: 'house4',    x: 1800, y: 600,  w: 230, h: 155 },
  { type: 'house1',    x: 2400, y: 1700, w: 250, h: 160 },
  { type: 'house2',    x: 800,  y: 2000, w: 240, h: 150 },
  { type: 'house4',    x: 2800, y: 2100, w: 230, h: 155 },
  { type: 'house1',    x: 1300, y: 1400, w: 250, h: 160 },
  { type: 'house2',    x: 2100, y: 200,  w: 240, h: 150 },
  { type: 'house4',    x: 650,  y: 600,  w: 230, h: 155 },
  { type: 'house1',    x: 2900, y: 300,  w: 250, h: 160 },
  { type: 'house2',    x: 1600, y: 2100, w: 240, h: 150 },
  { type: 'house4',    x: 350,  y: 2200, w: 230, h: 155 },
  { type: 'house1',    x: 2200, y: 1500, w: 250, h: 160 },
  { type: 'house2',    x: 1000, y: 1300, w: 240, h: 150 },
  { type: 'house4',    x: 400,  y: 600,  w: 230, h: 155 },
  { type: 'house2',    x: 1500, y: 2100, w: 240, h: 150 },

  // Trees
  { type: 'tree1',     x: 150,  y: 700,  w: 100, h: 130 },
  { type: 'tree2',     x: 900,  y: 350,  w: 110, h: 140 },
  { type: 'tree1',     x: 1600, y: 1200, w: 100, h: 130 },
  { type: 'tree2',     x: 2200, y: 550,  w: 110, h: 140 },
  { type: 'tree1',     x: 2700, y: 800,  w: 100, h: 130 },
  { type: 'tree2',     x: 400,  y: 2100, w: 110, h: 140 },
  { type: 'tree1',     x: 1900, y: 2000, w: 100, h: 130 },
  { type: 'tree2',     x: 3000, y: 700,  w: 110, h: 140 },
  { type: 'tree1',     x: 1300, y: 2000, w: 100, h: 130 },
  { type: 'tree2',     x: 650,  y: 1200, w: 110, h: 140 },
  { type: 'tree1',     x: 2400, y: 300,  w: 100, h: 130 },
  { type: 'tree2',     x: 3050, y: 1400, w: 110, h: 140 },
  { type: 'tree1',     x: 100,  y: 2000, w: 100, h: 130 },
  { type: 'tree1',     x: 1500, y: 500,  w: 100, h: 130 },
  { type: 'tree2',     x: 2300, y: 1300, w: 110, h: 140 },
  { type: 'tree1',     x: 750,  y: 1600, w: 100, h: 130 },
  { type: 'tree2',     x: 1200, y: 2200, w: 110, h: 140 },
  { type: 'tree1',     x: 2800, y: 1200, w: 100, h: 130 },
  { type: 'tree2',     x: 100,  y: 300,  w: 110, h: 140 },
  { type: 'tree1',     x: 2500, y: 2100, w: 100, h: 130 },
  { type: 'tree2',     x: 1700, y: 900,  w: 110, h: 140 },
  { type: 'tree1',     x: 3050, y: 1800, w: 100, h: 130 },
  { type: 'tree2',     x: 450,  y: 400,  w: 110, h: 140 },

  // Rocks
  { type: 'rocks',     x: 250,  y: 1100, w: 90,  h: 60  },
  { type: 'rocks',     x: 1200, y: 600,  w: 90,  h: 60  },
  { type: 'rocks',     x: 1700, y: 1700, w: 90,  h: 60  },
  { type: 'rocks',     x: 2500, y: 1200, w: 90,  h: 60  },
  { type: 'rocks',     x: 3000, y: 2000, w: 90,  h: 60  },
  { type: 'rocks',     x: 600,  y: 2200, w: 90,  h: 60  },
  { type: 'rocks',     x: 1500, y: 400,  w: 90,  h: 60  },
  { type: 'rocks',     x: 400,  y: 1700, w: 90,  h: 60  },
  { type: 'rocks',     x: 2800, y: 600,  w: 90,  h: 60  },
  { type: 'rocks',     x: 1000, y: 2200, w: 90,  h: 60  },
  { type: 'rocks',     x: 2200, y: 1800, w: 90,  h: 60  },
  { type: 'rocks',     x: 1400, y: 800,  w: 90,  h: 60  },
  { type: 'rocks',     x: 900,  y: 1900, w: 90,  h: 60  },
  { type: 'rocks',     x: 2100, y: 700,  w: 90,  h: 60  },
  { type: 'rocks',     x: 1900, y: 1200, w: 90,  h: 60  },
  { type: 'rocks',     x: 2700, y: 500,  w: 90,  h: 60  },
  { type: 'rocks',     x: 300,  y: 900,  w: 90,  h: 60  },
  { type: 'rocks',     x: 1100, y: 400,  w: 90,  h: 60  },
  { type: 'rocks',     x: 3000, y: 1100, w: 90,  h: 60  },
  { type: 'rocks',     x: 700,  y: 2300, w: 90,  h: 60  },
  { type: 'rocks',     x: 2000, y: 2200, w: 90,  h: 60  },
];

class GameMap {
  constructor() {
    this.images = {};
    this.loaded  = 0;
    this.total   = 0;
    this.ready   = false;

    const names = [
      'building1', 'building2', 'building3',
      'house1', 'house2', 'house4',
      'tree1', 'tree2',
      'rocks',
    ];

    this.total = names.length;
    names.forEach(name => {
      const img = new Image();
      img.src = `assets/environment/${name}.png`;
      img.onload  = () => { this.loaded++; if (this.loaded === this.total) this.ready = true; };
      img.onerror = () => { this.loaded++; if (this.loaded === this.total) this.ready = true; };
      this.images[name] = img;
    });
  }

  draw(ctx, camera) {
    // Light grey background so black stickman outlines are visible
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(-camera.x, -camera.y, MAP_WIDTH, MAP_HEIGHT);

    this._drawObstacles(ctx, camera);
  }

  _drawObstacles(ctx, camera) {
    OBSTACLES.forEach(ob => {
      const img = this.images[ob.type];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, ob.x - camera.x, ob.y - camera.y, ob.w, ob.h);
      } else {
        // Fallback rectangle if image fails to load
        ctx.fillStyle = '#555';
        ctx.fillRect(ob.x - camera.x, ob.y - camera.y, ob.w, ob.h);
      }
    });
  }
}
