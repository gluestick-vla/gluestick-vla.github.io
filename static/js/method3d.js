/* ==========================================================================
   GLUESTICK — 3D animation of the method overview (paper Figure 3)
   --------------------------------------------------------------------------
   Everything shown is a faithful, schematic rendering of the pipeline in the
   paper: a dense linear layer is pruned to 2:4 sparsity, the gap matrix
   (dense − pruned) is collected, a truncated SVD compresses it into two thin
   correction matrices A = U_r Σ_r and B = V_r, and at inference the layer
   output is W_pruned·x + A(Bᵀx). The grid is 16×16 with rank r = 2 purely for
   illustration; no numeric values are implied.

   The whole timeline is a pure function of time, so stepping, scrubbing and
   looping are deterministic. Requires three.js (r128 UMD build).
   ========================================================================== */
(function (global) {
  'use strict';
  if (!global.THREE) { return; }
  var THREE = global.THREE;

  var N = 16;          // grid size (d_out = d_in = 16 for the schematic)
  var R = 2;           // illustrative rank r
  var K = N / 8;       // layout scale relative to the original 8x8 design
  var NSLAB = 8;       // layers shown in the opening stack
  var PITCH = 1.08;    // cell pitch
  var SIZE = 0.9;      // cube edge
  var TILE = 0.09;     // pruned cell (zero) height relative to SIZE
  var XB = 2;          // input block width (a few tokens)

  var COL = {
    purple: new THREE.Color(0x7B4FD1),
    purpleDeep: new THREE.Color(0x5B3A9E),
    purpleLight: new THREE.Color(0xB59CEA),
    orange: new THREE.Color(0xF35937),
    orangeLight: new THREE.Color(0xFFA07A),
    tile: new THREE.Color(0xF1EDF8),
    gray: new THREE.Color(0x8A8798),
    grayDark: new THREE.Color(0x8E8A9A),
    white: new THREE.Color(0xFFFFFF),
    black: new THREE.Color(0x000000)
  };

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function outCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
  function outBack(t) { t = clamp01(t); var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function win(s, a, b) { return clamp01((s - a) / (b - a)); }
  function cell(c) { return (c - (N - 1) / 2) * PITCH; }

  // Exact 2:4 pattern: in every group of four consecutive weights along a row,
  // two are kept and two are pruned. The choice of which two varies per group
  // so the pattern looks irregular, as in the paper figure.
  var COMBOS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  function keptMask() {
    var m = [];
    for (var r = 0; r < N; r++) {
      m.push([]);
      for (var g = 0; g < N / 4; g++) {
        var combo = COMBOS[(r * 5 + g * 3 + (r >> 1)) % 6];
        for (var k = 0; k < 4; k++) { m[r].push(combo.indexOf(k) >= 0); }
      }
    }
    return m;
  }

  var STAGES = [
    { id: 'layer', dur: 3.2, phase: 'Offline: pruning', tone: 'purple', short: 'Dense linear layer' },
    { id: 'prune', dur: 3.6, phase: 'Offline: pruning', tone: 'purple', short: '2:4 pruned layer' },
    { id: 'gap', dur: 3.4, phase: 'Offline: computing the correction', tone: 'orange', short: 'Gap matrix' },
    { id: 'svd', dur: 3.8, phase: 'Offline: computing the correction', tone: 'orange', short: 'Truncated SVD' },
    { id: 'online', dur: 5.6, phase: 'Online: inference', tone: 'orange', short: 'Inference' },
    { id: 'reset', dur: 1.1, phase: 'Online: inference', tone: 'orange', short: '' }
  ];

  function GluestickScene(container, opts) {
    opts = opts || {};
    this.container = container;
    this.opts = {
      autoplay: opts.autoplay !== false,
      loop: opts.loop !== false,
      interactive: opts.interactive !== false,
      labels: opts.labels !== false,
      stepMode: !!opts.stepMode,
      onStage: opts.onStage || function () {},
      onProgress: opts.onProgress || function () {},
      pixelRatioCap: opts.pixelRatioCap || 2,
      dim: !!opts.dim,
      zoom: opts.zoom || 1,  // >1 frames the scene tighter (camera closer); used by the hero background
      pruner: opts.pruner === 'scissors' ? 'scissors' : 'blade',
      stackPull: opts.stackPull === undefined ? 2.2 : opts.stackPull,   // how far the camera pulls back while the stack of layers is up
      stackCenter: !!opts.stackCenter                                      // look at the middle of the stack while it is up (small stages)
    };
    this.reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.t = 0;
    this.playing = false;
    this.visible = true;
    this.stageIndex = -1;
    this.holdAt = null;
    this.user = { az: 0, el: 0, dragging: false, lastX: 0, lastY: 0, idle: 0 };
    this.cam = { cx: 0, cy: 0, cz: 0, radius: 16, tx: 0, ty: 0, tz: 0, tr: 16 };   // cy/ty: look-at height, lifted while the stack is up
    this.total = 0;
    for (var i = 0; i < STAGES.length; i++) { this.total += STAGES[i].dur; }
    this.kept = keptMask();
    this._tmp = new THREE.Color();
    try {
      this._build();
    } catch (e) {
      container.classList.add('fallback');
      return;
    }
    this._bind();
    this.goTo(0, true);
    if (this.reduced) {
      // Static composition: show the final inference stage, no motion.
      this.t = this._stageStart(4) + STAGES[4].dur * 0.98;
      this._apply();
      this._render();
    } else if (this.opts.autoplay) {
      this.play();
    } else {
      this._render();
    }
  }

  GluestickScene.prototype._stageStart = function (i) {
    var s = 0; for (var k = 0; k < i; k++) { s += STAGES[k].dur; } return s;
  };

  GluestickScene.prototype._build = function () {
    var c = this.container;
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    c.insertBefore(renderer.domElement, c.firstChild);
    this.renderer = renderer;

    var scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xE2DCEF, 0.95));
    var amb = new THREE.AmbientLight(0xffffff, 0.22); scene.add(amb);
    var sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(9, 16, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22 * K; sun.shadow.camera.right = 22 * K;
    sun.shadow.camera.top = 22 * K; sun.shadow.camera.bottom = -22 * K;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    this.sun = sun;

    var ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    this.geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
    this.W = this._grid(N, N, COL.purple);
    this.G = this._grid(N, N, COL.purple);
    this.A = this._grid(N, R, COL.orange);
    this.B = this._grid(R, N, COL.orange);
    this.X1 = this._grid(N, XB, COL.gray);
    this.X2 = this._grid(N, XB, COL.gray);

    // Translucent slabs standing in for the other linear layers of the VLA.
    this.slabs = [];
    var slabGeo = new THREE.BoxGeometry(N * PITCH + 0.4, 0.3, N * PITCH + 0.4);
    var slabEdges = new THREE.EdgesGeometry(slabGeo);
    for (var i = 0; i < NSLAB; i++) {
      var slab = new THREE.Mesh(slabGeo,
        new THREE.MeshStandardMaterial({ color: COL.purple, emissive: COL.purpleDeep, emissiveIntensity: 0.3, roughness: 0.7, metalness: 0, transparent: true, opacity: 0 }));
      slab.castShadow = false;
      var edge = new THREE.LineSegments(slabEdges, new THREE.LineBasicMaterial({ color: COL.purpleLight, transparent: true, opacity: 0 }));
      slab.add(edge); slab.userData.edge = edge;
      scene.add(slab);
      this.slabs.push(slab);
    }
    // Optional scissors in place of the blade (opts.pruner === 'scissors').
    this.scissors = null;
    if (this.opts.pruner === 'scissors') {
      var grp = new THREE.Group();
      var bladeLen = N * PITCH + 2.0;
      var steel = new THREE.MeshStandardMaterial({ color: 0xD9D9E3, metalness: 0.85, roughness: 0.28, transparent: true, opacity: 0 });
      var grip = new THREE.MeshStandardMaterial({ color: COL.purple, emissive: COL.purpleDeep, emissiveIntensity: 0.35, roughness: 0.5, transparent: true, opacity: 0 });
      var mkHalf = function (sign) {
        var pivot = new THREE.Group();
        var bl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, bladeLen), steel);
        bl.position.z = bladeLen / 2;
        pivot.add(bl);
        var shank = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 1.4), steel);
        shank.position.set(sign * 0.32, 0, -0.7);
        pivot.add(shank);
        var ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.15, 12, 36), grip);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(sign * 0.9, 0, -1.9);
        pivot.add(ring);
        return pivot;
      };
      this.scHalves = [mkHalf(1), mkHalf(-1)];
      grp.add(this.scHalves[0]); grp.add(this.scHalves[1]);
      var pin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 16), grip);
      grp.add(pin);
      grp.visible = false;
      scene.add(grp);
      this.scissors = grp; this.scMats = [steel, grip];
    }
    // The "pruning blade" that sweeps over the layer.
    this.blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, N * PITCH + 1.2),
      new THREE.MeshStandardMaterial({ color: COL.purpleDeep, emissive: COL.purple, emissiveIntensity: 0.6, roughness: 0.3, transparent: true, opacity: 0 }));
    this.blade.castShadow = false;
    scene.add(this.blade);

    // SVD stage geometry: the gap matrix maps the unit sphere to an ellipsoid whose principal
    // axes are the singular directions and whose semi-axes are the singular values. A translucent
    // ellipsoid (solid + wireframe) and three axis rods; the gap's weights ride on its surface.
    var ellGeo = new THREE.SphereGeometry(1, 40, 26);
    this.ellip = new THREE.Mesh(ellGeo, new THREE.MeshStandardMaterial({ color: 0x7B4FD1, transparent: true, opacity: 0, roughness: 0.85, metalness: 0, depthWrite: false }));
    this.ellipWire = new THREE.Mesh(ellGeo, new THREE.MeshBasicMaterial({ color: 0xB59CEA, wireframe: true, transparent: true, opacity: 0, depthWrite: false }));
    this.ellip.visible = false; this.ellipWire.visible = false; this.ellip.renderOrder = -1; this.ellipWire.renderOrder = -1;
    scene.add(this.ellip); scene.add(this.ellipWire);
    var mkRod = function (color) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1, 12), new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0, roughness: 0.6 }));
      m.visible = false; scene.add(m); return m;
    };
    this.rodX = mkRod(0xF35937); this.rodX.rotation.z = Math.PI / 2;   // first singular direction
    this.rodZ = mkRod(0xF35937); this.rodZ.rotation.x = Math.PI / 2;   // second
    this.rodY = mkRod(0x8A8798);                                      // a discarded direction

    // HTML labels anchored to 3D points.
    this.labels = {};
    if (this.opts.labels) {
      var defs = [
        ['stack', 'Linear layers of the VLA', 'gray'],
        ['w', 'W<sub>dense</sub>', 'purple'], ['g', 'W<sub>gap</sub> = W<sub>dense</sub> − W<sub>pruned</sub>', 'purple'],
        ['a', 'A = U<sub>r</sub>Σ<sub>r</sub>', 'orange'], ['b', 'Bᵀ = V<sub>r</sub>ᵀ', 'orange'],
        ['x1', 'x', 'gray'], ['x2', 'x', 'gray'], ['plus', '+', 'gray'], ['eq', 'h(x) =', 'gray'],
        ['svd', 'SVD · keep top-r', 'orange'], ['minus', 'collect discarded weights', 'purple']
      ];
      for (var d = 0; d < defs.length; d++) {
        var el = document.createElement('div');
        el.className = 'label3d ' + defs[d][2];
        el.innerHTML = defs[d][1];
        c.appendChild(el);
        this.labels[defs[d][0]] = { el: el, pos: new THREE.Vector3(), show: false };
      }
    }
    this._resize();
  };

  GluestickScene.prototype._grid = function (rows, cols, color) {
    var cubes = [];
    for (var r = 0; r < rows; r++) {
      for (var cI = 0; cI < cols; cI++) {
        var mat = new THREE.MeshStandardMaterial({ color: color.clone(), roughness: 0.58, metalness: 0.04, transparent: true, opacity: 1 });
        mat.emissive = new THREE.Color(0x000000);
        var m = new THREE.Mesh(this.geo, mat);
        m.castShadow = true;
        m.visible = false;
        this.scene.add(m);
        cubes.push({ m: m, r: r, c: cI, i: r * cols + cI });
      }
    }
    return { rows: rows, cols: cols, cubes: cubes, cx: 0, cz: 0 };
  };

  // Place a cube: base on the ground, with scale and colors.
  function put(cu, x, z, sx, sy, sz, color, opacity, lift) {
    var m = cu.m;
    if (sy <= 0.001 || opacity <= 0.001) { m.visible = false; return; }
    m.visible = true;
    m.scale.set(Math.max(sx, 0.001), Math.max(sy, 0.001), Math.max(sz, 0.001));
    m.position.set(x, SIZE * sy / 2 + (lift || 0), z);
    if (color) { m.material.color.copy(color); }
    m.material.opacity = opacity;
    m.material.emissiveIntensity = 0;
  }
  function hideGrid(g) { for (var i = 0; i < g.cubes.length; i++) { g.cubes[i].m.visible = false; } }
  function glow(cu, color, k) {
    if (k <= 0.001) { cu.m.material.emissiveIntensity = 0; return; }
    cu.m.material.emissive.copy(color);
    cu.m.material.emissiveIntensity = k;
  }

  GluestickScene.prototype._bind = function () {
    var self = this;
    this._onResize = function () { self._resize(); self._render(); };
    if (global.ResizeObserver) {
      this.ro = new ResizeObserver(this._onResize);
      this.ro.observe(this.container);
    } else {
      global.addEventListener('resize', this._onResize);
    }
    if (global.IntersectionObserver) {
      this.io = new IntersectionObserver(function (entries) {
        self.visible = entries[0].isIntersecting;
        if (self.visible && self.playing && !self.raf) { self._loop(); }
      }, { threshold: 0.02 });
      this.io.observe(this.container);
    }
    this._onVis = function () { if (!document.hidden && self.playing && !self.raf) { self._loop(); } };
    document.addEventListener('visibilitychange', this._onVis);

    if (this.opts.interactive) {
      var cv = this.renderer.domElement;
      cv.style.cursor = 'grab';
      var down = function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) { return; }
        self.user.dragging = true; self.user.lastX = e.clientX; self.user.lastY = e.clientY; self.user.idle = 0;
        cv.style.cursor = 'grabbing';
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      };
      var move = function (e) {
        if (!self.user.dragging) { return; }
        var dx = e.clientX - self.user.lastX, dy = e.clientY - self.user.lastY;
        self.user.lastX = e.clientX; self.user.lastY = e.clientY;
        self.user.az -= dx * 0.006;
        self.user.el = Math.max(-0.35, Math.min(0.45, self.user.el + dy * 0.004));
        self.user.idle = 0;
        if (!self.playing) { self._render(); }
      };
      var up = function () { self.user.dragging = false; cv.style.cursor = 'grab'; };
      cv.addEventListener('pointerdown', down);
      cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('lostpointercapture', up);
    }
  };

  GluestickScene.prototype._resize = function () {
    var w = this.container.clientWidth || 640, h = this.container.clientHeight || 360;
    var cap = this.opts.pixelRatioCap;
    if (w < 640) { cap = Math.min(cap, 1.5); }
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, cap));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.aspect = w / h;
  };

  // ------------------------------------------------------------------------
  // Timeline
  // ------------------------------------------------------------------------
  GluestickScene.prototype.play = function () {
    if (this.reduced) { return; }
    this.playing = true;
    this.holdAt = null;
    if (this.t >= this.total - 0.01) { this.t = 0; }
    this.clock = new THREE.Clock();
    this._loop();
  };
  GluestickScene.prototype.pause = function () { this.playing = false; };
  GluestickScene.prototype.toggle = function () { if (this.playing) { this.pause(); } else { this.play(); } return this.playing; };
  GluestickScene.prototype.restart = function () { this.t = 0; this.holdAt = null; this.play(); };
  // Scroll-driven use: place the clock at a fraction of the first n stages and render once.
  GluestickScene.prototype.seek = function (frac, nStages) {
    var n = nStages || STAGES.length, total = 0;
    for (var i = 0; i < n && i < STAGES.length; i++) { total += STAGES[i].dur; }
    this.playing = false; this.holdAt = null;
    frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    this.t = Math.min(total - 0.001, frac * total);
    this._apply(); this._render();
  };

  // Scroll-driven use across a range of stages: frac 0 = start of stage `from`, 1 = end of stage `to`.
  GluestickScene.prototype.seekBetween = function (from, to, frac) {
    var start = this._stageStart(from), end = this._stageStart(to) + STAGES[to].dur;
    this.playing = false; this.holdAt = null;
    frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    this.t = Math.min(end - 0.001, start + (end - start) * frac);
    this._apply(); this._render();
  };

  // Jump to the start of a stage. In step mode the animation plays that stage
  // and holds at its end so the caption can be read.
  GluestickScene.prototype.goTo = function (i, silent) {
    i = Math.max(0, Math.min(STAGES.length - 2, i));
    this.t = this._stageStart(i) + 0.0001;
    this.user.az *= 0.5; this.user.el *= 0.5;
    if (this.opts.stepMode) {
      this.holdAt = this._stageStart(i) + STAGES[i].dur - 0.02;
      if (!this.reduced) { this.playing = true; this.clock = new THREE.Clock(); this._loop(); }
      else { this.t = this.holdAt; }
    }
    this._apply();
    if (!silent) { this._render(); }
  };

  GluestickScene.prototype._loop = function () {
    var self = this;
    if (this.raf) { return; }
    var step = function () {
      self.raf = null;
      if (!self.playing || !self.visible || document.hidden) { return; }
      var dt = self.clock ? Math.min(self.clock.getDelta(), 0.05) : 0.016;
      self.t += dt;
      self.user.idle += dt;
      if (self.holdAt !== null && self.t >= self.holdAt) {
        self.t = self.holdAt; self.playing = false;
        self._apply(); self._render();
        self.opts.onProgress(self.t / self.total, true);
        return;
      }
      if (self.t >= self.total) {
        if (self.opts.loop) { self.t -= self.total; } else { self.t = self.total - 0.001; self.playing = false; }
      }
      self._apply();
      self._render();
      self.raf = global.requestAnimationFrame(step);
    };
    this.raf = global.requestAnimationFrame(step);
  };

  GluestickScene.prototype.destroy = function () {
    this.playing = false;
    if (this.raf) { global.cancelAnimationFrame(this.raf); }
    if (this.ro) { this.ro.disconnect(); } else { global.removeEventListener('resize', this._onResize); }
    if (this.io) { this.io.disconnect(); }
    document.removeEventListener('visibilitychange', this._onVis);
    this.renderer.dispose();
  };

  // ------------------------------------------------------------------------
  // State = f(time)
  // ------------------------------------------------------------------------
  GluestickScene.prototype._apply = function () {
    var t = this.t, idx = 0, acc = 0;
    while (idx < STAGES.length - 1 && t >= acc + STAGES[idx].dur) { acc += STAGES[idx].dur; idx++; }
    var s = clamp01((t - acc) / STAGES[idx].dur);
    if (idx !== this.stageIndex) {
      this.stageIndex = idx;
      this.opts.onStage(idx, STAGES[idx]);
    }
    this.opts.onProgress(t / this.total, false);

    var L = this.labels, k;
    for (k in L) { if (L.hasOwnProperty(k)) { L[k].show = false; } }
    hideGrid(this.W); hideGrid(this.G); hideGrid(this.A); hideGrid(this.B); hideGrid(this.X1); hideGrid(this.X2);
    for (k = 0; k < this.slabs.length; k++) { this.slabs[k].visible = false; }
    this.blade.visible = false;
    if (this.scissors) { this.scissors.visible = false; }
    if (this.ellip) { this.ellip.visible = false; this.ellipWire.visible = false; this.rodX.visible = false; this.rodZ.visible = false; this.rodY.visible = false; }

    this.cam.ty = 0;
    switch (STAGES[idx].id) {
      case 'layer': this._stLayer(s); break;
      case 'prune': this._stPrune(s); break;
      case 'gap': this._stGap(s); break;
      case 'svd': this._stSvd(s); break;
      case 'online': this._stOnline(s); break;
      case 'reset': this._stReset(s); break;
    }
    this._updateCamera();
  };

  // --- Stage helpers -------------------------------------------------------
  GluestickScene.prototype._drawW = function (cx, cz, pruneT, fade, extraScale) {
    // pruneT: 0 = dense, 1 = fully pruned (uniform). fade: opacity.
    var W = this.W, kept = this.kept, sc = extraScale || 1;
    for (var i = 0; i < W.cubes.length; i++) {
      var cu = W.cubes[i], isKept = kept[cu.r][cu.c];
      var p = isKept ? 0 : pruneT;
      var sy = lerp(1, TILE, p) * sc;
      var col = this._tmp.copy(COL.purple).lerp(COL.tile, p);
      put(cu, cx + cell(cu.c), cz + cell(cu.r), sc, sy, sc, col, fade, 0);
    }
  };
  GluestickScene.prototype._drawG = function (cx, cz, fade, sc) {
    var G = this.G, kept = this.kept; sc = sc || 1;
    for (var i = 0; i < G.cubes.length; i++) {
      var cu = G.cubes[i], isKept = kept[cu.r][cu.c];
      var sy = isKept ? TILE : 1;
      put(cu, cx + cell(cu.c), cz + cell(cu.r), sc, sy * sc, sc, isKept ? COL.tile : COL.purple, fade, 0);
    }
  };
  GluestickScene.prototype._posA = function (cu, ax, az) { return [ax + (cu.c - (R - 1) / 2) * PITCH, az + cell(cu.r)]; };
  GluestickScene.prototype._posB = function (cu, bx, bz) { return [bx + cell(cu.c), bz + (cu.r - (R - 1) / 2) * PITCH]; };
  GluestickScene.prototype._drawAB = function (ax, az, bx, bz, fade, sc) {
    sc = sc || 1;
    for (var i = 0; i < this.A.cubes.length; i++) {
      var cu = this.A.cubes[i], p = this._posA(cu, ax, az);
      put(cu, p[0], p[1], sc, sc, sc, COL.orange, fade, 0);
    }
    for (i = 0; i < this.B.cubes.length; i++) {
      cu = this.B.cubes[i]; p = this._posB(cu, bx, bz);
      put(cu, p[0], p[1], sc, sc, sc, COL.orange, fade, 0);
    }
  };
  GluestickScene.prototype._drawX = function (grid, x, z, fade, sc, color) {
    sc = sc || 1;
    for (var i = 0; i < grid.cubes.length; i++) {
      var cu = grid.cubes[i];
      put(cu, x + (cu.c - (XB - 1) / 2) * PITCH, z + cell(cu.r), sc, sc, sc, color || COL.gray, fade, 0);
    }
  };
  GluestickScene.prototype._label = function (key, x, y, z) {
    var l = this.labels[key]; if (!l) { return; }
    l.show = true; l.pos.set(x, y, z);
  };

  // Stage 0: a VLA model's stack of linear layers; one dense layer is drawn out.
  GluestickScene.prototype._stLayer = function (s) {
    this._tmp = this._tmp || new THREE.Color();
    var zoomIn = smooth(win(s, 0.4, 0.7)), ctr = this.opts.stackCenter ? (1 - zoomIn) : 0, top = this.slabs.length - 1;
    this.cam.tx = -top * 0.45 * ctr; this.cam.tz = -top * 0.55 * ctr; this.cam.ty = (0.15 + top * 1.25) * 0.42 * ctr;
    this.cam.tr = this._fitRadius(6.6 * K + this.opts.stackPull * (1 - zoomIn));
    var appear = outCubic(win(s, 0, 0.3));
    var eject = smooth(win(s, 0.36, 0.62));
    var fadeStack = 1 - smooth(win(s, 0.62, 0.9));
    for (var i = 0; i < this.slabs.length; i++) {
      var slab = this.slabs[i];
      var isFront = (i === 0);
      var depth = i / (this.slabs.length - 1);
      // a stack of layers: each one a little higher and further back than the one in front
      var yBase = 0.15 + i * 1.25, xOff = -i * 0.9, zOff = -i * 1.1;
      var stagger = outCubic(win(s, 0.02 + 0.03 * (this.slabs.length - 1 - i), 0.26 + 0.03 * (this.slabs.length - 1 - i)));
      var op = (isFront ? 0.5 : lerp(0.42, 0.22, depth)) * stagger * (isFront ? (1 - smooth(win(s, 0.45, 0.68))) : fadeStack);
      slab.visible = op > 0.01;
      slab.material.opacity = op;
      slab.userData.edge.material.opacity = Math.min(1, op * 1.8);
      slab.position.set(xOff + (isFront ? 0 : -3.0 * (1 - fadeStack)), yBase + (1 - stagger) * 4 + (isFront ? -yBase * eject : 0), zOff + (isFront ? 0 : -2.2 * (1 - fadeStack)));
    }
    if (s > 0.08 && s < 0.58) { this._label('stack', -top * 0.9, 0.15 + top * 1.25 + 1.9, -top * 1.1); }   // above the middle of the top layer
    // Dense cubes materialize row by row as the front slab "becomes" the matrix.
    var W = this.W;
    for (i = 0; i < W.cubes.length; i++) {
      var cu = W.cubes[i];
      var start = 0.46 + 0.4 * ((cu.r * N + cu.c) / (N * N));
      var p = outBack(win(s, start, start + 0.14));
      if (p <= 0) { cu.m.visible = false; continue; }
      put(cu, cell(cu.c), cell(cu.r), p, p, p, COL.purple, 1, 0);
    }
    if (s > 0.78) { this._label('w', 0, 0.2, cell(N - 1) + 1.35); }
  };

  // Stage 1: a pruning blade sweeps across; 2 of every 4 weights become zeros.
  GluestickScene.prototype._stPrune = function (s) {
    this.cam.tx = 0; this.cam.tz = 0; this.cam.tr = this._fitRadius(6.6 * K);
    var kept = this.kept, W = this.W;
    var sweep = win(s, 0.12, 0.84);
    var bladeX = lerp(cell(0) - 1.2, cell(N - 1) + 1.2, sweep);
    var bop = Math.min(smooth(win(s, 0.04, 0.14)), 1 - smooth(win(s, 0.84, 0.95)));
    if (this.scissors) {
      this.scissors.visible = bop > 0.01;
      this.scMats[0].opacity = bop; this.scMats[1].opacity = bop;
      this.scissors.position.set(bladeX, 1.35, cell(0) - 1.6);
      var open = 0.02 + 0.075 * (0.5 + 0.5 * Math.cos(sweep * Math.PI * 7));   // snipping as it moves
      this.scHalves[0].rotation.y = open; this.scHalves[1].rotation.y = -open;
    } else {
      this.blade.visible = bop > 0.01;
      this.blade.material.opacity = 0.75 * bop;
      this.blade.position.set(bladeX, 1.2, 0);
    }
    for (var i = 0; i < W.cubes.length; i++) {
      var cu = W.cubes[i];
      var x = cell(cu.c), z = cell(cu.r);
      var passed = clamp01((bladeX - x + 0.35) / 0.9);   // 0 before blade, 1 after
      var p = outCubic(passed);
      if (kept[cu.r][cu.c]) {
        var pulse = Math.sin(clamp01((bladeX - x + 0.9) / 1.8) * Math.PI) * 0.1;
        put(cu, x, z, 1 + pulse, 1 + pulse, 1 + pulse, COL.purple, 1, 0);
      } else {
        var sy = lerp(1, TILE, p);
        var col = this._tmp.copy(COL.purple).lerp(COL.tile, p);
        var hop = Math.sin(clamp01(passed) * Math.PI) * 0.6;
        put(cu, x, z, lerp(1, 1, p), sy, 1, col, 1, hop);
      }
    }
    this._label('w', 0, 0.2, cell(N - 1) + 1.35);
    this.labels.w && (this.labels.w.el.innerHTML = s > 0.5 ? 'W<sub>pruned</sub> (2:4)' : 'W<sub>dense</sub>');
  };

  // Stage 2: the pruned layer slides left; the discarded weights are lifted
  // out and collected on the right as the gap matrix.
  GluestickScene.prototype._stGap = function (s) {
    var shift = smooth(win(s, 0, 0.32));
    var wx = lerp(0, -6.6 * K, shift), gx = 6.6 * K;
    this.cam.tx = lerp(0, 0, shift); this.cam.tz = 0; this.cam.tr = this._fitRadius(lerp(6.6 * K, 12.4 * K, shift));
    this._drawW(wx, 0, 1, 1);
    var G = this.G, kept = this.kept, W = this.W;
    var tilesIn = outBack(win(s, 0.28, 0.5));
    for (var i = 0; i < G.cubes.length; i++) {
      var cu = G.cubes[i];
      var tx = gx + cell(cu.c), tz = cell(cu.r);
      if (kept[cu.r][cu.c]) {
        put(cu, tx, tz, tilesIn, TILE * tilesIn, tilesIn, COL.tile, tilesIn, 0);
      } else {
        var st = 0.3 + 0.42 * (cu.r / N) + 0.08 * (cu.c / N);
        var p = smooth(win(s, st, st + 0.26));
        if (p <= 0) { cu.m.visible = false; continue; }
        var sx = wx + cell(cu.c);
        var x = lerp(sx, tx, p), z = lerp(cell(cu.r), tz, p);
        var arc = Math.sin(p * Math.PI) * 2.6 * K;
        var sc = lerp(0.35, 1, outCubic(p));
        var col = this._tmp.copy(COL.purpleLight).lerp(COL.purple, p);
        put(cu, x, z, sc, sc, sc, col, 1, arc);
      }
    }
    if (this.labels.w) { this.labels.w.el.innerHTML = 'W<sub>pruned</sub>'; }
    this._label('w', wx, 0.2, cell(N - 1) + 1.35);
    if (this.labels.minus) { this.labels.minus.el.innerHTML = 'collect discarded weights'; }
    if (s > 0.2 && s < 0.9) { this._label('minus', 0, 2.2, 0); }
    if (s > 0.72) { this._label('g', gx, 0.2, cell(N - 1) + 1.35); }
  };

  // Stage 3: truncated SVD, drawn the way the mathematics reads. The gap's weights gather on a
  // unit sphere; the gap matrix stretches that sphere into an ellipsoid whose principal axes are
  // the singular directions and whose semi-axes are the singular values. The two long axes are
  // kept (orange); the short one collapses as the tail is discarded, flattening the ellipsoid to
  // the rank-r image; the kept directions then become the correction factors A and Bᵀ.
  var ELL_R0 = 3.1, ELL_A1 = 8.8, ELL_A2 = 5.4, ELL_A3 = 2.9, ELL_CY = 5.6;
  GluestickScene.prototype._stSvd = function (s) {
    var wx = -6.6 * K, gx = 6.6 * K;
    var ax = gx - cell(N - 1) - 0.0, az = 0;      // A: two columns at the left of the gap footprint
    var bx = gx + 1.2, bz = cell(0) - 1.75;        // Bᵀ: two rows just behind the footprint
    var gather = smooth(win(s, 0.0, 0.34));        // gap weights → unit sphere
    var stretch = smooth(win(s, 0.30, 0.50));      // sphere → ellipsoid
    var select = smooth(win(s, 0.50, 0.62));       // axes drawn, the long ones lit
    var flat = smooth(win(s, 0.60, 0.76));         // the short axis collapses: tail discarded
    var stitch = smooth(win(s, 0.70, 0.97));       // kept directions → A and Bᵀ
    this.cam.tx = 2.8 * K * gather * (1 - stitch); this.cam.tz = -0.6 * K; this.cam.tr = this._fitRadius(12.6 * K);
    this.cam.ty = 3.4 * gather * (1 - stitch);
    this._drawW(wx, 0, 1, 1);
    var cx = gx, cy = ELL_CY, cz = 0;
    var sa1 = lerp(ELL_R0, ELL_A1, stretch), sa2 = lerp(ELL_R0, ELL_A2, stretch), sa3 = lerp(ELL_R0, ELL_A3, stretch) * (1 - flat);
    var G = this.G, kept = this.kept;
    var tilesOut = 1 - smooth(win(s, 0.02, 0.3));
    var gi = 0, total = N * N / 2, GOLD = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < G.cubes.length; i++) {
      var cu = G.cubes[i];
      var tx = gx + cell(cu.c), tz = cell(cu.r);
      if (kept[cu.r][cu.c]) { put(cu, tx, tz, tilesOut, TILE * tilesOut, tilesOut, COL.tile, tilesOut, 0); continue; }
      // this weight's point on the unit sphere (Fibonacci spiral), then its image under the gap
      var uy = 1 - 2 * (gi + 0.5) / total, ur = Math.sqrt(Math.max(0, 1 - uy * uy)), uphi = gi * GOLD;
      var px = ur * Math.cos(uphi), py = uy, pz = ur * Math.sin(uphi);
      var ex = cx + sa1 * px, ey = cy + sa3 * py, ez = cz + sa2 * pz;
      var st = 0.02 + 0.2 * (gi / total);
      var p = smooth(win(s, st, st + 0.16));
      var x = lerp(tx, ex, p), z = lerp(tz, ez, p), y = lerp(0, ey, p) + Math.sin(p * Math.PI) * 0.8 * K;
      var sc = lerp(1, 0.46, p), op = 1;
      var col = this._tmp.copy(COL.purple).lerp(COL.orange, select);
      if (stitch > 0) {
        // the kept directions flow into A (x axis of the ellipsoid) and Bᵀ (z axis)
        var toA = Math.abs(px) >= Math.abs(pz), target, tp;
        if (toA) { target = this.A.cubes[gi % this.A.cubes.length]; tp = this._posA(target, ax, az); }
        else { target = this.B.cubes[gi % this.B.cubes.length]; tp = this._posB(target, bx, bz); }
        var frac = gi / total;
        var q = smooth(win(stitch, 0.1 * frac, 0.6 + 0.4 * frac));
        x = lerp(x, tp[0], q); z = lerp(z, tp[1], q); y = lerp(y, 0, q) + Math.sin(q * Math.PI) * 0.9 * K;
        sc = lerp(sc, 0.3, q); op = 1 - clamp01((q - 0.75) / 0.25);
      }
      if (op <= 0.001) { cu.m.visible = false; } else { put(cu, x, z, sc, sc, sc, col, op, y); }
      gi++;
    }
    // the ellipsoid and its principal axes
    if (this.ellip) {
      var vis = smooth(win(s, 0.16, 0.34)) * (1 - smooth(win(stitch, 0.15, 0.8)));
      this.ellip.visible = vis > 0.01; this.ellipWire.visible = vis > 0.01;
      this.ellip.material.opacity = 0.13 * vis; this.ellipWire.material.opacity = 0.2 * vis;
      this.ellip.position.set(cx, cy, cz); this.ellipWire.position.copy(this.ellip.position);
      this.ellip.scale.set(sa1, Math.max(0.04, sa3), sa2); this.ellipWire.scale.copy(this.ellip.scale);
      var rv = select * (1 - smooth(win(stitch, 0, 0.5)));
      var rods = [[this.rodX, sa1], [this.rodZ, sa2], [this.rodY, sa3]];
      for (var r = 0; r < rods.length; r++) {
        var rod = rods[r][0], half = rods[r][1];
        rod.visible = rv > 0.01 && half > 0.05;
        rod.position.set(cx, cy, cz); rod.scale.set(1, Math.max(0.01, 2 * half + 1.6), 1);
        rod.material.opacity = 0.95 * rv;
      }
    }
    // A and Bᵀ grow in as the kept directions arrive.
    for (i = 0; i < this.A.cubes.length; i++) {
      cu = this.A.cubes[i];
      var pa = outBack(win(stitch, 0.42 + 0.4 * (i / this.A.cubes.length), 0.66 + 0.34 * (i / this.A.cubes.length)));
      var p2 = this._posA(cu, ax, az);
      put(cu, p2[0], p2[1], pa, pa, pa, COL.orange, 1, 0);
    }
    for (i = 0; i < this.B.cubes.length; i++) {
      cu = this.B.cubes[i];
      var pb = outBack(win(stitch, 0.46 + 0.4 * (i / this.B.cubes.length), 0.7 + 0.3 * (i / this.B.cubes.length)));
      var p3 = this._posB(cu, bx, bz);
      put(cu, p3[0], p3[1], pb, pb, pb, COL.orange, 1, 0);
    }
    if (this.labels.w) { this.labels.w.el.innerHTML = 'W<sub>pruned</sub>'; }
    this._label('w', wx, 0.2, cell(N - 1) + 1.35);
    if (this.labels.svd) {
      this.labels.svd.el.innerHTML = select < 0.5 ? 'finding the dominant directions of W<sub>gap</sub>' : 'keep the top-<i>r</i> dominant directions';
      if (gather > 0.6 && stitch < 0.4) { this._label('svd', cx, cy + ELL_A3 + 2.0, cz); }
    }
    if (this.labels.minus) {
      this.labels.minus.el.innerHTML = 'discard the rest';
      if (flat > 0.08 && flat < 0.92) { this._label('minus', cx + ELL_A1 * 0.55, cy - ELL_A3 - 1.6, cz + ELL_A2 * 0.8); }   // below the ellipsoid, clear of the other label
    }
    if (stitch > 0.6) {
      this._label('a', ax, 0.2, cell(N - 1) + 1.35);
      this._label('b', bx + 2.2, 0.2, bz - 1.4);
    }
  };

  // Stage 4: inference. Output = W_pruned·x + A(Bᵀx). Signals pulse through
  // the sparse layer and, in parallel, through the rank-r correction.
  GluestickScene.prototype._stOnline = function (s) {
    var wx0 = -6.6 * K, wx1 = -9.2 * K, move = smooth(win(s, 0, 0.3));
    var wx = lerp(wx0, wx1, move);
    var ax0 = 6.6 * K - cell(N - 1), ax1 = 1.5 * K, ax = lerp(ax0, ax1, move);
    var bx0 = 7.8 * K, bx1 = 6.7 * K, bx = lerp(bx0, bx1, move), bz = cell(0) - 1.75;
    var x1 = wx + cell(N - 1) + 1.0 + (XB - 1) / 2 * PITCH + 0.55;   // input right of W
    var x2 = bx + cell(N - 1) + 1.0 + (XB - 1) / 2 * PITCH + 0.55;   // input right of Bᵀ
    this.cam.tx = lerp(0, 0.7 * K, move); this.cam.tz = -0.6 * K; this.cam.tr = this._fitRadius(lerp(12.6 * K, 16.2 * K, move));
    this._drawW(wx, 0, 1, 1);
    this._drawAB(ax, 0, bx, bz, 1);
    var inp = outBack(win(s, 0.26, 0.46));
    this._drawX(this.X1, x1, 0, inp, inp);
    this._drawX(this.X2, x2, 0, inp, inp);

    // Pulses (emissive), purely decorative flow indicators.
    var W = this.W, kept = this.kept, i, cu;
    var pw = win(s, 0.5, 0.78);           // sweep across W from the input side (right) to the left
    var pulseX = lerp(cell(N - 1) + 2.2, cell(0) - 1.5, pw);
    var merge = Math.sin(win(s, 0.86, 1) * Math.PI) * 0.55;
    for (i = 0; i < W.cubes.length; i++) {
      cu = W.cubes[i];
      if (!kept[cu.r][cu.c]) { continue; }
      var dxw = Math.abs(cell(cu.c) - pulseX);
      var g = (pw > 0 && pw < 1) ? Math.max(0, 1 - dxw / 1.6) * 0.8 : 0;
      glow(cu, COL.purpleLight, Math.max(g, merge));
    }
    var pin = Math.sin(win(s, 0.44, 0.56) * Math.PI);
    for (i = 0; i < this.X1.cubes.length; i++) { glow(this.X1.cubes[i], COL.white, pin * 0.5); }
    for (i = 0; i < this.X2.cubes.length; i++) { glow(this.X2.cubes[i], COL.white, pin * 0.5); }
    var pb = win(s, 0.52, 0.68);          // across Bᵀ right→left
    var pbx = lerp(cell(N - 1) + 2.0, cell(0) - 1.2, pb);
    for (i = 0; i < this.B.cubes.length; i++) {
      cu = this.B.cubes[i];
      var dxb = Math.abs(cell(cu.c) - pbx);
      glow(cu, COL.orangeLight, Math.max((pb > 0 && pb < 1) ? Math.max(0, 1 - dxb / 1.6) * 0.9 : 0, merge));
    }
    var pa = win(s, 0.66, 0.8);           // down A, back→front
    var paz = lerp(cell(0) - 1.2, cell(N - 1) + 1.2, pa);
    for (i = 0; i < this.A.cubes.length; i++) {
      cu = this.A.cubes[i];
      var dza = Math.abs(cell(cu.r) - paz);
      glow(cu, COL.orangeLight, Math.max((pa > 0 && pa < 1) ? Math.max(0, 1 - dza / 1.6) * 0.9 : 0, merge));
    }

    if (this.labels.w) { this.labels.w.el.innerHTML = 'W<sub>pruned</sub>'; }
    this._label('w', wx, 0.2, cell(N - 1) + 1.35);
    this._label('a', ax, 0.2, cell(N - 1) + 1.35);
    this._label('b', bx + 2.2, 0.2, bz - 1.4);
    if (inp > 0.6) {
      this._label('x1', x1, 0.2, cell(N - 1) + 1.35);
      this._label('x2', x2, 0.2, cell(N - 1) + 1.35);
      this._label('plus', (x1 + ax) / 2 + 0.2, 1.6, 0);
      if ((this.aspect || 1.6) > 1.05) { this._label('eq', wx + cell(0) - 2.4 * K, 1.6, 0); }
    }
  };

  // Stage 5: fade everything down before looping.
  GluestickScene.prototype._stReset = function (s) {
    var wx = -9.2 * K, ax = 1.5 * K, bx = 6.7 * K, bz = cell(0) - 1.75;
    var x1 = wx + cell(N - 1) + 1.0 + (XB - 1) / 2 * PITCH + 0.55;
    var x2 = bx + cell(N - 1) + 1.0 + (XB - 1) / 2 * PITCH + 0.55;
    var k = 1 - smooth(win(s, 0, 0.8));
    this.cam.tx = 0.7 * K; this.cam.tz = -0.6 * K; this.cam.tr = this._fitRadius(16.2 * K);
    this._drawW(wx, 0, 1, k, k);
    this._drawAB(ax, 0, bx, bz, k, k);
    this._drawX(this.X1, x1, 0, k, k);
    this._drawX(this.X2, x2, 0, k, k);
  };

  // ------------------------------------------------------------------------
  // Camera & labels
  // ------------------------------------------------------------------------
  GluestickScene.prototype._fitRadius = function (sceneRadius) {
    var vfov = this.camera.fov * Math.PI / 180;
    var hfov = 2 * Math.atan(Math.tan(vfov / 2) * (this.aspect || 1.6));
    var dv = sceneRadius / Math.sin(vfov / 2);
    var dh = sceneRadius / Math.sin(hfov / 2);
    return Math.max(dv, dh) * 0.98 / (this.opts.zoom || 1);
  };
  GluestickScene.prototype._updateCamera = function () {
    var c = this.cam, k = 0.055;
    c.cx += (c.tx - c.cx) * k; c.cy += (c.ty - c.cy) * k; c.cz += (c.tz - c.cz) * k; c.radius += (c.tr - c.radius) * k;
    // Gentle idle orbit; the user's drag offsets decay slowly after a pause.
    if (!this.user.dragging && this.user.idle > 3) { this.user.az *= 0.985; this.user.el *= 0.985; }
    var az = -0.62 + Math.sin(this.t * 0.22) * 0.12 + this.user.az;
    var el = 0.62 + Math.sin(this.t * 0.17) * 0.04 + this.user.el;
    var r = c.radius;
    this.camera.position.set(c.cx + r * Math.cos(el) * Math.sin(az), 0.6 + c.cy + r * Math.sin(el), c.cz + r * Math.cos(el) * Math.cos(az));
    this.camera.lookAt(c.cx, 0.2 + c.cy, c.cz);
  };
  GluestickScene.prototype._render = function () {
    if (!this.renderer) { return; }
    this.renderer.render(this.scene, this.camera);
    if (!this.opts.labels) { return; }
    var w = this.container.clientWidth, h = this.container.clientHeight, v = this._v || (this._v = new THREE.Vector3());
    for (var k in this.labels) {
      if (!this.labels.hasOwnProperty(k)) { continue; }
      var l = this.labels[k];
      if (!l.show) { l.el.classList.remove('show'); continue; }
      v.copy(l.pos).project(this.camera);
      if (v.z > 1) { l.el.classList.remove('show'); continue; }
      var x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      l.el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%,-50%)';
      l.el.classList.add('show');
    }
  };

  GluestickScene.STAGES = STAGES;
  global.GluestickScene = GluestickScene;
})(window);
