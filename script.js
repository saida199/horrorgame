/**
 * SHADOWRUN — horror-game.js
 * Architecture OOP complète
 * Classes : Game, Maze, Player, Monster, Renderer, AudioEngine, InputHandler, ParticleSystem
 */

"use strict";

/* ═══════════════════════════════════════
   CONSTANTES
═══════════════════════════════════════ */
const TILE = 40;          // taille d'une case en pixels
const COLS = 19;          // colonnes labyrinthe (impair)
const ROWS = 15;          // lignes labyrinthe (impair)
const WALL  = 1;
const FLOOR = 0;
const EXIT  = 2;

const COLORS = {
    wall:      '#1a0a00',
    wallLight: '#2a1200',
    floor:     '#070507',
    floorLit:  '#120b0f',
    exit:      '#00ff88',
    exitGlow:  'rgba(0,255,136,0.3)',
    player:    '#ffcc44',
    monster:   '#cc0000',
    blood:     '#8b0000',
};

/* ═══════════════════════════════════════
   CLASSE : AudioEngine (sons synthétiques via Web Audio API)
═══════════════════════════════════════ */
class AudioEngine {
    constructor() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.4;
            this.masterGain.connect(this.ctx.destination);
            this.enabled = true;
        } catch(e) {
            this.enabled = false;
        }
        this._ambienceNode = null;
        this._heartbeatInterval = null;
    }

    _resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    /** Son de pas */
    playStep() {
        if (!this.enabled) return;
        this._resume();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.masterGain);
        o.frequency.value = 80 + Math.random() * 40;
        o.type = 'sine';
        g.gain.setValueAtTime(0.15, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
        o.start(); o.stop(this.ctx.currentTime + 0.15);
    }

    /** Son de dégât */
    playHurt() {
        if (!this.enabled) return;
        this._resume();
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.connect(g); g.connect(this.masterGain);
                o.frequency.value = 180 - i * 30;
                o.type = 'sawtooth';
                g.gain.setValueAtTime(0.5, this.ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
                o.start(); o.stop(this.ctx.currentTime + 0.4);
            }, i * 80);
        }
    }

    /** Son de victoire */
    playExit() {
        if (!this.enabled) return;
        this._resume();
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.connect(g); g.connect(this.masterGain);
                o.frequency.value = freq;
                o.type = 'triangle';
                g.gain.setValueAtTime(0.3, this.ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
                o.start(); o.stop(this.ctx.currentTime + 0.3);
            }, i * 120);
        });
    }

    /** Ambiance bourdonnante */
    startAmbience() {
        if (!this.enabled || this._ambienceNode) return;
        this._resume();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 60;
        o.type = 'sawtooth';
        o.frequency.value = 55;
        g.gain.value = 0.04;
        o.connect(filter); filter.connect(g); g.connect(this.masterGain);
        o.start();
        // LFO pour moduler
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 0.15;
        lfoGain.gain.value = 15;
        lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
        lfo.start();
        this._ambienceNode = { o, g, lfo };
    }

    stopAmbience() {
        if (!this._ambienceNode) return;
        try {
            this._ambienceNode.o.stop();
            this._ambienceNode.lfo.stop();
        } catch(e) {}
        this._ambienceNode = null;
    }

    /** Battement de coeur quand le monstre approche */
    startHeartbeat(fast = false) {
        this.stopHeartbeat();
        const interval = fast ? 400 : 900;
        this._heartbeatInterval = setInterval(() => {
            if (!this.enabled) return;
            this._resume();
            [0, 150].forEach(delay => {
                setTimeout(() => {
                    const o = this.ctx.createOscillator();
                    const g = this.ctx.createGain();
                    o.connect(g); g.connect(this.masterGain);
                    o.frequency.value = 55;
                    o.type = 'sine';
                    g.gain.setValueAtTime(0.4, this.ctx.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
                    o.start(); o.stop(this.ctx.currentTime + 0.2);
                }, delay);
            });
        }, interval);
    }

    stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
    }

    /** Growl du monstre */
    playGrowl() {
        if (!this.enabled) return;
        this._resume();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const dist = this.ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i * 2) / 256 - 1;
            curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
        }
        dist.curve = curve;
        o.connect(dist); dist.connect(g); g.connect(this.masterGain);
        o.frequency.value = 40;
        o.type = 'sawtooth';
        o.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.8);
        g.gain.setValueAtTime(0.5, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
        o.start(); o.stop(this.ctx.currentTime + 0.8);
    }
}

/* ═══════════════════════════════════════
   CLASSE : Maze — Génération par DFS
═══════════════════════════════════════ */
class Maze {
    constructor(cols, rows) {
        this.cols = cols;
        this.rows = rows;
        this.grid = [];
        this.exitPos = { x: 0, y: 0 };
        this._generate();
    }

    _generate() {
        // Tout remplir de murs
        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(WALL));

        // DFS récursif depuis (1,1)
        const stack = [];
        const start = { x: 1, y: 1 };
        this.grid[start.y][start.x] = FLOOR;
        stack.push(start);

        const dirs = [
            { dx: 0, dy: -2 }, { dx: 0, dy: 2 },
            { dx: -2, dy: 0 }, { dx: 2, dy: 0 }
        ];

        while (stack.length > 0) {
            const cur = stack[stack.length - 1];
            const shuffled = [...dirs].sort(() => Math.random() - 0.5);
            let moved = false;

            for (const d of shuffled) {
                const nx = cur.x + d.dx;
                const ny = cur.y + d.dy;
                if (nx > 0 && nx < this.cols - 1 && ny > 0 && ny < this.rows - 1
                    && this.grid[ny][nx] === WALL) {
                    this.grid[ny][nx] = FLOOR;
                    this.grid[cur.y + d.dy / 2][cur.x + d.dx / 2] = FLOOR;
                    stack.push({ x: nx, y: ny });
                    moved = true;
                    break;
                }
            }
            if (!moved) stack.pop();
        }

        // Poser la sortie en bas à droite (chercher un sol)
        for (let x = this.cols - 2; x > 0; x--) {
            for (let y = this.rows - 2; y > 0; y--) {
                if (this.grid[y][x] === FLOOR) {
                    this.grid[y][x] = EXIT;
                    this.exitPos = { x, y };
                    return;
                }
            }
        }
    }

    isWalkable(x, y) {
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
        return this.grid[y][x] !== WALL;
    }

    getFloorTiles() {
        const tiles = [];
        for (let y = 0; y < this.rows; y++)
            for (let x = 0; x < this.cols; x++)
                if (this.grid[y][x] === FLOOR) tiles.push({ x, y });
        return tiles;
    }
}

/* ═══════════════════════════════════════
   CLASSE : Player
═══════════════════════════════════════ */
class Player {
    constructor(x, y) {
        this.x = x;   // position en tiles
        this.y = y;
        this.px = x * TILE + TILE / 2;  // position pixel (centre)
        this.py = y * TILE + TILE / 2;
        this.lives = 3;
        this.score = 0;
        this.invincible = false;
        this.invTimer = 0;
        this.bobTime = 0;
        this.flashRadius = 140;  // rayon lampe torche
    }

    move(dx, dy, maze) {
        const nx = this.x + dx;
        const ny = this.y + dy;
        if (maze.isWalkable(nx, ny)) {
            this.x = nx;
            this.y = ny;
            this.px = nx * TILE + TILE / 2;
            this.py = ny * TILE + TILE / 2;
            return true;
        }
        return false;
    }

    update(dt) {
        this.bobTime += dt * 4;
        if (this.invincible) {
            this.invTimer -= dt;
            if (this.invTimer <= 0) this.invincible = false;
        }
    }

    takeDamage() {
        if (this.invincible) return false;
        this.lives--;
        this.invincible = true;
        this.invTimer = 2.0;
        return true;
    }
}

/* ═══════════════════════════════════════
   CLASSE : Monster — IA de poursuite A*
═══════════════════════════════════════ */
class Monster {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.px = x * TILE + TILE / 2;
        this.py = y * TILE + TILE / 2;
        this.speed = 1.8;       // tiles/seconde
        this.moveTimer = 0;
        this.path = [];
        this.pathTimer = 0;
        this.pathInterval = 0.6; // recalcul du chemin toutes les 0.6s
        this.wobble = 0;
        this.scaleAnim = 1;
        this.angry = false;     // mode poursuite active
        this.glowPhase = 0;
        this.growlCooldown = 0;
    }

    /** A* simplifié (Manhattan) */
    findPath(maze, tx, ty) {
        const startKey = `${this.x},${this.y}`;
        const endKey   = `${tx},${ty}`;
        if (startKey === endKey) return [];

        const open   = new Map();
        const closed = new Set();
        const parent = new Map();
        const g      = new Map();

        const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
        const key = (x, y) => `${x},${y}`;

        open.set(key(this.x, this.y), { x: this.x, y: this.y, f: h(this.x, this.y) });
        g.set(key(this.x, this.y), 0);

        const dirs = [{dx:0,dy:-1},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:0}];
        let iterations = 0;

        while (open.size > 0 && iterations++ < 300) {
            // Trouver le noeud avec le plus petit f
            let best = null;
            for (const [, node] of open) {
                if (!best || node.f < best.f) best = node;
            }
            const curKey = key(best.x, best.y);
            if (curKey === endKey) {
                // Reconstruire le chemin
                const path = [];
                let k = endKey;
                while (parent.has(k)) {
                    const [px, py] = k.split(',').map(Number);
                    path.unshift({ x: px, y: py });
                    k = parent.get(k);
                }
                return path;
            }
            open.delete(curKey);
            closed.add(curKey);

            for (const d of dirs) {
                const nx = best.x + d.dx;
                const ny = best.y + d.dy;
                const nk = key(nx, ny);
                if (closed.has(nk) || !maze.isWalkable(nx, ny)) continue;
                const ng = (g.get(curKey) || 0) + 1;
                if (!open.has(nk) || ng < (g.get(nk) || Infinity)) {
                    g.set(nk, ng);
                    open.set(nk, { x: nx, y: ny, f: ng + h(nx, ny) });
                    parent.set(nk, curKey);
                }
            }
        }
        return [];
    }

    update(dt, maze, player, audio) {
        this.wobble += dt * 3;
        this.glowPhase += dt * 2;
        this.growlCooldown -= dt;

        // Recalcul du chemin
        this.pathTimer += dt;
        if (this.pathTimer >= this.pathInterval) {
            this.pathTimer = 0;
            this.path = this.findPath(maze, player.x, player.y);
            // Plus rapide si on voit le joueur (même couloir)
            this.angry = (this.path.length < 6);
        }

        const effectiveSpeed = this.angry ? this.speed * 1.6 : this.speed;

        // Se déplacer le long du chemin
        this.moveTimer += dt * effectiveSpeed;
        if (this.moveTimer >= 1 && this.path.length > 0) {
            this.moveTimer = 0;
            const next = this.path.shift();
            this.x = next.x;
            this.y = next.y;
            this.px = next.x * TILE + TILE / 2;
            this.py = next.y * TILE + TILE / 2;

            // Growl aléatoire
            if (this.growlCooldown <= 0 && Math.random() < 0.15) {
                audio.playGrowl();
                this.growlCooldown = 3 + Math.random() * 4;
            }
        }

        this.scaleAnim = 1 + Math.sin(this.wobble) * 0.08;
    }

    distanceTo(player) {
        return Math.abs(this.x - player.x) + Math.abs(this.y - player.y);
    }
}

/* ═══════════════════════════════════════
   CLASSE : Particle
═══════════════════════════════════════ */
class Particle {
    constructor(x, y, type = 'blood') {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 80;
        this.vy = (Math.random() - 0.5) * 80 - 30;
        this.life = 1;
        this.decay = 0.8 + Math.random() * 0.8;
        this.size = 2 + Math.random() * 4;
        this.type = type;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 120 * dt; // gravité
        this.life -= this.decay * dt;
    }
    get alive() { return this.life > 0; }
}

/* ═══════════════════════════════════════
   CLASSE : ParticleSystem
═══════════════════════════════════════ */
class ParticleSystem {
    constructor() { this.particles = []; }

    emit(x, y, count = 8, type = 'blood') {
        for (let i = 0; i < count; i++)
            this.particles.push(new Particle(x, y, type));
    }

    update(dt) {
        this.particles = this.particles.filter(p => { p.update(dt); return p.alive; });
    }

    draw(ctx) {
        this.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life * 0.8;
            if (p.type === 'blood') {
                ctx.fillStyle = `hsl(${0 + Math.random() * 10}, 80%, ${15 + p.life * 20}%)`;
            } else {
                ctx.fillStyle = `rgba(255, 200, 50, ${p.life})`;
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
}

/* ═══════════════════════════════════════
   CLASSE : Renderer — Dessin de tout
═══════════════════════════════════════ */
class Renderer {
    constructor(canvas, lightCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.lightCanvas = lightCanvas;
        this.lightCtx = lightCanvas.getContext('2d');
        this.resize();
        this.camX = 0;
        this.camY = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeTimer = 0;
        this.shakeMag = 0;
        this._exitGlowPhase = 0;
        this._monsterFlicker = 0;
    }

    resize() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.lightCanvas.width  = window.innerWidth;
        this.lightCanvas.height = window.innerHeight;
        this.W = window.innerWidth;
        this.H = window.innerHeight;
    }

    shake(magnitude = 10, duration = 0.3) {
        this.shakeMag = magnitude;
        this.shakeTimer = duration;
    }

    updateShake(dt) {
        if (this.shakeTimer > 0) {
            this.shakeTimer -= dt;
            this.shakeX = (Math.random() - 0.5) * this.shakeMag;
            this.shakeY = (Math.random() - 0.5) * this.shakeMag;
        } else {
            this.shakeX = 0;
            this.shakeY = 0;
        }
    }

    getCamera(player) {
        const cx = player.px - this.W / 2;
        const cy = player.py - this.H / 2;
        this.camX = cx + this.shakeX;
        this.camY = cy + this.shakeY;
    }

    drawMaze(maze, player) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(-this.camX, -this.camY);

        for (let y = 0; y < maze.rows; y++) {
            for (let x = 0; x < maze.cols; x++) {
                const tile = maze.grid[y][x];
                const px = x * TILE, py = y * TILE;

                // Distance à la lampe torche
                const dx = px + TILE/2 - player.px;
                const dy = py + TILE/2 - player.py;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const lit = Math.max(0, 1 - dist / player.flashRadius);

                if (tile === WALL) {
                    // Mur avec texture brique
                    const bright = Math.floor(lit * 60);
                    ctx.fillStyle = `rgb(${bright + 10}, ${bright * 0.3 + 3}, ${bright * 0.3 + 3})`;
                    ctx.fillRect(px, py, TILE, TILE);
                    // Détail brique
                    if (lit > 0.1) {
                        ctx.strokeStyle = `rgba(${bright + 20}, ${bright * 0.3}, ${bright * 0.3}, 0.4)`;
                        ctx.lineWidth = 0.5;
                        ctx.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
                    }
                } else if (tile === EXIT) {
                    // Sol
                    ctx.fillStyle = `rgb(${Math.floor(lit*22)}, ${Math.floor(lit*12)}, ${Math.floor(lit*18)})`;
                    ctx.fillRect(px, py, TILE, TILE);
                    // Glow sortie
                    this._exitGlowPhase += 0.002;
                    const exitPulse = 0.5 + 0.5 * Math.sin(this._exitGlowPhase * 60);
                    ctx.save();
                    ctx.globalAlpha = 0.3 + exitPulse * 0.5;
                    const grad = ctx.createRadialGradient(
                        px + TILE/2, py + TILE/2, 0,
                        px + TILE/2, py + TILE/2, TILE
                    );
                    grad.addColorStop(0, '#00ff88');
                    grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad;
                    ctx.fillRect(px - TILE, py - TILE, TILE * 3, TILE * 3);
                    ctx.restore();
                    // Texte EXIT
                    ctx.save();
                    ctx.globalAlpha = 0.6 + exitPulse * 0.4;
                    ctx.fillStyle = '#00ff88';
                    ctx.font = `bold ${TILE * 0.3}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('EXIT', px + TILE/2, py + TILE/2);
                    ctx.restore();
                } else {
                    // Sol
                    const r = Math.floor(lit * 22);
                    const g = Math.floor(lit * 12);
                    const b = Math.floor(lit * 18);
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    ctx.fillRect(px, py, TILE, TILE);
                }
            }
        }
        ctx.restore();
    }

    drawPlayer(player) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(-this.camX, -this.camY);

        const bob = Math.sin(player.bobTime) * 2;
        const px = player.px, py = player.py + bob;

        if (player.invincible && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.restore(); return; // clignote
        }

        // Ombre portée
        ctx.save();
        ctx.globalAlpha = 0.4;
        const shadowGrad = ctx.createRadialGradient(px, py + TILE*0.35, 0, px, py + TILE*0.35, TILE*0.45);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
        shadowGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.ellipse(px, py + TILE*0.4, TILE*0.4, TILE*0.15, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // Corps (silhouette humaine stylisée)
        // Torse
        ctx.fillStyle = '#2a1a0a';
        ctx.fillRect(px - 8, py - 8, 16, 20);
        // Tête
        ctx.fillStyle = '#d4a070';
        ctx.beginPath();
        ctx.arc(px, py - 12, 9, 0, Math.PI * 2);
        ctx.fill();
        // Yeux
        ctx.fillStyle = '#fff';
        ctx.fillRect(px - 5, py - 14, 3, 3);
        ctx.fillRect(px + 2, py - 14, 3, 3);
        ctx.fillStyle = '#000';
        ctx.fillRect(px - 4, py - 13, 2, 2);
        ctx.fillRect(px + 3, py - 13, 2, 2);
        // Lampe torche (rayon visible)
        const lampGrad = ctx.createRadialGradient(px, py, 0, px, py, 25);
        lampGrad.addColorStop(0, 'rgba(255, 220, 150, 0.3)');
        lampGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = lampGrad;
        ctx.beginPath();
        ctx.arc(px, py, 25, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawMonster(monster, player) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(-this.camX, -this.camY);

        // Monstre visible seulement si dans le rayon de la lampe
        const dx = monster.px - player.px;
        const dy = monster.py - player.py;
        const dist = Math.sqrt(dx*dx + dy*dy);

        let visibility = Math.max(0, 1 - dist / (player.flashRadius * 1.2));
        if (visibility < 0.05) { ctx.restore(); return; }

        this._monsterFlicker += 0.1;
        const flicker = 0.85 + Math.sin(this._monsterFlicker * 13) * 0.15;

        const mx = monster.px, my = monster.py;
        const wobbleX = Math.sin(monster.wobble) * 4;
        const wobbleY = Math.cos(monster.wobble * 0.7) * 3;

        ctx.globalAlpha = visibility * flicker;
        ctx.save();
        ctx.translate(mx + wobbleX, my + wobbleY);
        ctx.scale(monster.scaleAnim, monster.scaleAnim);

        // Aura malveillante
        const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, TILE * 1.5);
        aura.addColorStop(0, `rgba(150,0,0,${0.4 * visibility})`);
        aura.addColorStop(1, 'transparent');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, TILE * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Corps du monstre (forme organique effrayante)
        // Corps principal déformé
        ctx.fillStyle = `rgb(${60 + Math.random()*10}, 0, 0)`;
        ctx.beginPath();
        ctx.ellipse(0, 5, 14 + Math.random()*2, 22 + Math.random()*2, 0, 0, Math.PI*2);
        ctx.fill();

        // Tentacules/bras
        ctx.strokeStyle = `rgba(80, 0, 0, 0.8)`;
        ctx.lineWidth = 3;
        for (let a = 0; a < 4; a++) {
            const angle = (a / 4) * Math.PI * 2 + monster.wobble;
            ctx.beginPath();
            ctx.moveTo(0, 5);
            ctx.quadraticCurveTo(
                Math.cos(angle) * 20, Math.sin(angle) * 20 + 5,
                Math.cos(angle) * 30, Math.sin(angle) * 25 + 5
            );
            ctx.stroke();
        }

        // Tête / crâne
        ctx.fillStyle = `rgb(${30 + Math.random()*5}, 0, 0)`;
        ctx.beginPath();
        ctx.arc(0, -12, 13, 0, Math.PI * 2);
        ctx.fill();

        // Yeux rouges brillants
        const eyeGlow = 0.5 + 0.5 * Math.sin(monster.glowPhase * 3);
        ctx.fillStyle = `rgba(255, ${50 * eyeGlow}, 0, ${0.9 + eyeGlow * 0.1})`;
        ctx.beginPath();
        ctx.arc(-5, -14, 4 + eyeGlow, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(5, -14, 4 + eyeGlow, 0, Math.PI * 2);
        ctx.fill();

        // Reflet yeux
        ctx.fillStyle = 'rgba(255,200,200,0.8)';
        ctx.beginPath(); ctx.arc(-4, -15, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(6, -15, 1.5, 0, Math.PI*2); ctx.fill();

        // Bouche dentée
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(0, -8, 6, 0, Math.PI);
        ctx.fill();
        // Dents
        ctx.fillStyle = '#c0b090';
        for (let t = 0; t < 4; t++) {
            ctx.beginPath();
            ctx.moveTo(-5 + t * 3.3, -8);
            ctx.lineTo(-4 + t * 3.3, -5);
            ctx.lineTo(-3 + t * 3.3, -8);
            ctx.fill();
        }

        ctx.restore();
        ctx.restore();
    }

    drawLight(player) {
        const ctx = this.lightCtx;
        ctx.clearRect(0, 0, this.W, this.H);

        // Obscurité totale
        ctx.fillStyle = 'rgba(0, 0, 0, 0.96)';
        ctx.fillRect(0, 0, this.W, this.H);

        // Lampe torche (cercle lumineux)
        const cx = player.px - this.camX;
        const cy = player.py - this.camY;
        const radius = player.flashRadius;

        ctx.globalCompositeOperation = 'destination-out';

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0,   'rgba(0,0,0,1)');
        grad.addColorStop(0.4, 'rgba(0,0,0,0.95)');
        grad.addColorStop(0.7, 'rgba(0,0,0,0.7)');
        grad.addColorStop(0.85,'rgba(0,0,0,0.3)');
        grad.addColorStop(1,   'rgba(0,0,0,0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';

        // Teinte ambre chaude sur le cercle lumineux
        const warmGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.5);
        warmGrad.addColorStop(0, 'rgba(255, 180, 60, 0.06)');
        warmGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = warmGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    clear() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.W, this.H);
    }
}

/* ═══════════════════════════════════════
   CLASSE : InputHandler
═══════════════════════════════════════ */
class InputHandler {
    constructor() {
        this.keys = {};
        this._onKey = this._onKey.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        document.addEventListener('keydown', this._onKey);
        document.addEventListener('keyup', this._onKeyUp);
    }

    _onKey(e) {
        this.keys[e.key] = true;
        e.preventDefault();
    }
    _onKeyUp(e) {
        this.keys[e.key] = false;
    }

    isDown(key) { return !!this.keys[key]; }

    destroy() {
        document.removeEventListener('keydown', this._onKey);
        document.removeEventListener('keyup', this._onKeyUp);
    }
}

/* ═══════════════════════════════════════
   CLASSE : GrainEffect
═══════════════════════════════════════ */
class GrainEffect {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }
    resize() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    _loop() {
        const { width: w, height: h } = this.canvas;
        const img = this.ctx.createImageData(w, h);
        const data = img.data;
        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 255 | 0;
            data[i] = data[i+1] = data[i+2] = v;
            data[i+3] = 30;
        }
        this.ctx.putImageData(img, 0, 0);
        requestAnimationFrame(this._loop);
    }
}

/* ═══════════════════════════════════════
   CLASSE PRINCIPALE : Game
═══════════════════════════════════════ */
class GameController {
    constructor() {
        this.canvas      = document.getElementById('gameCanvas');
        this.lightCanvas = document.getElementById('lightCanvas');
        this.audio       = new AudioEngine();
        this.input       = null;
        this.renderer    = null;
        this.particles   = new ParticleSystem();
        this.maze        = null;
        this.player      = null;
        this.monster     = null;
        this.level       = 1;
        this.totalScore  = 0;
        this.running     = false;
        this._lastTime   = 0;
        this._moveTimer  = 0;
        this._moveDelay  = 0.14;
        this._raf        = null;

        // Init grain + cursor
        new GrainEffect(document.getElementById('grainCanvas'));
        this._initCursor();
        this._initTitle();
    }

    _initCursor() {
        const cursor = document.getElementById('cursor');
        const trail  = document.getElementById('cursorTrail');
        let tx = 0, ty = 0;
        document.addEventListener('mousemove', e => {
            cursor.style.left = e.clientX + 'px';
            cursor.style.top  = e.clientY + 'px';
            setTimeout(() => {
                trail.style.left = e.clientX + 'px';
                trail.style.top  = e.clientY + 'px';
            }, 60);
        });
    }

    _initTitle() {
        this._spawnBloodDrips();
        this._moveEyeball();

        document.getElementById('btnPlay').addEventListener('click', () => {
            this.audio._resume();
            this.startGame();
        });
        document.getElementById('btnHow').addEventListener('click', () => {
            const hint = document.getElementById('controlsHint');
            hint.classList.toggle('hidden');
        });
        document.getElementById('btnNextLevel').addEventListener('click', () => {
            this.level++;
            this._startLevel();
        });
    }

    _spawnBloodDrips() {
        const container = document.getElementById('bloodDrips');
        if (!container) return;
        const spawn = () => {
            const drop = document.createElement('div');
            drop.classList.add('blood-drop');
            const h = 20 + Math.random() * 120;
            drop.style.left   = Math.random() * 100 + '%';
            drop.style.height = h + 'px';
            drop.style.animationDuration = (3 + Math.random() * 4) + 's';
            drop.style.animationDelay    = (Math.random() * 2) + 's';
            drop.style.opacity = 0.3 + Math.random() * 0.7;
            container.appendChild(drop);
            setTimeout(() => drop.remove(), 8000);
        };
        for (let i = 0; i < 12; i++) spawn();
        setInterval(spawn, 600);
    }

    _moveEyeball() {
        const iris = document.getElementById('iris');
        if (!iris) return;
        document.addEventListener('mousemove', e => {
            const eyeball = document.getElementById('titleEyeball');
            if (!eyeball) return;
            const rect = eyeball.getBoundingClientRect();
            const ex = rect.left + rect.width / 2;
            const ey = rect.top  + rect.height / 2;
            const angle = Math.atan2(e.clientY - ey, e.clientX - ex);
            const dist  = Math.min(10, Math.hypot(e.clientX - ex, e.clientY - ey) * 0.08);
            iris.style.transform = `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px))`;
        });
    }

    startGame() {
        this.level = 1;
        this.totalScore = 0;
        this._startLevel();
    }

    _startLevel() {
        this._showScreen('screenGame');
        this.running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        if (this.input) this.input.destroy();

        // Générer le labyrinthe (plus grand avec les niveaux)
        const mazeScale = Math.min(1 + (this.level - 1) * 0.15, 2);
        const cols = Math.min(COLS + (this.level - 1) * 2, 31) | 1;  // toujours impair
        const rows = Math.min(ROWS + (this.level - 1) * 2, 23) | 1;
        this.maze   = new Maze(cols, rows);
        this.player = new Player(1, 1);

        // Monstre commence loin du joueur
        const floors = this.maze.getFloorTiles().filter(t =>
            Math.abs(t.x - 1) + Math.abs(t.y - 1) > 8
        );
        const mStart = floors[Math.floor(Math.random() * floors.length)] || { x: cols - 2, y: rows - 2 };
        this.monster = new Monster(mStart.x, mStart.y);
        this.monster.speed = 1.5 + (this.level - 1) * 0.25;
        this.monster.pathInterval = Math.max(0.3, 0.7 - (this.level - 1) * 0.06);

        this.particles = new ParticleSystem();
        this.renderer  = new Renderer(this.canvas, this.lightCanvas);
        this.input     = new InputHandler();

        this._updateHUD();
        this.audio.startAmbience();
        this.audio.stopHeartbeat();

        this.running  = true;
        this._lastTime = performance.now();
        this._raf = requestAnimationFrame(this._loop.bind(this));
    }

    _loop(timestamp) {
        if (!this.running) return;
        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
        this._lastTime = timestamp;

        this._update(dt);
        this._render();

        this._raf = requestAnimationFrame(this._loop.bind(this));
    }

    _update(dt) {
        const { player, monster, maze, audio, renderer } = this;

        // Mouvement joueur (grille, avec délai)
        this._moveTimer += dt;
        if (this._moveTimer >= this._moveDelay) {
            let moved = false;
            const { keys } = this.input;
            if (keys['ArrowUp']    || keys['z'] || keys['Z']) { if (player.move(0, -1, maze)) moved = true; }
            if (keys['ArrowDown']  || keys['s'] || keys['S']) { if (player.move(0,  1, maze)) moved = true; }
            if (keys['ArrowLeft']  || keys['q'] || keys['Q']) { if (player.move(-1, 0, maze)) moved = true; }
            if (keys['ArrowRight'] || keys['d'] || keys['D']) { if (player.move( 1, 0, maze)) moved = true; }
            if (moved) {
                audio.playStep();
                this._moveTimer = 0;
                this.totalScore++;
                this._updateScore();
            }
        }

        player.update(dt);
        monster.update(dt, maze, player, audio);
        this.particles.update(dt);
        renderer.updateShake(dt);
        renderer.getCamera(player);

        // Sanité : diminue quand le monstre est proche
        const dist = monster.distanceTo(player);
        const sanity = Math.min(100, (dist / 10) * 100);
        const sanityFill = document.getElementById('sanityFill');
        if (sanityFill) {
            sanityFill.style.width = sanity + '%';
            if (sanity < 30) {
                sanityFill.style.background = 'linear-gradient(to right, #400000, #8b0000)';
            } else if (sanity < 60) {
                sanityFill.style.background = 'linear-gradient(to right, #8b0000, #cc0000)';
            } else {
                sanityFill.style.background = 'linear-gradient(to right, #8b0000, #ff2020)';
            }
        }

        // Indicateur de danger + battement de coeur
        const dangerEl = document.getElementById('dangerIndicator');
        const fearEl   = document.getElementById('fearVignette');
        if (dist <= 4) {
            dangerEl?.classList.remove('hidden');
            fearEl?.classList.add('danger');
            audio.startHeartbeat(dist <= 2);
        } else {
            dangerEl?.classList.add('hidden');
            fearEl?.classList.remove('danger');
            if (dist > 6) audio.stopHeartbeat();
        }

        // Collision monstre → joueur
        if (dist <= 1) {
            if (player.takeDamage()) {
                audio.playHurt();
                renderer.shake(15, 0.5);
                this._showDamageFlash();
                this._showJumpscare();
                this.particles.emit(player.px, player.py, 15, 'blood');
                audio.stopHeartbeat();

                if (player.lives <= 0) {
                    setTimeout(() => this._gameOver(), 800);
                }
            }
        }
        this._updateHUD();

        // Joueur sur la sortie ?
        if (maze.grid[player.y][player.x] === EXIT) {
            audio.playExit();
            audio.stopAmbience();
            audio.stopHeartbeat();
            this.running = false;
            this.totalScore += this.level * 500;
            setTimeout(() => this._levelComplete(), 300);
        }
    }

    _render() {
        const { renderer, maze, player, monster, particles } = this;
        renderer.clear();
        renderer.drawMaze(maze, player);
        particles.draw(renderer.ctx);
        renderer.drawPlayer(player);
        renderer.drawMonster(monster, player);
        renderer.drawLight(player);
    }

    _showDamageFlash() {
        const el = document.getElementById('damageFlash');
        if (!el) return;
        el.classList.remove('hidden');
        el.style.animation = 'none';
        void el.offsetWidth; // reflow
        el.style.animation = '';
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 700);
    }

    _showJumpscare() {
        const el = document.getElementById('jumpscareText');
        if (!el) return;
        const texts = ['BOO!', 'GOTCHA!', 'AAAAH!', 'RUN!', 'NO!'];
        el.textContent = texts[Math.floor(Math.random() * texts.length)];
        el.classList.remove('hidden');
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
        setTimeout(() => el.classList.add('hidden'), 600);
    }

    _updateHUD() {
        const livesEl = document.getElementById('hudLives');
        if (livesEl) {
            livesEl.innerHTML = '';
            for (let i = 0; i < 3; i++) {
                const heart = document.createElement('span');
                heart.textContent = i < this.player.lives ? '❤️' : '🖤';
                livesEl.appendChild(heart);
            }
        }
        document.getElementById('hudLevel').textContent = this.level;
    }

    _updateScore() {
        document.getElementById('hudScore').textContent = this.totalScore;
    }

    _gameOver() {
        this.running = false;
        this.audio.stopAmbience();
        this.audio.stopHeartbeat();
        const msgs = [
            "Il t'a eu...",
            "Tu n'aurais pas dû te retourner.",
            "L'obscurité t'a avalé.",
            "Personne ne t'entendra crier.",
        ];
        document.getElementById('deadSub').textContent =
            msgs[Math.floor(Math.random() * msgs.length)];
        document.getElementById('deadScore').textContent = this.totalScore;
        setTimeout(() => this._showScreen('screenDead'), 1000);
    }

    _levelComplete() {
        document.getElementById('winScore').textContent = this.totalScore;
        document.getElementById('winLevel').textContent = this.level;
        this._showScreen('screenWin');
    }

    _showScreen(id) {
        ['screenTitle','screenGame','screenDead','screenWin'].forEach(s => {
            document.getElementById(s)?.classList.add('hidden');
        });
        document.getElementById(id)?.classList.remove('hidden');
    }

    restart() {
        this.audio.stopAmbience();
        this.audio.stopHeartbeat();
        this.startGame();
    }

    goTitle() {
        this.running = false;
        this.audio.stopAmbience();
        this.audio.stopHeartbeat();
        if (this._raf) cancelAnimationFrame(this._raf);
        this._showScreen('screenTitle');
        this._spawnBloodDrips();
    }
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
let Game;
document.addEventListener('DOMContentLoaded', () => {
    Game = new GameController();

    // Redimensionnement
    window.addEventListener('resize', () => {
        if (Game.renderer) Game.renderer.resize();
    });
});
