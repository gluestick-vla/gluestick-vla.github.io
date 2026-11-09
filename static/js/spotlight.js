/* ==========================================================================
   Spotlight (paper Figure 1) rebuilt in HTML + SVG.
   The two panel photographs and the arrow / marker outlines are taken directly
   from the paper's figure (vector paths extracted from the PDF, see
   spotlight-paths.js). The animation only reveals the pruned path (purple),
   its failure marker, and then the GLUESTICK path (orange), in that order.
   ========================================================================== */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var P = window.SPOTLIGHT_PATHS;
  if (!P) { return; }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PURPLE = '#7B4FD1', ORANGE = '#F35937';

  // Panel geometry in the figure's page coordinate system (points).
  var PANELS = {
    nav: { view: [1.56, 30.75, 547.2, 308.4], purple: P.navPurple, orange: P.navOrange, x: P.navX,
           purpleWipe: { axis: 'x', from: 540, to: 90 }, orangeWipe: { axis: 'x', from: 540, to: 315 } },
    manip: { view: [553.2, 30.75, 407.0, 309.0], purple: P.manipPurple, orange: P.manipOrange, x: P.manipX,
             purpleWipe: { axis: 'y', from: 159, to: 286 }, orangeWipe: { axis: 'x', from: 763, to: 709 } }
  };

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) { if (attrs.hasOwnProperty(k)) { e.setAttribute(k, attrs[k]); } }
    if (parent) { parent.appendChild(e); }
    return e;
  }

  var uid = 0;
  function buildPanel(container, key) {
    var g = PANELS[key];
    var id = 'spot' + (++uid);
    var svg = el('svg', { viewBox: g.view.join(' '), 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    svg.setAttribute('class', 'spot-svg');
    var defs = el('defs', {}, svg);
    var v = g.view;
    var cp1 = el('clipPath', { id: id + 'a' }, defs);
    var r1 = el('rect', { x: v[0], y: v[1], width: v[2], height: v[3] }, cp1);
    var cp2 = el('clipPath', { id: id + 'b' }, defs);
    var r2 = el('rect', { x: v[0], y: v[1], width: v[2], height: v[3] }, cp2);
    var purple = el('path', { d: g.purple, fill: PURPLE, 'fill-opacity': '0.78', 'clip-path': 'url(#' + id + 'a)' }, svg);
    var xmark = el('path', { d: g.x, fill: PURPLE, 'fill-opacity': '0.72' }, svg);
    xmark.setAttribute('class', 'spot-x');
    var orange = el('path', { d: g.orange, fill: ORANGE, 'fill-opacity': '0.85', 'clip-path': 'url(#' + id + 'b)' }, svg);
    orange.setAttribute('class', 'spot-orange');
    container.appendChild(svg);

    function setWipe(rect, wipe, t) {   // t in [0,1]: how much of the arrow is revealed, in travel direction
      var v2 = g.view;
      if (wipe.axis === 'x') {
        var x = wipe.from + (wipe.to - wipe.from) * t;     // moving edge
        if (wipe.to < wipe.from) { rect.setAttribute('x', x); rect.setAttribute('width', (v2[0] + v2[2]) - x); }
        else { rect.setAttribute('x', v2[0]); rect.setAttribute('width', x - v2[0]); }
        rect.setAttribute('y', v2[1]); rect.setAttribute('height', v2[3]);
      } else {
        var y = wipe.from + (wipe.to - wipe.from) * t;
        if (wipe.to < wipe.from) { rect.setAttribute('y', y); rect.setAttribute('height', (v2[1] + v2[3]) - y); }
        else { rect.setAttribute('y', v2[1]); rect.setAttribute('height', y - v2[1]); }
        rect.setAttribute('x', v2[0]); rect.setAttribute('width', v2[2]);
      }
    }
    var xb = (function () { // x-mark centre for the pop transform
      var nums = g.x.match(/-?\d+\.?\d*/g).map(Number), xs = [], ys = [];
      for (var i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
      return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
    })();
    function setX(s) { // scale about centre
      xmark.setAttribute('transform', 'translate(' + xb[0] + ' ' + xb[1] + ') scale(' + s + ') translate(' + (-xb[0]) + ' ' + (-xb[1]) + ')');
      xmark.setAttribute('opacity', s > 0.02 ? '1' : '0');
    }
    return {
      set: function (tp, tx, to) { setWipe(r1, g.purpleWipe, tp); setX(tx); setWipe(r2, g.orangeWipe, to); },
      svg: svg
    };
  }

  var easeOut = function (p) { return 1 - Math.pow(1 - p, 3); };
  var pop = function (p) { // overshoot
    if (p <= 0) { return 0; } if (p >= 1) { return 1; }
    var s = 1.70158 + 1; return 1 + (--p) * p * ((s + 1) * p + s);
  };
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  // Timeline (seconds): purple draws, X pops, pause, orange draws, hold, reset.
  var T = { purple: [0.3, 1.9], x: [1.9, 2.35], orange: [2.9, 4.3], hold: 7.2, fade: 0.5 };

  function mount(root) {
    var panels = [];
    Array.prototype.forEach.call(root.querySelectorAll('[data-spot-panel]'), function (c) {
      panels.push(buildPanel(c, c.getAttribute('data-spot-panel')));
    });
    if (!panels.length) { return; }
    var TOTAL = T.hold + T.fade, END = T.orange[1] + 0.2;
    var apply = function (t) {
      var tp = easeOut(clamp01((t - T.purple[0]) / (T.purple[1] - T.purple[0])));
      var tx = pop(clamp01((t - T.x[0]) / (T.x[1] - T.x[0])));
      var to = easeOut(clamp01((t - T.orange[0]) / (T.orange[1] - T.orange[0])));
      var fade = t > T.hold ? 1 - clamp01((t - T.hold) / T.fade) : 1;
      panels.forEach(function (p) { p.set(tp, tx, to); p.svg.style.opacity = fade; });
    };
    var seekT = function (t) { apply(t < 0 ? 0 : t > T.hold ? T.hold : t); };
    if (reduced) { apply(T.hold); root._spot = { T: T, seek: seekT, scrub: function (f) { apply(END * (f < 0 ? 0 : f > 1 ? 1 : f)); }, play: function () {}, stop: function () {} }; return; }
    apply(0);
    var scrubbed = false;
    var start = null, raf = null, visible = false, pausedAt = 0;
    var frame = function (ts) {
      if (!start) { start = ts - pausedAt; }
      var t = ((ts - start) / 1000) % TOTAL;
      apply(t);
      raf = requestAnimationFrame(frame);
    };
    var play = function () { if (raf) { return; } start = null; raf = requestAnimationFrame(frame); };
    var stop = function () { if (raf) { cancelAnimationFrame(raf); raf = null; } };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { visible = e.isIntersecting; if (visible && !scrubbed) { pausedAt = 0; play(); } else { stop(); } });
      }, { threshold: 0.25 }).observe(root);
    } else { play(); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) { stop(); } else if (visible && !scrubbed) { play(); } });
    // Scroll-driven use: freeze the loop and place the timeline at a fraction of the hold point.
    root._spot = { T: T, seek: function (t) { scrubbed = true; stop(); seekT(t); }, scrub: function (f) { scrubbed = true; stop(); apply(END * (f < 0 ? 0 : f > 1 ? 1 : f)); }, release: function () { scrubbed = false; if (visible) { play(); } }, play: play, stop: stop };
    // Replay control: a plain text button inside the spotlight block, or, if the
    // markup places it outside, the first one on the page.
    var replay = root.querySelector('[data-spot-replay]') || document.querySelector('[data-spot-replay]');
    if (replay) { replay.addEventListener('click', function () { stop(); pausedAt = 0; play(); }); }
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-spotlight]'), mount);
})();
