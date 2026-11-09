/* ==========================================================================
   GLUESTICK project page — interactions and chart data.
   All numbers below are copied verbatim from the paper (CoRL 2026 / arXiv
   2510.08464v2). Do not edit values without updating the paper.
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Typeface comparison while designing: ?font=plex | dm | source swaps the sans family (default: Inter).
  (function () {
    var alt = { plex: ['IBM+Plex+Sans:wght@400;500;600', '"IBM Plex Sans"'], dm: ['DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600', '"DM Sans"'], source: ['Source+Sans+3:wght@400;500;600', '"Source Sans 3"'] };
    var mf = /[?&]font=(plex|dm|source)\b/.exec(window.location.search);
    if (!mf) { return; }
    var link = document.createElement('link'); link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + alt[mf[1]][0] + '&display=swap';
    document.head.appendChild(link);
    document.documentElement.style.setProperty('--font', alt[mf[1]][1] + ', system-ui, sans-serif');
  })();

  // Series colours (design tokens: --dense, --purple, --orange)
  var C = {
    dense: '#8E8E96',       // Full Dense
    fullSparse: '#6A44C2',  // Full Sparse
    sparseLB: '#9B7BE0',    // Sparse Language Backbone (pruned baselines)
    mmLB: '#9B7BE0',        // memory-matched Sparse L.B. (drawn hollow)
    gs: '#F35937',          // GLUESTICK (GLUESTICK-200 drawn hollow)
    ink: '#4F5058',
    unsafe: '#C8322B'
  };

  // ------------------------------------------------------------------------
  // 3D method animation (hero background + interactive method stage)
  // ------------------------------------------------------------------------
  var heroWrap = $('#hero-3d');
  if (heroWrap && window.GluestickScene) {
    var pruner = /[?&]pruner=scissors/.test(window.location.search) ? 'scissors' : 'blade';
    new window.GluestickScene(heroWrap, {
      labels: false, interactive: true, loop: true, autoplay: true, pixelRatioCap: 2,
      zoom: window.innerWidth < 900 ? 0.9 : 1.25, pruner: pruner
    });
  } else if (heroWrap) {
    heroWrap.classList.add('fallback');
  }

  var stage = $('#method-3d');
  if (stage && window.GluestickScene) {
    var stepTabs = $$('.step-tab[data-step]'), captions = $$('.step-caption[data-step]'), phaseText = $('#stage-phase-text');
    var playBtn = $('#stage-play');
    var STG = window.GluestickScene.STAGES || [], total = 0;
    STG.forEach(function (s) { total += s.dur; });
    var stepOf = function (node) { return parseInt(node.getAttribute('data-step'), 10); };
    var activeTab = null;
    var setFill = function (tab, frac) {
      var f = tab ? $('i.fill', tab) : null;
      if (f) { f.style.width = (frac * 100).toFixed(1) + '%'; }
    };
    var setPlayState = function (playing) {
      if (!playBtn) { return; }
      playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      var lbl = $('.lbl', playBtn), icPlay = $('.ic-play', playBtn), icPause = $('.ic-pause', playBtn);
      if (lbl) { lbl.textContent = playing ? 'Pause' : 'Play'; }
      if (icPlay) { icPlay.hidden = playing; }
      if (icPause) { icPause.hidden = !playing; }
    };
    var scene = new window.GluestickScene(stage, {
      labels: true, interactive: true, loop: true, autoplay: true, stepMode: false,
      pruner: /[?&]pruner=scissors/.test(window.location.search) ? 'scissors' : 'blade',
      onStage: function (i, st) {
        var shown = Math.min(i, 4);
        activeTab = null;
        stepTabs.forEach(function (b) {
          if (stepOf(b) === shown) { b.setAttribute('aria-current', 'step'); activeTab = b; }
          else { b.removeAttribute('aria-current'); setFill(b, 0); }
        });
        captions.forEach(function (c) { c.hidden = (stepOf(c) !== shown); });
        if (phaseText) { phaseText.textContent = st.phase; }
      },
      onProgress: function (p, held) {
        // p is progress through the whole animation; the active tab's fill
        // shows progress through the current step.
        if (activeTab && total) {
          var t = p * total, idx = 0, acc = 0;
          while (idx < STG.length - 1 && t >= acc + STG[idx].dur) { acc += STG[idx].dur; idx++; }
          var frac = idx > 4 ? 1 : Math.max(0, Math.min(1, (t - acc) / STG[idx].dur));
          setFill(activeTab, frac);
        }
        if (held) { setPlayState(false); }
      }
    });
    stepTabs.forEach(function (b) {
      b.addEventListener('click', function () {
        scene.opts.stepMode = true;
        scene.goTo(stepOf(b));
        setPlayState(true);
      });
    });
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (scene.playing) { scene.pause(); setPlayState(false); }
        else { scene.opts.stepMode = false; scene.play(); setPlayState(true); }
      });
      setPlayState(!reduced);
    }
    var replay = $('#stage-replay');
    if (replay) { replay.addEventListener('click', function () { scene.opts.stepMode = false; scene.restart(); setPlayState(true); }); }
    var figToggle = $('#stage-figure-toggle');
    if (figToggle) {
      figToggle.addEventListener('click', function () {
        var showFig = stage.classList.toggle('fallback');
        figToggle.textContent = showFig ? 'Show animation' : 'Show Figure 3';
        if (showFig) { scene.pause(); setPlayState(false); } else { scene.play(); setPlayState(true); }
      });
    }
  } else if (stage) {
    stage.classList.add('fallback');
  }

  // ------------------------------------------------------------------------
  // Generic tab groups ([data-tabs] > button[data-tab], panels [data-panel])
  // ------------------------------------------------------------------------
  $$('[data-tabs]').forEach(function (group) {
    var name = group.getAttribute('data-tabs');
    var btns = $$('button[data-tab]', group);
    var panels = $$('[data-panel-group="' + name + '"]');
    var activate = function (id) {
      btns.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === id ? 'true' : 'false'); });
      panels.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-panel') === id); });
    };
    btns.forEach(function (b) { b.addEventListener('click', function () { activate(b.getAttribute('data-tab')); }); });
    var initial = btns.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0] || btns[0];
    if (initial) { activate(initial.getAttribute('data-tab')); }
  });

  // ------------------------------------------------------------------------
  // Charts — data straight from the paper
  // ------------------------------------------------------------------------
  var V = window.Viz;
  function render(id, fn) { var e = document.getElementById(id); if (e && V) { fn(e); } }

  // Table 2: LIBERO success (%), averaged across OpenVLA and WorldVLA
  render('chart-libero-success', function (e) {
    V.bars(e, {
      categories: ['Spatial', 'Object', 'Goal', 'Long', 'Mean'], unit: '%', decimals: 1, yMax: 70, height: 300,
      aria: 'LIBERO task success rate by suite for Full Sparse, Sparse Language Backbone, memory-matched Sparse Language Backbone and GLUESTICK',
      series: [
        { name: 'Full Sparse', color: C.fullSparse, values: [0.0, 13.4, 0.8, 0.0, 3.6] },
        { name: 'Sparse L.B.', color: C.sparseLB, values: [17.3, 25.8, 20.5, 6.2, 17.5] },
        { name: '% Sparse L.B. (memory-matched)', color: C.mmLB, hollow: true, values: [15.2, 25.2, 21.2, 5.7, 16.8] },
        { name: 'GLUESTICK-500', color: C.gs, values: [54.0, 48.2, 46.1, 13.3, 40.4], label: true, emphasis: true }
      ]
    });
  });
  // Table 3: change in unsafe-episode rate (%) relative to Full Dense
  render('chart-libero-safety', function (e) {
    V.bars(e, {
      categories: ['Spatial', 'Object', 'Goal', 'Long', 'Mean'], unit: '', decimals: 1, signed: true, yMax: 30, height: 300,
      aria: 'Change in unsafe-episode rate relative to Full Dense by LIBERO suite',
      series: [
        { name: 'Full Sparse', color: C.fullSparse, values: [18.2, 23.0, 1.4, 11.6, 13.6] },
        { name: 'Sparse L.B.', color: C.sparseLB, values: [9.0, 13.2, 1.8, 9.4, 8.4] },
        { name: '% Sparse L.B. (memory-matched)', color: C.mmLB, hollow: true, values: [5.6, 14.4, 4.6, 5.2, 7.5] },
        { name: 'GLUESTICK-500', color: C.gs, values: [0.2, 1.2, 0.0, 4.6, 1.5], label: true, emphasis: true }
      ]
    });
  });

  // Navigation (NaVILA, VLN-CE-Isaac): Tables 4, 5 and appendix table
  var NAV = {
    cats: ['Full Dense', 'Full Sparse', 'Sparse L.B.', '% Sparse L.B.', 'GLUESTICK-200', 'GLUESTICK-500'],
    colors: [C.dense, C.fullSparse, C.sparseLB, C.mmLB, C.gs, C.gs],
    hollow: [false, false, false, true, true, false],
    success: [43.0, 0.0, 23.0, 25.0, 41.0, 44.0],
    dUnsafe: [0.0, 23.0, 2.0, 12.0, -1.0, -4.0],
    pl: [11.7, 17.6, 14.8, 14.9, 12.5, 11.9],
    dg: [5.9, 9.5, 8.5, 8.4, 6.5, 5.9],
    dVram: [0.00, -5.74, -5.68, -4.59, -5.36, -4.60]
  };
  function navRows(values) {
    return NAV.cats.map(function (c, i) {
      return { label: c, value: values[i], color: NAV.colors[i], hollow: NAV.hollow[i], series: c, emphasis: i >= 4 };
    });
  }
  // Row charts carry their labels on the rows themselves, so they need no legend.
  render('chart-nav-success', function (e) { V.hbars(e, { rows: navRows(NAV.success), unit: '%', decimals: 1, max: 50, labelWidth: 128, marginRight: 70, rowH: 28, aria: 'Navigation task success rate by method' }); });
  render('chart-nav-unsafe', function (e) {
    V.hbars(e, { rows: navRows(NAV.dUnsafe), unit: ' pp', decimals: 1, signed: true, min: -5, max: 25, labelWidth: 128, marginRight: 70, rowH: 26,
      aria: 'Change in unsafe-episode rate relative to Full Dense for navigation' });
  });
  render('chart-nav-pl', function (e) { V.hbars(e, { rows: navRows(NAV.pl), unit: ' m', decimals: 1, max: 20, labelWidth: 128, marginRight: 70, rowH: 26, aria: 'Mean path length by method' }); });
  render('chart-nav-dg', function (e) { V.hbars(e, { rows: navRows(NAV.dg), unit: ' m', decimals: 1, max: 10, labelWidth: 128, marginRight: 70, rowH: 26, aria: 'Mean final distance to goal by method' }); });

  // Edge latency (Table: NVIDIA Jetson Thor / Orin NX)
  render('chart-latency', function (e) {
    V.hbars(e, {
      width: 1000, unit: ' ms', decimals: 2, max: 3000, labelWidth: 200, marginRight: 210, rowH: 26, labelAlign: 'left', xLabel: 'End-to-end inference latency (ms), lower is better',
      aria: 'Edge inference latency on NVIDIA Jetson Thor and Orin NX for OpenVLA and WorldVLA',
      groups: [{ at: 0, label: 'OpenVLA, Jetson Thor' }, { at: 5, label: 'WorldVLA, Jetson Thor' }, { at: 9, label: 'OpenVLA, Jetson Orin NX (16 GB)' }],
      rows: [
        { label: 'Full Dense', value: 796.50, color: C.dense, series: 'OpenVLA, Jetson Thor', note: '±25.85' },
        { label: 'Full Sparse', value: 434.47, color: C.fullSparse, series: 'OpenVLA, Jetson Thor', note: '±3.63, 1.83×' },
        { label: 'Sparse Lang. Backbone', value: 439.45, color: C.sparseLB, series: 'OpenVLA, Jetson Thor', note: '±13.37, 1.81×' },
        { label: 'GLUESTICK-200', value: 453.58, color: C.gs, hollow: true, series: 'OpenVLA, Jetson Thor', note: '±31.29, 1.75×', emphasis: true },
        { label: 'GLUESTICK-500', value: 537.49, color: C.gs, series: 'OpenVLA, Jetson Thor', note: '±28.19, 1.48×', emphasis: true },
        { label: 'Full Dense', value: 2816.57, color: C.dense, series: 'WorldVLA, Jetson Thor', note: '±65.73' },
        { label: 'Sparse Lang. Backbone', value: 1488.44, color: C.sparseLB, series: 'WorldVLA, Jetson Thor', note: '±57.27, 1.89×' },
        { label: 'GLUESTICK-200', value: 1691.05, color: C.gs, hollow: true, series: 'WorldVLA, Jetson Thor', note: '±69.35, 1.67×', emphasis: true },
        { label: 'GLUESTICK-500', value: 1860.56, color: C.gs, series: 'WorldVLA, Jetson Thor', note: '±48.23, 1.51×', emphasis: true },
        { label: 'Full Dense', value: null, na: 'Out of memory', color: C.dense, series: 'OpenVLA, Jetson Orin NX' },
        { label: 'Sparse Lang. Backbone', value: 1546.37, color: C.sparseLB, series: 'OpenVLA, Jetson Orin NX', note: '±57.32, deploys' },
        { label: 'GLUESTICK-200', value: 1790.99, color: C.gs, hollow: true, series: 'OpenVLA, Jetson Orin NX', note: '±42.15, deploys', emphasis: true },
        { label: 'GLUESTICK-500', value: 2085.96, color: C.gs, series: 'OpenVLA, Jetson Orin NX', note: '±58.50, deploys', emphasis: true }
      ]
    });
  });

  // VRAM saved relative to Full Dense (NaVILA), Figure "Memory Savings"
  render('chart-vram', function (e) {
    V.hbars(e, {
      width: 1000, unit: ' GB', decimals: 2, max: 6.5, labelWidth: 150, marginRight: 90, rowH: 30, xLabel: 'VRAM saved relative to Full Dense (GB), NaVILA',
      aria: 'VRAM savings relative to Full Dense for NaVILA',
      rows: [
        { label: 'Full Dense', value: 0.00, color: C.dense },
        { label: 'Full Sparse', value: 5.74, color: C.fullSparse },
        { label: 'Sparse L.B.', value: 5.68, color: C.sparseLB },
        { label: '% Sparse L.B.', value: 4.59, color: C.mmLB, hollow: true },
        { label: 'GLUESTICK-200', value: 5.36, color: C.gs, hollow: true, emphasis: true },
        { label: 'GLUESTICK-500', value: 4.60, color: C.gs, emphasis: true }
      ]
    });
  });

  // Rank ablation (OpenVLA, LIBERO Spatial) — measured points only
  var RANK = [
    { label: 'Full Sparse', r: null, success: 0.0 },
    { label: 'GLUESTICK-1', r: 1, success: 0.6 },
    { label: 'GLUESTICK-25', r: 25, success: 7.4 },
    { label: 'GLUESTICK-100', r: 100, success: 18.6 },
    { label: 'GLUESTICK-200', r: 200, success: 30.8 },
    { label: 'GLUESTICK-500', r: 500, success: 57.4 }
  ];
  var slider = $('#rank-slider');
  if (slider) {
    var big = $('#rank-big'), bigNum = big ? $('.num', big) : null, cfgEl = $('#rank-cfg'), tickEls = $$('.rank-ticks span');
    var update = function () {
      var i = Math.max(0, Math.min(RANK.length - 1, parseInt(slider.value, 10) || 0)), d = RANK[i];
      if (bigNum) { bigNum.textContent = d.success.toFixed(1); }
      if (big) { big.classList.toggle('zero', d.success === 0); }
      if (cfgEl) { cfgEl.textContent = d.r === null ? 'Full Sparse, no correction' : d.label + ', correction rank r = ' + d.r; }
      slider.setAttribute('aria-valuetext', d.label);
      tickEls.forEach(function (s, k) { s.style.color = k === i ? 'var(--ink)' : ''; s.style.fontWeight = k === i ? '500' : ''; });
    };
    slider.addEventListener('input', update);
    update();
  }
  render('chart-rank', function (e) {
    V.bars(e, {
      categories: ['Full\nSparse', 'r = 1', 'r = 25', 'r = 100', 'r = 200', 'r = 500'], unit: '%', decimals: 1, yMax: 70, height: 250, labelAll: true, legend: false, marginBottom: 40,
      aria: 'Task success rate versus GLUESTICK rank on OpenVLA, LIBERO Spatial',
      series: [{ name: 'Task success (%)', color: C.gs, colors: [C.fullSparse, C.gs, C.gs, C.gs, C.gs, C.gs], values: RANK.map(function (d) { return d.success; }), emphasis: true }]
    });
  });

  // Composability: Int8 quantisation (OpenVLA, LIBERO Spatial)
  render('chart-int8', function (e) {
    V.bars(e, {
      categories: ['Dense', 'Dense\n+ Int8', 'Sparse', 'Sparse\n+ Int8', 'Sparse + Int8\n+ GLUESTICK'], unit: '%', decimals: 1, yMax: 100, height: 320, labelAll: true, legend: false, marginBottom: 42,
      aria: 'Success rate for dense, quantised, pruned and GLUESTICK-recovered OpenVLA on LIBERO Spatial',
      // colour follows the entity: dense, pruned, GLUESTICK
      series: [{ name: 'Task success (%)', color: C.gs, colors: [C.dense, C.dense, C.sparseLB, C.sparseLB, C.gs], values: [85.2, 84.8, 31.2, 31.8, 62.2], emphasis: true }]
    });
  });
  // Sparsity ablation (OpenVLA language backbone, Wanda, LIBERO Spatial)
  render('chart-sparsity', function (e) {
    V.bars(e, {
      categories: ['0% (dense)', '30%', '50%', '70%'], unit: '%', decimals: 1, yMax: 100, height: 260, labelAll: true,
      aria: 'Success rate at 0, 30, 50 and 70 percent sparsity with and without GLUESTICK-500',
      series: [
        { name: 'Wanda', color: C.sparseLB, values: [85.2, 80.8, 31.8, 1.2] },
        { name: 'Wanda + GLUESTICK-500', color: C.gs, values: ['n/a', 85.8, 60.2, 24.6], emphasis: true }
      ]
    });
  });
  // VLM generality (Qwen2-VL-7B-Instruct, DocVQA ANLS)
  render('chart-docvqa', function (e) {
    V.bars(e, {
      categories: ['0% (dense)', '30%', '50%', '70%'], unit: '', decimals: 2, yMax: 100, height: 260, labelAll: true,
      aria: 'DocVQA ANLS for Wanda-pruned Qwen2-VL-7B-Instruct with and without GLUESTICK-500',
      series: [
        { name: 'Wanda', color: C.sparseLB, values: [93.88, 93.38, 88.16, 21.30] },
        { name: 'Wanda + GLUESTICK-500', color: C.gs, values: ['n/a', 'n/a', 92.95, 90.89], emphasis: true }
      ]
    });
  });
  // Pruning-algorithm / sparsity-pattern agnostic (Magnitude, OpenVLA L.B., LIBERO Spatial)
  render('chart-agnostic', function (e) {
    V.bars(e, {
      categories: ['2:4 sparsity', '4:8 sparsity'], unit: '%', decimals: 1, yMax: 80, height: 240, labelAll: true,
      aria: 'Success rate for Magnitude pruning with and without GLUESTICK under 2:4 and 4:8 sparsity',
      series: [
        { name: 'Magnitude', color: C.sparseLB, values: [11.0, 25.4] },
        { name: 'Magnitude + GLUESTICK', color: C.gs, values: [48.8, 61.8], emphasis: true }
      ]
    });
  });

  // Real world: Unitree G1 (GR00T N1.7), 10 trials per model
  render('chart-g1', function (e) {
    V.bars(e, {
      categories: ['Dense', 'GLUESTICK-1000', 'Pruned'], unit: '%', decimals: 0, yMax: 100, height: 250, labelAll: true,
      aria: 'Unitree G1 success and unsafe-episode rate for dense, GLUESTICK and pruned GR00T N1.7',
      series: [
        { name: 'Task success (%)', color: C.ink, values: [90, 60, 0], emphasis: true },
        { name: 'Unsafe episodes (%)', color: C.unsafe, values: [0, 0, 90], emphasis: true }
      ]
    });
  });
  // Real world: Boston Dynamics Spot (NaVILA), trajectory deviation vs. Full Dense
  render('chart-spot', function (e) {
    V.bars(e, {
      categories: ['Dense', 'GLUESTICK', 'Pruned'], unit: '', decimals: 2, signed: true, yMax: 12, height: 250, labelAll: true, legend: false,
      aria: 'Trajectory deviation from the dense model for dense, GLUESTICK and pruned NaVILA on Spot',
      // colour follows the entity (Dense has a zero-height bar)
      series: [{ name: 'Trajectory deviation', color: C.gs, colors: [C.dense, C.gs, C.sparseLB], values: [0.00, 5.12, 10.26], emphasis: true }]
    });
  });

  // ------------------------------------------------------------------------
  // BibTeX copy, lightbox, videos
  // ------------------------------------------------------------------------
  var copyBtn = $('#bib-copy'), bibPre = $('#bibtex');
  if (copyBtn && bibPre) {
    copyBtn.addEventListener('click', function () {
      var text = bibPre.textContent;
      var done = function () {
        var lbl = $('.lbl', copyBtn) || copyBtn; var old = lbl.textContent; lbl.textContent = 'Copied';
        setTimeout(function () { lbl.textContent = old; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, done); }
      else {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (err) { /* ignore */ }
        document.body.removeChild(ta); done();
      }
    });
  }

  var lb = $('#lightbox');
  var lbImg = lb ? $('img', lb) : null, lbCap = lb ? $('.lb-cap', lb) : null;
  if (lb && lbImg) {
    var close = function () { lb.classList.remove('open'); lbImg.src = ''; document.body.style.overflow = ''; };
    $$('.zoomable').forEach(function (img) {
      img.addEventListener('click', function () {
        lbImg.src = img.getAttribute('data-full') || img.src;
        lbImg.alt = img.alt || '';
        if (lbCap) { lbCap.textContent = img.getAttribute('data-caption') || img.alt || ''; }
        lb.classList.add('open'); document.body.style.overflow = 'hidden';
      });
      img.setAttribute('tabindex', '0');
      img.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); img.click(); } });
    });
    lb.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); } });
  }

  // Autoplaying videos outside the demo: keep them playing, pause them off-screen.
  // (The demo's clips are driven by the demo code below, which keeps each pair together;
  // the segments the authors selected for the navigation clips are data-start/data-end there.)
  // No picture-in-picture or casting for any clip on the page.
  $$('video').forEach(function (v) { v.disablePictureInPicture = true; v.disableRemotePlayback = true; });
  var looseVideos = $$('video[autoplay]').filter(function (v) { return !v.closest('#demo'); });
  looseVideos.forEach(function (v) { v.muted = true; var p = v.play(); if (p && p.catch) { p.catch(function () {}); } });
  if ('IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) { var p = v.play(); if (p && p.catch) { p.catch(function () {}); } } else { v.pause(); }
      });
    }, { threshold: 0.1 });
    looseVideos.forEach(function (v) { vio.observe(v); });
  }

  // ------------------------------------------------------------------------
  // Tables: text columns read left-aligned, numeric columns right-aligned;
  // narrow tables do not stretch across the whole container.
  // ------------------------------------------------------------------------
  $$('table.tbl').forEach(function (t) {
    var rows = $$('tbody tr', t), head = $$('thead th', t);
    if (!rows.length) { return; }
    var ncol = Math.max.apply(null, rows.map(function (r) { return r.children.length; }));
    for (var c = 0; c < ncol; c++) {
      var cells = rows.map(function (r) { return r.children[c]; }).filter(Boolean);
      var texts = cells.map(function (td) { return td.textContent.trim(); }).filter(function (x) { return x; });
      var textual = texts.length && texts.every(function (x) { return !/^[\u2212\-+]?\d/.test(x) && !/^(yes|no|n\/a|\u2014)$/i.test(x); });
      if (textual) {
        cells.forEach(function (td) { td.classList.add('txt'); });
        if (head[c]) { head[c].classList.add('txt'); }
      }
    }
    var wrap = t.parentNode;
    if (wrap && wrap.classList.contains('tbl-wrap') && !wrap.style.maxWidth) {
      if (ncol <= 3) { wrap.style.maxWidth = '560px'; wrap.style.marginInline = 'auto'; }
      else if (ncol <= 6) { wrap.style.maxWidth = '880px'; wrap.style.marginInline = 'auto'; }
    }
  });

  // Wide tables: show a fade at the right edge while they can scroll sideways.
  var markScrollable = function () {
    $$('.tbl-wrap').forEach(function (w) { w.classList.toggle('is-scrollable', w.scrollWidth > w.clientWidth + 1); });
  };
  markScrollable();
  window.addEventListener('resize', markScrollable);
  document.addEventListener('toggle', function () { setTimeout(markScrollable, 50); }, true);
  $$('.tbl-wrap').forEach(function (w) { w.addEventListener('scroll', function () { w.classList.toggle('is-scrollable', w.scrollLeft + w.clientWidth < w.scrollWidth - 1); }, { passive: true }); });


  // ------------------------------------------------------------------------
  // Pinned scenes driven by scroll (desktop) or by the block rising through
  // the viewport (phones): the pruning collapse and Figure 1.
  // ------------------------------------------------------------------------
  var sceneProgress = function (scrollEl, stickyEl, blockEl) {
    if (!scrollEl) { return 0; }
    var pinned = stickyEl && getComputedStyle(stickyEl).position === 'sticky', p;
    if (pinned) {
      var r = scrollEl.getBoundingClientRect(), total = scrollEl.offsetHeight - window.innerHeight;
      if (total <= 0) { return 0; }
      p = -r.top / total;
    } else {
      var g = (blockEl || scrollEl).getBoundingClientRect(), vh = window.innerHeight;
      p = (vh - g.top) / (vh * 0.55 + g.height * 0.5);
    }
    return p < 0 ? 0 : p > 1 ? 1 : p;
  };
  var easeOutCubic = function (x) { return x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3); };
  // Fit every full-screen page to the visible window. Laptops with display scaling (125-150%) and
  // browser toolbars leave far less height than the screen size suggests; when a page's content is
  // taller than the window it is scaled down uniformly (CSS zoom) so it always fits, never cut off.
  var fitPages = function () {
    var desktopLayout = window.innerWidth > 720 && window.innerHeight > 560;   // phones use the stacked layout
    var targets = $$('.scene-sticky > .wrap, .real-page > .wrap, .end-page > .end-wrap, .hero .hero-content');
    targets.forEach(function (w) { w.style.zoom = ''; });
    if (!desktopLayout) { return; }
    var vh = window.innerHeight;
    // Height of the content as laid out, ignoring entrance offsets (transforms) and absolutely placed overlays.
    var contentHeight = function (w) {
      var wr = w.getBoundingClientRect(), z = parseFloat(w.style.zoom) || 1, h = w.scrollHeight * z;
      w.querySelectorAll('*').forEach(function (e) {
        var cs = getComputedStyle(e); if (cs.position === 'absolute' || cs.position === 'fixed' || cs.display === 'none') { return; }
        var below = (e.offsetTop + e.offsetHeight) * z; if (e.offsetParent === w && below > h) { h = below; }
      });
      return h;
    };
    targets.forEach(function (w) {
      var isHero = w.classList.contains('hero-content');
      var hero = isHero ? w.closest('.hero') : null;
      var room = isHero ? (hero.clientHeight - 120) : (vh - 28);                // leave a little air; the hero keeps room for the scroll cue below it
      var zoom = 1;
      for (var pass = 0; pass < 3; pass++) {                                      // re-measure after scaling: wrapped text can change height
        var h = contentHeight(w);
        if (!(h > room + 1)) { break; }
        zoom = Math.max(0.6, zoom * room / h);
        w.style.zoom = zoom.toFixed(3);
      }
    });
  };
  var fitTimer = null;
  var refit = function () { if (fitTimer) { clearTimeout(fitTimer); } fitTimer = setTimeout(function () { fitTimer = null; fitPages(); window.dispatchEvent(new Event('scroll')); }, 120); };
  window.addEventListener('resize', refit);
  window.addEventListener('load', refit);
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(refit); }
  fitPages();
  // The hero's scroll cue goes away as soon as the reader scrolls (and comes back at the top).
  var cue = $('#scroll-cue');
  if (cue) {
    var cueTick = false, cueUpdate = function () { cue.classList.toggle('hidden', window.scrollY > 60); };
    window.addEventListener('scroll', function () { if (cueTick) { return; } cueTick = true; requestAnimationFrame(function () { cueTick = false; cueUpdate(); }); }, { passive: true });
    cueUpdate();
  }
  // Smoothed scrubbing: the scene eases toward the scroll position over ~150 ms,
  // so each wheel step reads as motion rather than a jump. Linear in scroll
  // otherwise: constant scrolling means constant animation speed.
  var scrubber = function (read, apply) {
    var cur = null, target = 0, raf = null, last = 0;
    var tick = function (now) {
      raf = null;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60; last = now;
      cur += (target - cur) * (1 - Math.exp(-dt / 0.15));
      if (Math.abs(target - cur) < 0.0005) { cur = target; apply(cur); return; }
      apply(cur); raf = requestAnimationFrame(tick);
    };
    var sync = function (immediate) {
      target = read();
      if (cur === null || immediate || reduced) { if (raf) { cancelAnimationFrame(raf); raf = null; } cur = target; apply(cur); return; }
      if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    };
    window.addEventListener('scroll', function () { sync(false); }, { passive: true });
    window.addEventListener('resize', function () { sync(true); });
    return sync;
  };
  var smooth01 = function (x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
  // Staged entrance: an element fades and rises in between scroll fractions a and b.
  var enter = function (el, p, a, b, dy) {
    if (!el) { return; }
    var t = reduced ? 1 : smooth01((p - a) / (b - a));
    el.style.opacity = t; el.style.transform = 'translateY(' + (dy * (1 - t)).toFixed(1) + 'px)';
  };

  // Collapse scene: dense weights and Table 1, then pruning (values verbatim from the paper).
  var TABLE1 = [
    { model: 'OpenVLA 7B', domain: 'Manipulation', success: { dense: 85.2, magnitude: 0.0, wanda: 0.0 }, unsafe: { dense: 33.4, magnitude: 46.4, wanda: 51.6 } },
    { model: 'NaVILA 8B', domain: 'Navigation', success: { dense: 43.0, magnitude: 0.0, wanda: 0.0 }, unsafe: { dense: 23.0, magnitude: 100.0, wanda: 46.0 } }
  ];
  var ccChart = $('#collapse-chart'), ccStage = $('#collapse-3d'), ccScroll = $('#collapse-scroll'), ccPhase = $('#collapse-phase');
  var ccLead = $('#collapse-page .collapse-lead'), ccHead = $('#collapse-page .scene-head'), ccLegend = $('#collapse-legend');
  if (ccChart) {
    var ccBars = [];
    var el = function (tag, cls, text, parent) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text != null) { e.textContent = text; } if (parent) { parent.appendChild(e); } return e; };
    // Column headers: one per model. Row headers: one per metric, never repeated.
    // Legend (outside the cards): the gray bar is the dense model, the purple bars are the pruned models.
    if (ccLegend) {
      [['dense', 'Dense'], ['pruned', 'Pruned']].forEach(function (it) {
        var key = el('span', 'cc-key ' + it[0], null, ccLegend); el('i', null, null, key); el('span', null, it[1], key);
      });
    }
    // One card per metric; inside each, the two models side by side.
    [['success', 'Task success'], ['unsafe', 'Unsafe episodes']].forEach(function (met) {
      var card = el('div', 'cc-card', null, ccChart);
      var band = el('div', 'cc-band', null, card);
      el('b', null, met[1], band); el('span', null, '(%)', band);
      var groups = el('div', 'cc-groups', null, card);
      TABLE1.forEach(function (row) {
        var group = el('div', 'cc-group', null, groups);
        var cap = el('div', 'cc-model-cap', null, group); cap.appendChild(document.createTextNode(row.model)); el('span', null, row.domain, cap);
        var bars = el('div', 'cc-bars', null, group), names = el('div', 'cc-names', null, group);
        var denseBar = null;
        ['dense', 'magnitude', 'wanda'].forEach(function (method) {
          var bar = el('div', 'cc-bar ' + method, null, bars);
          var v = el('span', 'v', null, bar), i = el('i', null, null, bar);
          var name = el('span', null, method === 'dense' ? 'Dense' : method.charAt(0).toUpperCase() + method.slice(1), names);
          if (method === 'dense') { denseBar = bar; }
          ccBars.push({ bar: bar, v: v, i: i, name: name, dense: denseBar, method: method, from: row[met[0]].dense, to: row[met[0]][method], pruned: method !== 'dense' });
        });
      });
    });
    var GRAY = [154, 155, 163], PURPLE = [123, 79, 209];
    var mixColor = function (a, b, t) { return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')'; };
    // Slot distance from each pruned bar back to its group's dense bar (transforms don't affect offsetLeft).
    var measureChart = function () { ccBars.forEach(function (b) { if (b.pruned) { b.dx0 = b.dense.offsetLeft - b.bar.offsetLeft; } }); };
    measureChart();
    // k: 0 = only the dense bar stands in each group; 1 = pruned bars in place. In between, copies of
    // the dense bar slide into the Magnitude and Wanda slots, turning purple
    // and changing height and value on the way to the paper's pruned numbers.
    var setChart = function (k) {
      ccBars.forEach(function (b) {
        if (!b.pruned) { b.i.style.height = Math.max(0, Math.min(100, b.from)) + '%'; b.v.textContent = b.from.toFixed(1) + '%'; return; }
        // Both copies leave together, so the Wanda copy (two slots away) runs ahead of the Magnitude copy.
        // Height and colour start changing once the copies are clear of the dense bar; the moving value
        // labels appear once there is room for them beside the dense bar's label.
        var kk = smooth01(k), kv = smooth01((k - 0.25) / 0.75);
        var val = b.from + (b.to - b.from) * kv;
        b.i.style.height = Math.max(0, Math.min(100, val)) + '%';
        b.i.style.background = mixColor(GRAY, PURPLE, kv);
        b.v.textContent = val.toFixed(1) + '%';
        b.v.style.opacity = smooth01((kk - 0.5) / 0.3);
        b.bar.style.transform = 'translateX(' + ((b.dx0 || 0) * (1 - kk)).toFixed(1) + 'px)';
        b.name.style.opacity = 0.35 + 0.65 * kk;
      });
    };
    setChart(0);
    window.addEventListener('resize', measureChart);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(measureChart); }
    var ccScene = null;
    if (ccStage && window.GluestickScene) {
      ccScene = new window.GluestickScene(ccStage, { labels: true, interactive: true, autoplay: false, loop: false, stepMode: true, zoom: window.innerWidth < 900 ? 1.1 : 1.2, stackPull: 5.2, stackCenter: true,
        pruner: /[?&]pruner=scissors/.test(window.location.search) ? 'scissors' : 'blade' });
      ccScene.seek(0, 2);
    }
    var ccSticky = ccScroll ? ccScroll.firstElementChild : null;
    // Scroll schedule (fractions of the pinned scroll): the heading rises in, then the
    // two cards, then the 3D stack forms and the blade sweeps (the first two stages,
    // over SCENE0..0.8), then the paragraph rises in; the result holds for the rest.
    // The blade crosses the layer between SWEEP0 and SWEEP1 and the bars move with it.
    var SCENE0 = 0.22, SWEEP0 = 0.530, SWEEP1 = 0.751;
    var ccDone = null;   // the pruned bars pulse twice each time the sweep completes
    var applyCollapse = function (p) {
      enter(ccHead, p, 0.0, 0.1, 22);
      enter(ccLegend, p, 0.1, 0.22, 20);
      enter(ccStage, p, 0.1, 0.22, 28);
      enter(ccChart, p, 0.15, 0.27, 28);
      if (ccScene) { ccScene.seek(Math.max(0, Math.min(1, (p - SCENE0) / (0.8 - SCENE0))), 2); }
      setChart(Math.max(0, Math.min(1, (p - SWEEP0) / (SWEEP1 - SWEEP0))));
      enter(ccLead, p, SWEEP1, SWEEP1 + 0.1, 18);
      var done = p >= SWEEP1;
      if (ccDone === null) { ccDone = done; }
      else if (done !== ccDone) { ccDone = done; ccChart.classList.toggle('pulse', done); }
      if (ccPhase) { ccPhase.textContent = p < SWEEP0 ? 'Dense weights' : p < SWEEP1 ? 'Pruning to 50% 2:4 sparsity' : 'Pruned to 50% 2:4 sparsity'; }
    };
    var syncCollapse = scrubber(function () { return reduced ? 1 : sceneProgress(ccScroll, ccSticky, ccStage); }, applyCollapse);
    syncCollapse(true);
  }

  // Figure 1 scene: the paths draw with scroll on the pinned stage; phones keep the loop.
  var figScroll = $('#fig-scroll'), figRoot = $('[data-spotlight]');
  if (figScroll && figRoot) {
    var figSticky = figScroll.firstElementChild;
    var figHead = $('.figure-head', figScroll), figPanels = $$('.spot-panel', figScroll), figFails = $$('.spot-fail', figScroll);
    var figIntro = $('.spot-intro .intro-head', figScroll), figFacts = $$('.spot-intro .intro-facts li', figScroll);
    var figStaged = [figHead, figIntro].concat(figPanels, figFails, figFacts);
    var figPulsed = null;   // the orange paths pulse twice each time they finish drawing
    var lin = function (p, a, b, t0, t1) { var k = (p - a) / (b - a); k = k < 0 ? 0 : k > 1 ? 1 : k; return t0 + (t1 - t0) * k; };
    // Schedule (fractions of the pinned scroll): heading; the two tasks; the pruned paths draw and
    // the X marks pop (0.22..0.5) with a failure statement under each; GLUESTICK is introduced,
    // statement then facts one by one (0.56..0.8); only then do the orange paths draw (0.78..0.92),
    // the stage warms and the paths pulse.
    var applyFig = function (p) {
      var pinned = figSticky && getComputedStyle(figSticky).position === 'sticky';
      if (!pinned || reduced || !figRoot._spot) {
        if (figRoot._spot && figRoot._spot.release) { figRoot._spot.release(); }
        figStaged.forEach(function (e) { if (e) { e.style.opacity = ''; e.style.transform = ''; } });
        return;
      }
      var T = figRoot._spot.T;
      enter(figHead, p, 0, 0.08, 22);
      figPanels.forEach(function (e, i) { enter(e, p, 0.08 + 0.04 * i, 0.2 + 0.04 * i, 28); });
      var tEnd = T.x[1] + 0.1;   // just after the X has popped; nothing moves until the orange starts
      figRoot._spot.seek(p < 0.5 ? lin(p, 0.22, 0.5, 0, tEnd) : p < 0.78 ? tEnd : lin(p, 0.78, 0.92, T.orange[0], T.orange[1] + 0.1));
      figFails.forEach(function (e, i) { enter(e, p, 0.46 + 0.04 * i, 0.54 + 0.04 * i, 14); });
      enter(figIntro, p, 0.56, 0.64, 18);
      figFacts.forEach(function (e, i) { enter(e, p, 0.6 + 0.045 * i, 0.66 + 0.045 * i, 12); });
      var drawn = p >= 0.92;
      if (figPulsed === null) { figPulsed = drawn; }
      else if (drawn !== figPulsed) { figPulsed = drawn; figRoot.classList.toggle('pulse', drawn); }
      if (overview) {
        overview.classList.toggle('fig-failed', p > 0.47 && p <= 0.8);
        overview.classList.toggle('fig-applied', p > 0.8);
      }
    };
    var syncFig = scrubber(function () { return sceneProgress(figScroll, figSticky, figRoot); }, applyFig);
    setTimeout(function () { syncFig(true); }, 0);
  }
  // ------------------------------------------------------------------------
  // Video demo ("Take a look."). Between the Figure 1 page and this one the gluestick icon
  // flies from its introduction into the slot above the GLUESTICK column. Landing applies it:
  // the GLUESTICK clips light up and each pair (pruned / with GLUESTICK) restarts together and
  // stays together: a clip that ends first holds its last frame until its partner ends.
  // ------------------------------------------------------------------------
  var demo = $('#demo'), demoScroll = $('#demo-scroll'), floater = $('#gs-floater'), slot = $('#demo-slot');
  var overview = $('#overview');
  if (demo && demoScroll) {
    var demoSticky = demoScroll.firstElementChild, figScrollEl = $('#fig-scroll'), rail = $('#demo-rail i');
    var introIcon = $('#fig-scroll .intro-head img'), slotIcon = slot ? $('.slot-icon', slot) : null;
    var demoState = null;
    var safePlay = function (v) { var pr = v.play(); if (pr && pr.catch) { pr.catch(function () {}); } };
    // Each clip plays a segment: data-start .. data-end (defaults: the whole clip).
    var seekStart = function (v) {
      if (v.readyState < 1) { v._seekPending = true; return; }   // no metadata yet: seek when it arrives
      v._seekPending = false;
      try { v.currentTime = v._seg.start; } catch (e) { v._seekPending = true; }
    };
    var restartOne = function (v) { seekStart(v); safePlay(v); };
    var restartPair = function (pr) { pr.done = {}; [pr.pruned, pr.glue].forEach(function (v) { if (v) { restartOne(v); } }); };
    var pairs = $$('.demo-row', demo).map(function (row) {
      var pr = { pruned: $('.v-pruned', row), glue: $('.v-glue', row), done: {} };
      [['pruned', pr.pruned], ['glue', pr.glue]].forEach(function (kv) {
        var key = kv[0], v = kv[1];
        if (!v) { return; }
        v._seg = { start: parseFloat(v.getAttribute('data-start')) || 0, end: parseFloat(v.getAttribute('data-end')) || Infinity };
        var bar = v.parentNode.querySelector('.vprog b');
        var progress = function () {
          if (!bar) { return; }
          var end = isFinite(v._seg.end) ? v._seg.end : (v.duration || 0), span = end - v._seg.start;
          var k = span > 0 ? (v.currentTime - v._seg.start) / span : 0;
          bar.style.width = (Math.max(0, Math.min(1, k)) * 100).toFixed(1) + '%';
        };
        v.addEventListener('seeked', progress); v.addEventListener('loadedmetadata', progress);
        v.addEventListener('loadedmetadata', function () { if (v._seekPending || v.currentTime < v._seg.start) { seekStart(v); } });
        if (v.readyState >= 1 && v.currentTime < v._seg.start) { seekStart(v); }   // metadata may have arrived before this ran
        var finish = function () {
          if (pr.done[key]) { return; }
          pr.done[key] = true; v.pause();   // hold the last frame until the partner is done too
          if (demoState === 'glue') { if (pr.done.pruned && pr.done.glue) { restartPair(pr); } }
          else if (key === 'pruned') { pr.done = {}; restartOne(v); }
        };
        v.addEventListener('ended', finish);
        v.addEventListener('canplay', function () { if (v._seekPending) { seekStart(v); } });
        // self-heal: a clip found playing before its segment start (a seek the browser dropped) is moved there
        v.addEventListener('timeupdate', function () {
          progress();
          if (v.currentTime >= v._seg.end) { finish(); }
          else if (v.currentTime < v._seg.start - 0.05 && !v.paused) { seekStart(v); }
        });
      });
      return pr;
    });
    var setDemo = function (state) {
      if (state === demoState) { return; }
      demoState = state;
      demo.setAttribute('data-state', state);
      if (overview) { overview.classList.toggle('applied', state === 'glue'); }
      if (state === 'glue') { pairs.forEach(restartPair); }
      else { pairs.forEach(function (pr) { pr.done = {}; if (pr.glue) { pr.glue.pause(); seekStart(pr.glue); } if (pr.pruned && pr.pruned.paused) { restartOne(pr.pruned); } }); }
    };
    // Off-screen the clips rest; coming back, pairs restart together.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { pairs.forEach(function (pr) { if (demoState === 'glue') { restartPair(pr); } else if (pr.pruned) { pr.done = {}; restartOne(pr.pruned); } }); }
          else { pairs.forEach(function (pr) { [pr.pruned, pr.glue].forEach(function (v) { if (v) { v.pause(); } }); }); }
        });
      }, { threshold: 0.1 }).observe(demo);
    }
    // Landing: the gluestick is accepted into the slot over a moment (CSS "landing" state),
    // then GLUESTICK is applied. Scrolling back during that moment cancels it.
    var landTimer = null, LAND_MS = 950;
    var land = function () {
      if (demoState === 'glue' || demoState === 'landing') { return; }
      demoState = 'landing'; demo.setAttribute('data-state', 'landing');
      landTimer = setTimeout(function () { landTimer = null; demoState = null; setDemo('glue'); }, LAND_MS);
    };
    var unland = function () {
      if (landTimer) { clearTimeout(landTimer); landTimer = null; }
      if (demoState === 'landing') { demoState = null; }
      setDemo('pruned');
    };
    // 0: the Figure 1 page is still pinned; 1: this page is exactly pinned. In between, the
    // previous page slides up and this one slides in, and the gluestick is in flight.
    var transition = function () {
      if (!figScrollEl) { return 1; }
      var q = 1 - figScrollEl.getBoundingClientRect().bottom / window.innerHeight;
      return q < 0 ? 0 : q > 1 ? 1 : q;
    };
    var updateDemo = function () {
      var pinned = demoSticky && getComputedStyle(demoSticky).position === 'sticky';
      if (!pinned || reduced || !floater || !introIcon || !slotIcon) {
        if (floater) { floater.style.display = 'none'; }
        if (introIcon) { introIcon.style.visibility = ''; }
        setDemo('glue');
        return;
      }
      var q = transition(), vh = window.innerHeight;
      // while pinned, the rail shows how far through the hold the scroll is
      var total = demoScroll.offsetHeight - vh, pd = total > 0 ? -demoScroll.getBoundingClientRect().top / total : 0;
      pd = pd < 0 ? 0 : pd > 1 ? 1 : pd;
      demoSticky.classList.toggle('holding', q >= 1 && pd < 1);
      if (rail) { rail.style.height = (pd * 100).toFixed(1) + '%'; }
      if (q <= 0 || q >= 1) {
        floater.style.display = 'none';
        introIcon.style.visibility = '';
        if (q >= 1) { land(); } else { unland(); }
        return;
      }
      // Start: where the intro icon sat when the flight began (that page has since moved up by q*vh).
      // End: where the slot icon will sit once this page is pinned (its offset inside the scroll block).
      var a = introIcon.getBoundingClientRect(), b = slotIcon.getBoundingClientRect(), d = demoScroll.getBoundingClientRect();
      var k = q * q * (3 - 2 * q);
      var x = a.left + (b.left - a.left) * k, y = (a.top + q * vh) + ((b.top - d.top) - (a.top + q * vh)) * k - 110 * Math.sin(Math.PI * q);
      var w = a.width + (b.width - a.width) * k;
      floater.style.display = 'block'; floater.style.width = w.toFixed(1) + 'px';
      floater.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (-18 + 36 * k) + 'deg)';
      introIcon.style.visibility = 'hidden';
      unland();
    };
    var demoTick = false;
    window.addEventListener('scroll', function () { if (demoTick) { return; } demoTick = true; requestAnimationFrame(function () { demoTick = false; updateDemo(); }); }, { passive: true });
    window.addEventListener('resize', updateDemo);
    setTimeout(updateDemo, 0);
  }

  // ------------------------------------------------------------------------
  // Real robot page. Both G1 rollouts start together when the page is in view. On the pruned
  // rollout, each safety violation lights its marker on the video, a toast, and its line in the
  // log at the time it happens (self-collision at 0:08, containment breach at 0:44). Each card's
  // outcome appears when its clip ends; the shorter clip holds its last frame, then both restart.
  // ------------------------------------------------------------------------
  var realPage = $('#real-page');
  if (realPage) {
    var cageToggle = $('#cage-toggle');
    if (cageToggle) { cageToggle.addEventListener('change', function () { realPage.classList.toggle('show-cage', cageToggle.checked); }); }
    var EVENTS = { collision: [8.0, 10.5], breach: [44.0, Infinity] };   // [start, end of on-video marker] in seconds
    var cards = $$('.real-card', realPage).map(function (card) {
      return { card: card, v: $('video', card), bar: $('.real-prog b', card), outcome: $('.real-outcome', card), done: false };
    });
    var realRaf = null, realVisible = false, restartTimer = null;
    var paint = function () {
      cards.forEach(function (c) {
        var v = c.v; if (!v) { return; }
        var t = v.currentTime || 0, d = v.duration || 0;
        if (c.bar && d) { c.bar.style.width = (Math.min(1, t / d) * 100).toFixed(2) + '%'; }
        Object.keys(EVENTS).forEach(function (k) {
          var w = EVENTS[k], on = t >= w[0] && t < w[1];
          $$('[data-ev="' + k + '"]', c.card).forEach(function (el) {
            if (el.classList.contains('chk')) { el.classList.toggle('tripped', t >= w[0]); }
            else { el.classList.toggle('on', on); }
          });
        });
        if (d && t >= d - 0.12) { c.done = true; }
        if (c.outcome) { c.outcome.classList.toggle('shown', c.done); }
      });
    };
    var loop = function () { realRaf = null; paint(); if (realVisible) { realRaf = requestAnimationFrame(loop); } };
    var restartAll = function () {
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      cards.forEach(function (c) {
        c.done = false;
        if (!c.v) { return; }
        try { c.v.currentTime = 0; } catch (e) { /* not loaded yet */ }
        var pr = c.v.play(); if (pr && pr.catch) { pr.catch(function () {}); }
      });
      paint();
    };
    cards.forEach(function (c) {
      if (!c.v) { return; }
      c.v.addEventListener('ended', function () {
        c.done = true; paint();
        if (cards.every(function (x) { return x.done; }) && !restartTimer) { restartTimer = setTimeout(restartAll, 2500); }
      });
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          realVisible = e.isIntersecting;
          if (realVisible) { restartAll(); if (!realRaf) { realRaf = requestAnimationFrame(loop); } }
          else { cards.forEach(function (c) { if (c.v) { c.v.pause(); } }); if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; } }
        });
      }, { threshold: 0.35 }).observe($('.real-grid', realPage));
    } else { realVisible = true; restartAll(); loop(); }
  }

  // ------------------------------------------------------------------------
  // Tables page: the heading, then the three table cards rise in one after another.
  // ------------------------------------------------------------------------
  var tblScroll = $('#tables-scroll');
  if (tblScroll) {
    var tblSticky = tblScroll.firstElementChild, tblHead = $('.tables-head', tblScroll), tblCards = $$('.tcard', tblScroll);
    var applyTables = function (p) {
      var pinned = tblSticky && getComputedStyle(tblSticky).position === 'sticky';
      if (!pinned || reduced) {
        if (tblHead) { tblHead.style.opacity = ''; tblHead.style.transform = ''; }
        tblCards.forEach(function (c) { c.style.opacity = ''; c.style.transform = ''; });
        return;
      }
      enter(tblHead, p, 0, 0.08, 22);
      tblCards.forEach(function (c, i) { enter(c, p, 0.12 + 0.16 * i, 0.26 + 0.16 * i, 26); });
    };
    var syncTables = scrubber(function () { return sceneProgress(tblScroll, tblSticky, $('#tables-grid')); }, applyTables);
    setTimeout(function () { syncTables(true); }, 0);
  }

  // ------------------------------------------------------------------------
  // "How GLUESTICK works": the 3D pipeline (dense layer, 2:4 pruning, gap matrix,
  // truncated SVD, inference) is scrubbed by scroll; a five-step rail under the stage
  // fills along, and the caption for the current step is shown beneath it.
  // ------------------------------------------------------------------------
  var howScroll = $('#how-scroll'), howStage = $('#how-3d'), howPhase = $('#how-phase');
  if (howScroll && howStage) {
    var howSticky = howScroll.firstElementChild, howHead = $('.how-head', howScroll), howBody = $('.how-body', howScroll), howFoot = $('.how-foot', howScroll);
    var howTabs = $$('.how-tab', howScroll), howSteps = $$('.how-step', howScroll);
    var howScene = null, howPlaying = false, howEqs = $$('#how-eq .eq');
    // the boxed phase tag ("Offline" / "Online" + what is happening) and the stage's equation
    var setHowStage = function (i, st) {
      var k = Math.min(i, howEqs.length - 1);
      howEqs.forEach(function (e, n) { e.classList.toggle('active', n === k); });
      if (!howPhase) { return; }
      var parts = String(st.phase).split(':');
      howPhase.innerHTML = '<b>' + parts[0].trim() + '</b><span>' + (parts[1] || '').trim() + '</span>';
      howPhase.classList.toggle('online', /^online/i.test(parts[0]));
    };
    if (window.GluestickScene) {
      howScene = new window.GluestickScene(howStage, { labels: true, interactive: true, autoplay: false, loop: true, stepMode: false, zoom: window.innerWidth < 900 ? 1.0 : 1.5, stackPull: 6.5, stackCenter: true,
        pruner: /[?&]pruner=scissors/.test(window.location.search) ? 'scissors' : 'blade',
        onStage: function (i, st) { setHowStage(i, st); } });
      howScene.seekBetween(0, 4, 0);
    }
    // Scroll schedule: heading, then the stage with its rail; the five stages span HOW0..HOW1
    // in proportion to their durations; the result holds for the rest.
    var HOW0 = 0.16, HOW1 = 0.92, HOW_DUR = [3.2, 3.6, 3.4, 3.8, 5.6];
    var howCuts = (function () { var tot = 0, acc = 0, c = [HOW0]; HOW_DUR.forEach(function (d) { tot += d; }); HOW_DUR.forEach(function (d) { acc += d; c.push(HOW0 + (HOW1 - HOW0) * acc / tot); }); return c; })();
    var howFlip = $('#how-flip'), howNum = howFlip ? $('.n', howFlip) : null, howCur = -1, flipTimer = null;
    var showStep = function (i) {
      howSteps.forEach(function (e, k) { e.classList.toggle('active', k === i); });
      howTabs.forEach(function (e, k) { e.classList.toggle('active', k === i); e.classList.toggle('done', k < i); });
      if (i === howCur) { return; }
      var first = howCur < 0; howCur = i;
      if (!howFlip || !howNum) { return; }
      howFlip.setAttribute('data-tone', i < 2 ? 'purple' : 'orange');
      if (first || reduced) { howNum.textContent = String(i + 1); return; }
      // split-flap: the numeral folds away and the new one folds in
      if (flipTimer) { clearTimeout(flipTimer); }
      howFlip.classList.remove('flipping'); void howFlip.offsetWidth; howFlip.classList.add('flipping');
      flipTimer = setTimeout(function () { howNum.textContent = String(i + 1); flipTimer = null; }, 180);
    };
    var applyHow = function (p) {
      var pinned = howSticky && getComputedStyle(howSticky).position === 'sticky';
      if (!pinned || reduced) {
        [howHead, howBody, howFoot].forEach(function (e) { if (e) { e.style.opacity = ''; e.style.transform = ''; } });
        howSteps.forEach(function (e) { e.classList.add('active'); });
        howTabs.forEach(function (e) { var f = $('b', e); if (f) { f.style.width = '100%'; } });
        if (howScene && !howPlaying && !reduced) { howPlaying = true; howScene.play(); }
        if (howScene && reduced) { howScene.seekBetween(0, 4, 1); }
        return;
      }
      if (howHead) { howHead.style.opacity = ''; howHead.style.transform = ''; }   // the heading is up from the start: the gluestick lands on it
      enter(howBody, p, 0.05, 0.15, 28);
      if (howScene) { howScene.seekBetween(0, 4, (p - HOW0) / (HOW1 - HOW0)); }
      var cur = 0;
      howTabs.forEach(function (e, i) {
        var k = (p - howCuts[i]) / (howCuts[i + 1] - howCuts[i]); k = k < 0 ? 0 : k > 1 ? 1 : k;
        var f = $('b', e); if (f) { f.style.width = (k * 100).toFixed(1) + '%'; }
        if (p >= howCuts[i]) { cur = i; }
      });
      showStep(cur);
      enter(howFoot, p, HOW1, HOW1 + 0.08, 14);
    };
    var syncHow = scrubber(function () { return sceneProgress(howScroll, howSticky, howStage); }, applyHow);
    setTimeout(function () { syncHow(true); }, 0);

    // The gluestick's second flight: as the demo page scrolls off, the icon leaves its slot and
    // lands in this page's heading (0: demo still pinned; 1: this page exactly pinned).
    var floater2 = $('#gs-floater2'), seatIcon = $('.how-title .title-icon', howScroll), slotIconSrc = $('#demo-slot .slot-icon');
    if (floater2 && seatIcon && slotIconSrc && demoScroll) {
      var flight2 = function () {
        var pinned = howSticky && getComputedStyle(howSticky).position === 'sticky';
        if (!pinned || reduced) { floater2.style.display = 'none'; seatIcon.style.opacity = ''; slotIconSrc.style.visibility = ''; return; }
        var vh = window.innerHeight, q = 1 - demoScroll.getBoundingClientRect().bottom / vh;
        q = q < 0 ? 0 : q > 1 ? 1 : q;
        if (q <= 0 || q >= 1) {
          floater2.style.display = 'none';
          seatIcon.style.opacity = q >= 1 ? '1' : '0';
          slotIconSrc.style.visibility = q >= 1 ? 'hidden' : '';
          return;
        }
        var a = slotIconSrc.getBoundingClientRect(), b = seatIcon.getBoundingClientRect(), h = howScroll.getBoundingClientRect();
        var k = q * q * (3 - 2 * q);
        var x = a.left + (b.left - a.left) * k, y = (a.top + q * vh) + ((b.top - h.top) - (a.top + q * vh)) * k - 90 * Math.sin(Math.PI * q);
        var w = a.width + (b.width - a.width) * k;
        floater2.style.display = 'block'; floater2.style.width = w.toFixed(1) + 'px';
        floater2.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(-18deg)';
        seatIcon.style.opacity = '0';
        slotIconSrc.style.visibility = 'hidden';
      };
      var f2Tick = false;
      window.addEventListener('scroll', function () { if (f2Tick) { return; } f2Tick = true; requestAnimationFrame(function () { f2Tick = false; flight2(); }); }, { passive: true });
      window.addEventListener('resize', flight2);
      setTimeout(flight2, 0);
    }
  }

})();
