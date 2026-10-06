// ============================================================
//  FROGGY ROAD — Основная игровая логика
// ============================================================

/* ---------- Константы ---------- */
const CELL = 1, GRID_W = 13, HALF_W = Math.floor(GRID_W / 2);
const VIEW_AHEAD = 22, VIEW_BEHIND = 7;
const JUMP_DUR = 0.12, JUMP_H = 0.45;
const WRAP_BUF = 6, FADE_DIST = 3.5;
const GROUND_W = 2 * (HALF_W + WRAP_BUF) + 4;
const MIN_VIEW_W = 17, MIN_VIEW_H = 13;
// Высота центра тела лягушки над поверхностью (половина высоты тела = 0.34/2)
const FROG_REST_Y = 0.17;
// Высота поверхности бревна над плоскостью полосы (body.y=0.04, h=0.24 → top=0.16)
const LOG_SURFACE_Y = 0.16;

/* Смещение камеры: -X влево, +Y вверх, -Z сзади */
const CAM_OFF = new THREE.Vector3(-5, 11, -3);

/* ---------- Состояние игры ---------- */
let scene, camera, renderer, dirLight, ambLight;
let frog, lanes = {}, score = 0, maxGen = -10;
let gameState = 'menu';
let camZ = 0, deathAnim = null, prevT = 0;
let cycleTime = 0;
const CYCLE_DUR = 120;
let starsMesh = null, blobShadow = null;
let isTouchDevice = false;
let highScore = parseInt(localStorage.getItem('froggyHighScore') || '0');

/* ---------- Общие материалы ---------- */
const M = {};
function initMats() {
    M.grass1   = new THREE.MeshLambertMaterial({color:0x7EC850});
    M.grass2   = new THREE.MeshLambertMaterial({color:0x8FD960});
    M.road     = new THREE.MeshLambertMaterial({color:0x505050});
    M.roadLine = new THREE.MeshLambertMaterial({color:0xBBBBBB});
    M.water    = new THREE.MeshLambertMaterial({color:0x2196F3,transparent:true,opacity:.82});
    M.waterD   = new THREE.MeshLambertMaterial({color:0x1976D2,transparent:true,opacity:.7});
    M.frog     = new THREE.MeshLambertMaterial({color:0x4CAF50});
    M.frogDk   = new THREE.MeshLambertMaterial({color:0x2E7D32});
    M.frogLt   = new THREE.MeshLambertMaterial({color:0x81C784});
    M.eye      = new THREE.MeshLambertMaterial({color:0xFFFFFF,emissive:0x000000});
    M.pupil    = new THREE.MeshLambertMaterial({color:0x111111});
    M.pink     = new THREE.MeshLambertMaterial({color:0xFF69B4});
    M.pinkDk   = new THREE.MeshLambertMaterial({color:0xE91E8C});
    M.pinkLt   = new THREE.MeshLambertMaterial({color:0xFFB6C1});
    M.wheel    = new THREE.MeshLambertMaterial({color:0x333333});
    M.win      = new THREE.MeshLambertMaterial({color:0x81D4FA});
    M.headlight= new THREE.MeshLambertMaterial({color:0xFFFF88,emissive:0x000000});
    M.taillight= new THREE.MeshLambertMaterial({color:0xFF3333,emissive:0x000000});

    // Мягкое пятно света на дороге перед фарами — плоское, лежит на асфальте,
    // не торчит конусом в воздухе. Additive blending даёт свечение без резких краёв.
    M.headlightGlow = new THREE.MeshBasicMaterial({
        color: 0xFFEE99, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    
    M.log      = new THREE.MeshLambertMaterial({color:0x8B5E3C});
    M.logDk    = new THREE.MeshLambertMaterial({color:0x6D4C2A});
    M.trunk    = new THREE.MeshLambertMaterial({color:0x795548});
    M.leaf     = new THREE.MeshLambertMaterial({color:0x2E7D32});
    M.leafLt   = new THREE.MeshLambertMaterial({color:0x43A047});
    M.rock     = new THREE.MeshLambertMaterial({color:0x9E9E9E});
    M.rockDk   = new THREE.MeshLambertMaterial({color:0x757575});
    M.mushStem = new THREE.MeshLambertMaterial({color:0xF5DEB3});
    M.mushCap  = new THREE.MeshLambertMaterial({color:0xEE1133});
    M.mushSpot = new THREE.MeshLambertMaterial({color:0xFFFFFF});
}

/* ---------- Общие геометрии ---------- */
const G = {};
function initGeoms() {
    G.ground   = new THREE.BoxGeometry(GROUND_W, .1, CELL);
    G.roadDash = new THREE.BoxGeometry(.5, .02, .06);
    G.curb     = new THREE.BoxGeometry(GRID_W + 2, .06, .04);
    G.wheel    = new THREE.BoxGeometry(.18, .18, .12);
    G.win      = new THREE.BoxGeometry(.04, 1, 1); // масштаб настраивается для каждой машины
    G.headlightGlow = new THREE.PlaneGeometry(1, 0.6); // масштабируется для машины, лежит плоско на дороге
}

// ============================================================
//  ЛЯГУШКА
// ============================================================
class Frog {
    constructor() {
        this.group = new THREE.Group();
        this.gx = 0; this.gz = 0; this.maxZ = 0;
        this.alive = true; this.moving = false;
        this.prog = 0; this.driftX = 0;
        this.sx = 0; this.sz = 0;
        this.idleT = 0;
        this.eyes = [];
        this.combo = 0;
        this.lastJumpTime = 0;
        this.onLog = false;
        this._build();
        this.group.position.set(0, FROG_REST_Y, 0);
        scene.add(this.group);
        
        // Круглая тень (всегда остаётся на земле, не сплющивается)
        blobShadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.4, 8),
            new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:0.3})
        );
        blobShadow.rotation.x = -Math.PI / 2;
        blobShadow.position.y = 0.02;
        scene.add(blobShadow);
    }

    _build() {
        const g = this.group;
        const body = new THREE.Mesh(new THREE.BoxGeometry(.58, .34, .62), M.frog);
        body.castShadow = true; g.add(body); this.body = body;
        const belly = new THREE.Mesh(new THREE.BoxGeometry(.42, .06, .48), M.frogLt);
        belly.position.set(0, -.16, .02); g.add(belly);
        const head = new THREE.Mesh(new THREE.BoxGeometry(.52, .26, .34), M.frog);
        head.position.set(0, .14, .3); head.castShadow = true; g.add(head);
        
        [-.14, .14].forEach(x => {
            const e = new THREE.Mesh(new THREE.BoxGeometry(.16, .16, .16), M.eye);
            e.position.set(x, .33, .36); g.add(e); this.eyes.push(e);
            const p = new THREE.Mesh(new THREE.BoxGeometry(.09, .09, .09), M.pupil);
            p.position.set(x, .36, .43); g.add(p);
        });
        [-.3, .3].forEach(x => {
            const l = new THREE.Mesh(new THREE.BoxGeometry(.17, .13, .3), M.frogDk);
            l.position.set(x, -.08, -.06); l.castShadow = true; g.add(l);
            const f = new THREE.Mesh(new THREE.BoxGeometry(.2, .06, .14), M.frogDk);
            f.position.set(x, -.12, -.2); g.add(f);
        });
        [-.26, .26].forEach(x => {
            const l = new THREE.Mesh(new THREE.BoxGeometry(.12, .1, .17), M.frogDk);
            l.position.set(x, -.08, .2); g.add(l);
            const f = new THREE.Mesh(new THREE.BoxGeometry(.15, .05, .1), M.frogDk);
            f.position.set(x, -.12, .28); g.add(f);
        });
    }

    tryMove(dx, dz) {
        if (this.moving || !this.alive || gameState !== 'playing') return false;
        // При движении вдоль бревна стартовая X берётся из текущей мировой позиции,
        // чтобы анимация прыжка начиналась точно там, где стоит лягушка.
        this.sx = this.group.position.x;
        this.sz = this.gz;
        // После прыжка лягушка должна встать на целую клетку от текущей gx.
        // Обновляем gx так, чтобы он совпадал с округлённой позицией + шаг.
        this.gx = Math.round(this.group.position.x) + dx;
        if (this.gx < -HALF_W || this.gx > HALF_W) return false;
        const nz = this.gz + dz;
        const tl = lanes[nz];
        if (tl && tl.type === 'grass' && tl.blocked.has(this.gx)) return false;
        this.gz = nz;
        this.driftX = 0;
        this.moving = true; this.prog = 0;

        // Система комбо — учитывается только при продвижении вперёд на новую клетку (gz > maxZ).
        // Это исключает накрутку очков прыжками влево/вправо или назад/вперёд:
        // нет продвижения по дистанции — нет комбо.
        const isNewGround = this.gz > this.maxZ;
        const now = performance.now();
        if (isNewGround && now - this.lastJumpTime < 1000) {
            this.combo++;
        } else if (isNewGround) {
            this.combo = 1;
        } else {
            this.combo = 0; // любой прыжок без продвижения сбрасывает серию комбо
        }
        this.lastJumpTime = now;

        if (isNewGround) {
            score += this.gz - this.maxZ;
            this.maxZ = this.gz;
            updScore();
            audio.playScore();
            if (this.combo > 1) {
                score += 1; // фиксированный бонус за серию быстрых прыжков вперёд
                updScore();
                showCombo(this.combo);
            }
        }

        // Сбор грибов
        const destLane = lanes[nz];
        if (destLane && destLane.mushrooms && destLane.mushrooms.has(nx)) {
            const mush = destLane.mushrooms.get(nx);
            destLane.grp.remove(mush);
            destLane.mushrooms.delete(nx);
            score += 1;
            updScore();
            audio.playPickup();
        }

        // Ориентация модели с учётом изометрического угла камеры (-X, -Z):
        if (dz > 0)       this.group.rotation.y = 0;            // Вперёд (+Z)
        else if (dz < 0)  this.group.rotation.y = Math.PI;      // Назад (-Z)
        else if (dx > 0)  this.group.rotation.y = Math.PI / 2;  // Влево (+X)
        else if (dx < 0)  this.group.rotation.y = -Math.PI / 2; // Вправо (-X)

        audio.playHop();
        return true;
    }

    update(dt) {
        if (!this.alive) return;
        if (this.moving) {
            this.prog += dt / JUMP_DUR;
            if (this.prog >= 1) { this.prog = 1; this.moving = false; }
            const t = this.prog;
            // Ease-in-out квадратичная интерполяция
            const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            this.group.position.x = this.sx + (this.gx - this.sx) * e;
            this.group.position.z = this.sz + (this.gz - this.sz) * e;
            // Высота дуги прыжка: стартует и заканчивается на поверхности назначения
            const destLane = lanes[this.gz];
            const destY = (destLane && destLane.type === 'river') ? LOG_SURFACE_Y + FROG_REST_Y : FROG_REST_Y;
            const srcLane = lanes[this.sz];
            const srcY = (srcLane && srcLane.type === 'river') ? LOG_SURFACE_Y + FROG_REST_Y : FROG_REST_Y;
            this.group.position.y = srcY + (destY - srcY) * e + Math.sin(t * Math.PI) * JUMP_H;
            const jp = Math.sin(t * Math.PI);
            this.group.scale.set(1 - jp * .13, 1 + jp * .32, 1 - jp * .13);
        } else {
            this.idleT += dt;
            this.group.scale.x += (1 - this.group.scale.x) * .15;
            this.group.scale.y += (1 - this.group.scale.y) * .15;
            this.group.scale.z += (1 - this.group.scale.z) * .15;
            const lane = lanes[this.gz];
            if (lane && lane.type === 'river') {
                let onLog = false;
                const fx = this.group.position.x;
                for (const lg of lane.logs) {
                    if (fx > lg.x - lg.hw - .18 && fx < lg.x + lg.hw + .18) {
                        onLog = true;
                        this.driftX += lane.spd * lane.dir * dt;
                        this.group.position.x = this.gx + this.driftX;
                        break;
                    }
                }
                if (!onLog) die('water');
                if (Math.abs(this.group.position.x) > HALF_W + 1) die('water');
                // Лягушка стоит поверх бревна
                this.group.position.y = LOG_SURFACE_Y + FROG_REST_Y
                    + Math.sin(this.idleT * 2.5) * .008;
            } else {
                this.group.position.x += (this.gx - this.group.position.x) * .18;
                this.group.position.z = this.gz;
                this.group.position.y = FROG_REST_Y + Math.sin(this.idleT * 3) * .012;
            }
        }
        
        // Обновление позиции круглой тени
        blobShadow.position.x = this.group.position.x;
        blobShadow.position.z = this.group.position.z;
        // Тень всегда на поверхности (земля или бревно)
        const shadowLane = lanes[this.gz];
        blobShadow.position.y = (shadowLane && shadowLane.type === 'river') ? LOG_SURFACE_Y + 0.01 : 0.02;
    }

    setEyeGlow(v) { this.eyes.forEach(e => { e.material.emissive.setRGB(v, v, v * .8); }); }
    destroy() { scene.remove(this.group); scene.remove(blobShadow); }
}

// ============================================================
//  КОНСТРУКТОРЫ ОБЪЕКТОВ
// ============================================================
function buildTree(parent, x) {
    const g = new THREE.Group(); g.position.set(x, 0, 0);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(.22, .55, .22), M.trunk);
    tr.position.y = .275; tr.castShadow = true; g.add(tr);
    [.78, .58, .38].forEach((s, i) => {
        const lf = new THREE.Mesh(new THREE.BoxGeometry(s, .28, s), i % 2 === 0 ? M.leaf : M.leafLt);
        lf.position.y = .65 + i * .3; lf.castShadow = true; g.add(lf);
    });
    parent.add(g);
}

function buildRock(parent, x) {
    const g = new THREE.Group(); g.position.set(x, 0, 0);
    const s = .28 + Math.random() * .25;
    const r = new THREE.Mesh(new THREE.BoxGeometry(s, s * .75, s), Math.random() > .5 ? M.rock : M.rockDk);
    r.position.y = s * .375; r.castShadow = true; g.add(r);
    parent.add(g);
}

function buildMushroom(parent, x) {
    const g = new THREE.Group(); g.position.set(x, 0, 0);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.1, .2, .1), M.mushStem);
    stem.position.y = .1; stem.castShadow = true; g.add(stem);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(.3, .14, .3), M.mushCap);
    cap.position.y = .24; cap.castShadow = true; g.add(cap);
    [[-.06, .32, .06], [.06, .32, -.06], [0, .32, 0]].forEach(p => {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(.06, .02, .06), M.mushSpot);
        sp.position.set(...p); g.add(sp);
    });
    parent.add(g);
    return g;
}

function buildCar(lane, x) {
    const g = new THREE.Group();
    const types = [{l:1.2,h:.38,rl:.55,rh:.28},{l:1.6,h:.42,rl:.85,rh:.32},{l:2.0,h:.48,rl:1.1,rh:.36},{l:2.5,h:.52,rl:.75,rh:.42}];
    const tp = types[Math.floor(Math.random() * types.length)];

    // Perf: все машины используют ОБЩИЕ (shared) материалы — ноль клонов на
    // машину, что позволяет Three.js батчить отрисовку. Fade у границы экрана
    // реализован геометрически (масштаб/погружение самой группы), а не через
    // прозрачность материалов — см. updateLanes().
    const mBody = M.pink, mRoof = M.pinkDk, mBump = M.pinkLt, mWheel = M.wheel, mWin = M.win, mHl = M.headlight, mTl = M.taillight;

    const body = new THREE.Mesh(new THREE.BoxGeometry(tp.l, tp.h, .78), mBody);
    body.position.y = tp.h / 2 + .14; body.castShadow = true; body.receiveShadow = true; g.add(body);

    const ro = lane.dir > 0 ? -.12 : .12;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(tp.rl, tp.rh, .72), mRoof);
    roof.position.set(ro, tp.h + tp.rh / 2 + .14, 0); roof.castShadow = true; g.add(roof);

    [-tp.l / 2 + .06, tp.l / 2 - .06].forEach(bx => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(.08, tp.h * .6, .8), mBump);
        b.position.set(bx, tp.h / 2 + .14, 0); g.add(b);
    });

    const wh = tp.rh * .55;
    [ro + tp.rl / 2, ro - tp.rl / 2].forEach(wx => {
        const w = new THREE.Mesh(G.win, mWin);
        w.scale.set(1, wh, .62); w.position.set(wx, tp.h + tp.rh / 2 + .14, 0); g.add(w);
    });

    [[-tp.l/2+.18,.08,.38],[-tp.l/2+.18,.08,-.38],[tp.l/2-.18,.08,.38],[tp.l/2-.18,.08,-.38]].forEach(p => {
        const w = new THREE.Mesh(G.wheel, mWheel); w.position.set(...p); g.add(w);
    });

    // Фары и габаритные огни
    const frontX = lane.dir > 0 ? tp.l / 2 - .02 : -tp.l / 2 + .02;
    const backX = lane.dir > 0 ? -tp.l / 2 + .02 : tp.l / 2 - .02;
    [-.25, .25].forEach(z => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(.06, .08, .1), mHl);
        hl.position.set(frontX, tp.h / 2 + .14, z); g.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(.06, .08, .1), mTl);
        tl.position.set(backX, tp.h / 2 + .14, z); g.add(tl);
    });

    // Мягкое пятно света на дороге перед машиной (плоское, лежит на асфальте)
    const glow = new THREE.Mesh(G.headlightGlow, M.headlightGlow);
    glow.rotation.x = -Math.PI / 2;
    glow.scale.set(1.4, 1, 1);
    glow.position.set(frontX + (lane.dir > 0 ? 0.9 : -0.9), 0.02, 0);
    g.add(glow);

    g.position.set(x, 0, 0);
    lane.grp.add(g);
    return { mesh: g, x, hw: tp.l / 2, baseY: 0 };
}

function buildLog(lane, x, len) {
    const g = new THREE.Group();
    // Бревно: высота 0.24, центр на y=0 → верхняя грань на y=+0.12.
    // Позиция группы y=0.04 → верхняя грань в мировых координатах = 0.16 = LOG_SURFACE_Y.
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, .24, .68), M.log);
    body.position.y = 0; body.castShadow = true; body.receiveShadow = true; g.add(body);

    [-len / 2, len / 2].forEach(ex => {
        const c = new THREE.Mesh(new THREE.BoxGeometry(.18, .22, .63), M.logDk);
        c.position.set(ex + (ex > 0 ? -.09 : .09), 0, 0); g.add(c);
    });

    // Группа смещена так, чтобы верхняя грань была на высоте LOG_SURFACE_Y (0.16)
    g.position.set(x, LOG_SURFACE_Y - 0.12, 0);
    lane.grp.add(g);
    return { mesh: g, x, hw: len / 2, baseY: LOG_SURFACE_Y - 0.12 };
}

// ============================================================
//  ГЕНЕРАЦИЯ ПОЛОС
// ============================================================
function difficulty(z) { return Math.min(z / 60, 1); }

function pickType(z) {
    let cr = 0, cv = 0;
    for (let i = 1; i <= 4; i++) { const p = lanes[z - i]; if (!p) break; if (p.type === 'road') cr++; else break; }
    for (let i = 1; i <= 3; i++) { const p = lanes[z - i]; if (!p) break; if (p.type === 'river') cv++; else break; }
    const r = Math.random();
    if (cr >= 4) return r < .55 ? 'grass' : 'river';
    if (cv >= 3) return r < .55 ? 'grass' : 'road';
    if (r < .32) return 'grass';
    if (r < .68) return 'road';
    return 'river';
}

function makeLane(z) {
    const lane = { z, type: 'grass', grp: new THREE.Group(), blocked: new Set(), mushrooms: new Map(), cars: [], logs: [], spd: 0, dir: 1, ground: null };
    lane.grp.position.set(0, 0, z);
    scene.add(lane.grp);
    if (z < 4) lane.type = 'grass'; else lane.type = pickType(z);

    let gmat;
    switch (lane.type) {
        case 'grass': gmat = z % 2 === 0 ? M.grass1 : M.grass2; break;
        case 'road':  gmat = M.road; break;
        case 'river': gmat = M.water; break;
    }
    const ground = new THREE.Mesh(G.ground, gmat);
    ground.position.y = lane.type === 'river' ? -.03 : -.05;
    ground.receiveShadow = true;
    lane.grp.add(ground);
    lane.ground = ground;

    if (lane.type === 'grass') popGrass(lane, z);
    else if (lane.type === 'road') popRoad(lane, z);
    else popRiver(lane, z);

    lanes[z] = lane;
    return lane;
}

function popGrass(lane, z) {
    const num = Math.floor(Math.random() * 4);
    const occ = new Set();
    for (let i = 0; i < num; i++) {
        let x, att = 0;
        do { x = Math.floor(Math.random() * GRID_W) - HALF_W; att++; }
        while ((occ.has(x) || (x === 0 && z < 3)) && att < 30);
        if (att >= 30) continue;
        occ.add(x); lane.blocked.add(x);
        Math.random() < .65 ? buildTree(lane.grp, x) : buildRock(lane.grp, x);
    }
    
    const mushCount = Math.random() < .35 ? (Math.random() < .5 ? 1 : 2) : 0;
    for (let i = 0; i < mushCount; i++) {
        let x, att = 0;
        do { x = Math.floor(Math.random() * GRID_W) - HALF_W; att++; }
        while ((occ.has(x) || lane.blocked.has(x) || lane.mushrooms.has(x) || (x === 0 && z < 3)) && att < 30);
        if (att >= 30) continue;
        occ.add(x);
        const mushMesh = buildMushroom(lane.grp, x);
        lane.mushrooms.set(x, mushMesh);
    }
}

function popRoad(lane, z) {
    const d = difficulty(z);
    lane.spd = (1.8 + Math.random() * 2.8) * (1 + d * .55);
    lane.dir = Math.random() < .5 ? 1 : -1;
    const prev = lanes[z - 1];
    if (prev && prev.type === 'road') lane.dir = -prev.dir;
    const nc = 2 + Math.floor(Math.random() * 2);
    const span = GRID_W + 2 * WRAP_BUF;
    const spacing = span / nc;
    for (let i = 0; i < nc; i++) {
        const x = -HALF_W - WRAP_BUF + i * spacing + Math.random() * spacing * .25;
        lane.cars.push(buildCar(lane, x));
    }
    for (let x = -HALF_W; x <= HALF_W; x += 2) {
        const dash = new THREE.Mesh(G.roadDash, M.roadLine);
        dash.position.set(x, .011, 0); lane.grp.add(dash);
    }
}

function popRiver(lane, z) {
    const d = difficulty(z);
    lane.spd = (.9 + Math.random() * 1.4) * (1 + d * .35);
    lane.dir = Math.random() < .5 ? 1 : -1;
    const prev = lanes[z - 1];
    if (prev && prev.type === 'river') lane.dir = -prev.dir;
    const nl = 2 + Math.floor(Math.random() * 2);
    const span = GRID_W + 2 * WRAP_BUF;
    const spacing = span / nl;
    for (let i = 0; i < nl; i++) {
        const x = -HALF_W - WRAP_BUF + i * spacing;
        const len = (2.2 + Math.random() * 1.8) * (1 - d * .25);
        lane.logs.push(buildLog(lane, x, len));
    }
}

// ============================================================
//  УПРАВЛЕНИЕ МИРОМ
// ============================================================
function genLanes(upTo) { while (maxGen < upTo) { maxGen++; makeLane(maxGen); } }
function cleanLanes() {
    const minZ = camZ - VIEW_BEHIND - 5;
    for (const k in lanes) {
        const z = parseInt(k);
        if (z < minZ) { scene.remove(lanes[z].grp); delete lanes[z]; }
    }
}

// ============================================================
//  ПРОВЕРКА КОЛЛИЗИЙ
// ============================================================
function checkCollisions() {
    if (!frog.alive || frog.moving) return;
    const fx = frog.group.position.x;
    const cl = lanes[frog.gz];

    if (cl && cl.type === 'road') {
        for (const c of cl.cars) {
            if (Math.abs(fx - c.x) < c.hw + .2) { die('car'); return; }
        }
    }
    if (cl && cl.type === 'river') {
        let onLog = false;
        for (const lg of cl.logs) {
            if (fx > lg.x - lg.hw - .18 && fx < lg.x + lg.hw + .18) { onLog = true; break; }
        }
        if (!onLog) { die('water'); return; }
    }
    if (frog.gz < camZ - VIEW_BEHIND + 1) die('behind');
}

// ============================================================
//  КАМЕРА
// ============================================================
function setupCam() { camera.position.copy(CAM_OFF); camera.lookAt(0, 0, 4); }
function updateCam() {
    const targetZ = Math.max(camZ, frog.maxZ);
    camZ += (targetZ - camZ) * 0.04;
    camera.position.set(CAM_OFF.x, CAM_OFF.y, CAM_OFF.z + camZ);
    dirLight.position.set(-4 + camZ, 16, 4 + camZ);
    dirLight.target.position.set(0, 0, camZ);
    dirLight.target.updateMatrixWorld();
}
function updateFrustum() {
    const asp = window.innerWidth / window.innerHeight;
    let w, h;
    if (asp > MIN_VIEW_W / MIN_VIEW_H) { h = MIN_VIEW_H / 2; w = h * asp; } 
    else { w = MIN_VIEW_W / 2; h = w / asp; }
    camera.left = -w; camera.right = w; camera.top = h; camera.bottom = -h;
    camera.updateProjectionMatrix();
}

// ============================================================
//  СМЕНА ДНЯ И НОЧИ И ЗОНЫ ОПАСНОСТИ
// ============================================================
const dayKF = [
    { t:0.00, sky:0x87CEEB, fog:0x87CEEB, fogN:20, fogF:44, ambC:0xffffff, ambI:.5, dirC:0xffffff, dirI:.85, star:0 },
    { t:0.30, sky:0x87CEEB, fog:0x87CEEB, fogN:20, fogF:44, ambC:0xffffff, ambI:.5, dirC:0xffffff, dirI:.85, star:0 },
    { t:0.42, sky:0xE85D04, fog:0xD45604, fogN:17, fogF:38, ambC:0xFFBB77, ambI:.38, dirC:0xFF8844, dirI:.6, star:0 },
    { t:0.52, sky:0x1B1464, fog:0x151058, fogN:14, fogF:32, ambC:0x334488, ambI:.2, dirC:0x6688CC, dirI:.3, star:.85 },
    { t:0.78, sky:0x0D0D2B, fog:0x0A0A22, fogN:13, fogF:30, ambC:0x223366, ambI:.15, dirC:0x5577BB, dirI:.25, star:1 },
    { t:0.90, sky:0xFF6D00, fog:0xE06000, fogN:17, fogF:38, ambC:0xFFAA66, ambI:.35, dirC:0xFF7733, dirI:.6, star:0 },
    { t:1.00, sky:0x87CEEB, fog:0x87CEEB, fogN:20, fogF:44, ambC:0xffffff, ambI:.5, dirC:0xffffff, dirI:.85, star:0 }
];

function lerpC(a, b, f) { return new THREE.Color(a).lerp(new THREE.Color(b), f); }
function getDayVals(t) {
    t = ((t % 1) + 1) % 1;
    let i = 0;
    for (let j = 0; j < dayKF.length - 1; j++) {
        if (t >= dayKF[j].t && t <= dayKF[j + 1].t) { i = j; break; }
    }
    const a = dayKF[i], b = dayKF[i + 1];
    const f = (b.t - a.t) > 0 ? (t - a.t) / (b.t - a.t) : 0;
    return {
        sky: lerpC(a.sky, b.sky, f), fog: lerpC(a.fog, b.fog, f),
        fogN: a.fogN + (b.fogN - a.fogN) * f, fogF: a.fogF + (b.fogF - a.fogF) * f,
        ambC: lerpC(a.ambC, b.ambC, f), ambI: a.ambI + (b.ambI - a.ambI) * f,
        dirC: lerpC(a.dirC, b.dirC, f), dirI: a.dirI + (b.dirI - a.dirI) * f,
        star: a.star + (b.star - a.star) * f
    };
}

function updateDayNight(dt) {
    cycleTime = (cycleTime + dt / CYCLE_DUR) % 1;
    const v = getDayVals(cycleTime);
    
    // Опасная зона (прогрессивная сложность)
    const diff = frog ? difficulty(frog.gz) : 0;
    const danger = Math.max(0, (diff - 0.6) / 0.4);
    v.sky.lerp(new THREE.Color(0xFF3333), danger * 0.15);
    v.fog.lerp(new THREE.Color(0xFF3333), danger * 0.15);

    scene.background.copy(v.sky);
    scene.fog.color.copy(v.fog);
    scene.fog.near = v.fogN;
    scene.fog.far = v.fogF;
    ambLight.color.copy(v.ambC);
    ambLight.intensity = v.ambI;
    dirLight.color.copy(v.dirC);
    dirLight.intensity = v.dirI;

    if (starsMesh) { starsMesh.material.opacity = v.star; starsMesh.position.z = camZ; }
    if (frog && frog.alive) frog.setEyeGlow(Math.max(0, v.star) * .6);

    const nf = Math.max(0, v.star);
    M.headlight.emissive.setRGB(nf * 1.0, nf * 0.85, nf * 0.25);
    M.taillight.emissive.setRGB(nf * 0.8, nf * 0.0, nf * 0.0);
    M.headlightGlow.opacity = nf * 0.45;
}

function createStars() {
    const pos = new Float32Array(250 * 3);
    for (let i = 0; i < 250; i++) {
        pos[i * 3] = (Math.random() - .5) * 60;
        pos[i * 3 + 1] = 14 + Math.random() * 20;
        pos[i * 3 + 2] = (Math.random() - .5) * 60;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starsMesh = new THREE.Points(geom, new THREE.PointsMaterial({ color: 0xffffff, size: .18, transparent: true, opacity: 0 }));
    scene.add(starsMesh);
}

// ============================================================
//  ОКОНЧАНИЕ ИГРЫ / ПЕРЕЗАПУСК / СТАРТ
// ============================================================
function die(cause) {
    if (!frog.alive) return;
    frog.alive = false; gameState = 'gameover';
    if (cause === 'water') audio.playSplash(); else audio.playHit();
    audio.stopMusic();
    if (navigator.vibrate) navigator.vibrate(200); // Тактильный отклик (вибрация)
    deathAnim = { type: cause === 'water' ? 'sink' : 'flat', p: 0, d: cause === 'water' ? .45 : .3 };
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('froggyHighScore', highScore);
    }
    
    setTimeout(() => {
        document.getElementById('final-score').textContent = score;
        document.getElementById('go-high-score').textContent = highScore;
        document.getElementById('overlay').classList.add('show');
    }, 700);
}

function restart() {
    for (const k in lanes) { scene.remove(lanes[k].grp); delete lanes[k]; }
    frog.destroy();
    score = 0; maxGen = -10; camZ = 0; deathAnim = null; gameState = 'playing';
    cycleTime = 0;
    frog = new Frog();
    genLanes(VIEW_AHEAD);
    updScore();
    document.getElementById('overlay').classList.remove('show');
    audio.startMusic();
}

function startGame() {
    gameState = 'playing';
    document.getElementById('main-menu').classList.remove('show');
    if (!audio.ctx) audio.init();
    audio.startMusic();
}

function updScore() {
    const el = document.getElementById('score');
    el.textContent = score;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

function showCombo(c) {
    const el = document.getElementById('combo-display');
    el.textContent = `COMBO x${c}! (+${c})`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1000);
}

// ============================================================
//  ОБРАБОТКА ВВОДА
// ============================================================
function setupInput() {
    const initAudio = () => { if (!audio.ctx) audio.init(); audio.resume(); };

    document.addEventListener('keydown', e => {
        initAudio(); 
        const h = document.getElementById('hint'); if (h) h.style.opacity = '0';
        if (gameState !== 'playing') return;
        // Преобразование осей с учётом ракурса камеры (-X, -Z)
        switch (e.key) {
            case 'ArrowUp':    case 'w': case 'W': frog.tryMove(0, 1);  e.preventDefault(); break;
            case 'ArrowDown':  case 's': case 'S': frog.tryMove(0, -1); e.preventDefault(); break;
            case 'ArrowLeft':  case 'a': case 'A': frog.tryMove(1, 0);  e.preventDefault(); break; // +X влево на экране
            case 'ArrowRight': case 'd': case 'D': frog.tryMove(-1, 0); e.preventDefault(); break; // -X вправо на экране
        }
    });

    document.getElementById('mute-btn').addEventListener('click', () => { initAudio(); audio.toggleMute(); });
    document.getElementById('play-btn').addEventListener('click', startGame);
    document.getElementById('restart-btn').addEventListener('click', restart);

    // Экранный D-Pad
    const dpadMap = { 'dpad-up': [0, 1], 'dpad-down': [0, -1], 'dpad-left': [1, 0], 'dpad-right': [-1, 0] };
    for (const [id, [dx, dz]] of Object.entries(dpadMap)) {
        const btn = document.getElementById(id);
        const handler = e => { e.preventDefault(); initAudio(); if (gameState === 'playing') frog.tryMove(dx, dz); };
        btn.addEventListener('touchstart', handler, { passive: false });
        btn.addEventListener('mousedown', handler);
    }

    // Управление свайпами
    let tx = 0, ty = 0;
    document.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
    document.addEventListener('touchend', e => {
        initAudio();
        if (gameState !== 'playing') return;
        const dx = e.changedTouches[0].clientX - tx;
        const dy = e.changedTouches[0].clientY - ty;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
        if (Math.abs(dy) > Math.abs(dx)) { dy < 0 ? frog.tryMove(0, 1) : frog.tryMove(0, -1); }
        else { dx > 0 ? frog.tryMove(-1, 0) : frog.tryMove(1, 0); } // Свайп вправо соответствует -X
    }, { passive: true });

    window.addEventListener('touchstart', () => {
        if (!isTouchDevice) { isTouchDevice = true; document.getElementById('dpad').classList.add('show'); }
    }, { once: true, passive: true });

    window.addEventListener('resize', () => { updateFrustum(); renderer.setSize(window.innerWidth, window.innerHeight); });
}

// ============================================================
//  ОБНОВЛЕНИЕ ПОЛОС (Геометрическое скрытие без дублирования материалов)
// ============================================================
// Оптимизация производительности: плавное скрытие на границах выполняется
// за счёт масштабирования и погружения группы по Y, а не через прозрачность
// материалов. Это позволяет использовать единый пул общих материалов M{}
// для всех машин и брёвен без клонирования объектов в памяти.
function applyEdgeFade(obj, x, hw, wMin, wMax) {
    let f = 1;
    if (x > wMax - FADE_DIST) f = 1 - (x - (wMax - FADE_DIST)) / FADE_DIST;
    else if (x < wMin + FADE_DIST) f = (x - wMin) / FADE_DIST;
    f = Math.max(0, Math.min(1, f));
    const s = Math.max(0.001, f);
    obj.mesh.scale.y = s;
    // Смещаем группу вниз относительно базового Y объекта
    obj.mesh.position.y = obj.baseY + (1 - f) * -0.5;
}

function updateLanes(dt) {
    const wMax = HALF_W + WRAP_BUF, wMin = -HALF_W - WRAP_BUF;
    for (const k in lanes) {
        const l = lanes[k];
        if (l.type === 'road') {
            for (const c of l.cars) {
                c.x += l.spd * l.dir * dt;
                if (l.dir > 0 && c.x > wMax + c.hw) c.x = wMin - c.hw;
                else if (l.dir < 0 && c.x < wMin - c.hw) c.x = wMax + c.hw;
                c.mesh.position.x = c.x;
                applyEdgeFade(c, c.x, c.hw, wMin, wMax);
            }
        }
        if (l.type === 'river') {
            if (l.ground) l.ground.position.y = -.03 + Math.sin(performance.now() * .0015 + l.z * .7) * .008;
            for (const lg of l.logs) {
                lg.x += l.spd * l.dir * dt;
                if (l.dir > 0 && lg.x > wMax + lg.hw) lg.x = wMin - lg.hw;
                else if (l.dir < 0 && lg.x < wMin - lg.hw) lg.x = wMax + lg.hw;
                lg.mesh.position.x = lg.x;
                applyEdgeFade(lg, lg.x, lg.hw, wMin, wMax);
            }
        }
    }
}

// ============================================================
//  ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ
// ============================================================
function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - prevT) / 1000, .1);
    prevT = now;

    if (gameState === 'playing' || (gameState === 'gameover' && deathAnim)) {
        frog.update(dt);
        updateLanes(dt);
        checkCollisions();
        if (deathAnim) {
            deathAnim.p += dt / deathAnim.d;
            const t = Math.min(deathAnim.p, 1);
            if (deathAnim.type === 'flat') {
                frog.group.scale.set(1 + t * .6, Math.max(.08, 1 - t * .85), 1 + t * .6);
            } else {
                frog.group.position.y = FROG_REST_Y - t * .55;
                frog.group.scale.set(1 - t * .35, 1 - t * .35, 1 - t * .35);
            }
            if (t >= 1) deathAnim = null;
        }
        genLanes(frog.gz + VIEW_AHEAD);
        cleanLanes();
        updateCam();
        updateDayNight(dt);
    }
    renderer.render(scene, camera);
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 44);

    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 120);
    updateFrustum();

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Ограничение DPR до 1.5 на мобильных: выше не даёт заметного улучшения,
    // но режет fillrate и быстро садит батарею.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    ambLight = new THREE.AmbientLight(0xffffff, .5);
    scene.add(ambLight);
    
    dirLight = new THREE.DirectionalLight(0xffffff, .85);
    dirLight.position.set(-4, 16, 4);
    dirLight.castShadow = true;
    // Оптимизированный усечённый конус теней для стабильного FPS
    const ss = 13;
    dirLight.shadow.camera.left = -ss; dirLight.shadow.camera.right = ss;
    dirLight.shadow.camera.top = ss; dirLight.shadow.camera.bottom = -ss;
    dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 45;
    // 1024 вместо 2048 — разница почти незаметна при изометрии,
    // но вдвое снижает нагрузку на GPU при прорисовке теневой карты.
    dirLight.shadow.mapSize.width = 1024; dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);
    scene.add(dirLight.target);

    initMats(); initGeoms();
    setupCam();
    createStars();

    frog = new Frog();
    genLanes(VIEW_AHEAD);
    setupInput();
    
    // Инициализация отображения лучшего счёта
    document.getElementById('menu-high-score').textContent = `Best Score: ${highScore}`;

    prevT = performance.now();
    animate();
}

init();