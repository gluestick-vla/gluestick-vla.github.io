/* ==========================================================================
   Minimal SVG bar charts for the GLUESTICK page (no dependencies).
   Every chart is fed exact numbers from the paper's tables / figures and has a
   table twin in the HTML. Marks: <=24px bars, one baseline axis, no gridlines,
   hover/focus tooltip, selective direct labels. Each chart renders at its
   container's width and re-renders (same cfg) when that width changes.

   API: Viz.bars(container, cfg) / Viz.hbars(container, cfg) / Viz.rerender()
   ========================================================================== */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var BG = 'var(--bg, #0E0E10)';                  // hollow bar fill
  var FONT = { tick: 12, cat: 13, value: 12 };    // px; minimum sizes of the design spec (CSS may override)
  var CHAR = 0.56;                                // average glyph width / font size, used only for layout estimates
  var LINE = 15;                                  // line height of wrapped category labels

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) { if (attrs.hasOwnProperty(k)) { e.setAttribute(k, attrs[k]); } }
    if (parent) { parent.appendChild(e); }
    return e;
  }
  function html(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    if (parent) { parent.appendChild(e); }
    return e;
  }
  function textWidth(str, size) { return String(str).length * size * CHAR; }
  function fmt(v, cfg) {
    if (cfg.format) { return cfg.format(v); }
    var s = (cfg.decimals != null) ? v.toFixed(cfg.decimals) : String(v);
    if (cfg.signed && v >= 0) { s = '+' + s; }
    return s + (cfg.unit || '');
  }
  function fmtTick(v) {
    var s = String(Math.round(v * 100) / 100);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function niceStep(range, target) {
    if (range <= 0) { return 1; }
    var raw = range / target, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norms = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < norms.length; i++) { if (norms[i] * mag >= raw) { return norms[i] * mag; } }
    return 10 * mag;
  }
  // Split a category label into lines that fit maxW (explicit "\n" is kept).
  function wrapLabel(label, maxW, size) {
    var out = [];
    String(label).split('\n').forEach(function (ln) {
      var words = ln.split(' '), cur = '';
      words.forEach(function (w) {
        var next = cur ? cur + ' ' + w : w;
        if (cur && textWidth(next, size) > maxW) { out.push(cur); cur = w; } else { cur = next; }
      });
      if (cur) { out.push(cur); }
    });
    return out;
  }

  // ---- tooltip -------------------------------------------------------------
  var tip = null;
  function tooltip() {
    if (!tip) { tip = html('div', 'tooltip', document.body); tip.setAttribute('role', 'status'); }
    return tip;
  }
  function showTip(x, y, value, series, cat, color) {
    var t = tooltip();
    t.innerHTML = '';
    html('b', null, t, value);
    var row = html('span', null, t);
    var key = html('i', 'k', row); key.style.background = color;
    row.appendChild(document.createTextNode(series + (cat ? ', ' + cat : '')));
    t.style.left = x + 'px'; t.style.top = y + 'px';
    t.classList.add('show');
  }
  function hideTip() { if (tip) { tip.classList.remove('show'); } }
  function attachHover(target, getText) {
    var onMove = function (e) {
      var r = target.getBoundingClientRect();
      var info = getText();
      var x = (e && e.clientX != null) ? e.clientX : r.left + r.width / 2;
      var y = (e && e.clientY != null) ? Math.min(e.clientY, r.top + r.height) : r.top;
      showTip(x, y - 6, info.value, info.series, info.cat, info.color);
    };
    target.addEventListener('pointerenter', onMove);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerleave', hideTip);
    target.addEventListener('focus', function () { onMove(null); });
    target.addEventListener('blur', hideTip);
  }

  // ---- responsive registry -------------------------------------------------
  // Each container keeps its cfg; when its width changes (window resize, a
  // <details> opening, column reflow) the chart is drawn again with that cfg.
  var registry = [], timer = null, ro = null;
  function contentWidth(node) {
    var w = node.clientWidth || 0;
    if (w && global.getComputedStyle) {
      var cs = global.getComputedStyle(node);
      w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    }
    return w;
  }
  function renderWidth(container, cfg) {
    var w = contentWidth(container);
    if (!w) { w = 640; }                                 // hidden (e.g. closed <details>): provisional width
    if (cfg.width && cfg.width < w) { w = cfg.width; }   // cfg.width is only a maximum
    return Math.max(240, Math.round(w));
  }
  function draw(container) {
    var s = container._viz;
    if (!s) { return null; }
    var svg = s.kind === 'hbars' ? drawHBars(container, s.cfg) : drawBars(container, s.cfg);
    s.w = contentWidth(container);
    if (typeof s.cfg.after === 'function') { s.cfg.after(container, svg); }
    return svg;
  }
  function rerenderAll() {
    for (var i = 0; i < registry.length; i++) {
      var c = registry[i], s = c._viz;
      if (s && contentWidth(c) > 0 && contentWidth(c) !== s.w) { draw(c); }
    }
  }
  function scheduleRerender() { clearTimeout(timer); timer = setTimeout(rerenderAll, 150); }
  function watch(container) {
    if ('ResizeObserver' in global) {
      if (!ro) { ro = new global.ResizeObserver(scheduleRerender); }
      ro.observe(container);
    } else if (registry.length === 1) {
      global.addEventListener('resize', scheduleRerender);
      document.addEventListener('toggle', scheduleRerender, true);   // <details> opening (capture: toggle does not bubble)
    }
  }
  function mount(container, kind, cfg) {
    if (!container || !cfg) { return null; }
    container._viz = { kind: kind, cfg: cfg, w: 0 };
    if (registry.indexOf(container) < 0) { registry.push(container); watch(container); }
    return draw(container);
  }

  function legend(container, series) {
    var lg = html('div', 'legend', container);
    series.forEach(function (s) {
      var sp = html('span', null, lg);
      var sw = html('i', s.hollow ? 'hollow' : null, sp);
      sw.style.color = s.color;
      if (s.hollow) { sw.style.background = BG; sw.style.boxShadow = 'inset 0 0 0 1.5px ' + s.color; }
      else { sw.style.background = s.color; }
      sp.appendChild(document.createTextNode(s.name));
    });
    return lg;
  }
  function svgRoot(container, W, H, cfg) {
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' }, container);
    svg.style.display = 'block'; svg.style.width = '100%'; svg.style.maxWidth = W + 'px'; svg.style.height = 'auto'; svg.style.overflow = 'visible';
    if (cfg.aria) { svg.setAttribute('aria-label', cfg.aria); }
    return svg;
  }
  function barPath(parent, d, color, hollow) {
    var p = el('path', { d: d, fill: hollow ? BG : color, 'class': hollow ? 'bar hollow' : 'bar' }, parent);
    if (hollow) { p.setAttribute('stroke', color); p.setAttribute('stroke-width', '1.5'); }
    return p;
  }

  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + ' V' + (y + r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) +
      ' H' + (x + w - r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + ' V' + (y + h) + ' Z';
  }
  function roundedBottom(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + y + ' V' + (y + h - r) + ' a' + r + ',' + r + ' 0 0 0 ' + r + ',' + r +
      ' H' + (x + w - r) + ' a' + r + ',' + r + ' 0 0 0 ' + r + ',' + (-r) + ' V' + y + ' Z';
  }
  function roundedLeft(x, y, w, h, r) {   // bar growing leftwards from x+w, rounded on its left end
    r = Math.min(r, w / 2, h / 2);
    return 'M' + (x + w) + ' ' + y + ' H' + (x + r) + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) +
      ' V' + (y + h - r) + ' Q' + x + ' ' + (y + h) + ' ' + (x + r) + ' ' + (y + h) + ' H' + (x + w) + ' Z';
  }

  function roundedRight(x, y, w, h, r) {
    r = Math.min(r, h / 2, w);
    return 'M' + x + ',' + y + ' H' + (x + w - r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
      ' V' + (y + h - r) + ' a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + ' H' + x + ' Z';
  }

  // ---- vertical (grouped) bars --------------------------------------------
  // cfg: categories[], series[{ name, color, values[], hollow, colors[], hollows[],
  //      label, labelIndex[], emphasis }], unit, decimals, signed, format,
  //      yMin, yMax, height, width(max), marginLeft/Top/Bottom, barWidth,
  //      labelAll, legend(false), yLabel, tickUnit, aria, after(container, svg)
  function drawBars(container, cfg) {
    container.innerHTML = '';
    container.classList.add('viz');
    var W = renderWidth(container, cfg), H = cfg.height || 280;
    var mL = cfg.marginLeft || 44, mR = 8, mT = cfg.marginTop || 20;
    var cats = cfg.categories, ser = cfg.series;
    var vals = [0];
    ser.forEach(function (s) { s.values.forEach(function (v) { if (typeof v === 'number') { vals.push(v); } }); });
    var vmax = Math.max.apply(null, vals), vmin = Math.min.apply(null, vals);
    var step = niceStep((vmax - vmin) || 1, 4);
    var top = cfg.yMax != null ? cfg.yMax : (vmax > 0 ? Math.ceil((vmax * 1.14) / step) * step : 0);
    var bot = cfg.yMin != null ? cfg.yMin : (vmin < 0 ? Math.floor((vmin * 1.18) / step) * step : 0);
    if (top === bot) { top = bot + step; }
    var plotW = W - mL - mR;

    // Category labels: wrap to the group width, then size the bottom margin to fit.
    var nC = cats.length, nS = ser.length, groupW = plotW / nC;
    var catLines = cats.map(function (c) { return wrapLabel(c, Math.max(groupW - 4, 30), FONT.cat); });
    var maxLines = 1;
    catLines.forEach(function (l) { if (l.length > maxLines) { maxLines = l.length; } });
    var mB = Math.max(cfg.marginBottom || 32, 20 + (maxLines - 1) * LINE + 4);
    var plotH = H - mT - mB;
    var y = function (v) { return mT + plotH * (1 - (v - bot) / (top - bot)); };

    if (ser.length > 1 && cfg.legend !== false) { legend(container, ser); }
    var svg = svgRoot(container, W, H, cfg);

    var ticks = el('g', { 'class': 'tick', 'font-size': FONT.tick }, svg);
    for (var v = bot; v <= top + 1e-9; v += step) {
      var t = el('text', { x: mL - 8, y: y(v) + 4, 'text-anchor': 'end' }, ticks);
      t.textContent = fmtTick(v) + (cfg.tickUnit || '');
    }
    var axis = el('g', { 'class': 'axis' }, svg);
    el('line', { x1: mL, x2: W - mR, y1: y(0), y2: y(0) }, axis);
    if (cfg.yLabel) {
      var yl = el('text', { x: 12, y: mT + plotH / 2, transform: 'rotate(-90 12 ' + (mT + plotH / 2) + ')', 'text-anchor': 'middle', 'class': 'ylab' }, ticks);
      yl.textContent = cfg.yLabel;
    }

    // Bar sizing. When more than one series carries direct labels, widen the
    // gap between bars so neighbouring labels cannot collide.
    var gap = 2;
    var barW = Math.min(cfg.barWidth || 24, (groupW * 0.74 - gap * (nS - 1)) / nS);
    var labelled = ser.filter(function (s) { return cfg.labelAll || s.label; }).length;
    if (labelled > 1) {
      var estW = 0;
      ser.forEach(function (s) {
        s.values.forEach(function (val) {
          estW = Math.max(estW, textWidth(typeof val === 'number' ? fmt(val, cfg) : String(val), FONT.value));
        });
      });
      gap = Math.max(gap, Math.round(estW + 4 - barW));
      barW = Math.max(6, Math.min(barW, (groupW * 0.86 - gap * (nS - 1)) / nS));
    }
    var totalW = nS * barW + gap * (nS - 1);
    var marks = el('g', null, svg), labels = el('g', { 'font-size': FONT.value }, svg), hits = el('g', null, svg);

    cats.forEach(function (cat, ci) {
      var gx = mL + groupW * ci + (groupW - totalW) / 2;
      ser.forEach(function (s, si) {
        var v = s.values[ci], x = gx + si * (barW + gap);
        var color = (s.colors && s.colors[ci]) || s.color;
        var hollow = s.hollows ? !!s.hollows[ci] : !!s.hollow;
        var y0 = y(0);
        if (typeof v !== 'number') {
          if (v != null) {
            var na = el('text', { x: x + barW / 2, y: y0 - 8, 'text-anchor': 'middle', 'class': 'vlabel muted' }, labels);
            na.textContent = String(v);
          }
          return;
        }
        var y1 = y(v), h = Math.abs(y1 - y0), r = 3;
        if (h > 0.5) {
          barPath(marks, v >= 0 ? roundedTop(x, y1, barW, h, r) : roundedBottom(x, y0, barW, h, r), color, hollow);
        }
        var doLabel = cfg.labelAll || s.label || (s.labelIndex && s.labelIndex.indexOf(ci) >= 0);
        if (doLabel) {
          var tx = el('text', { x: x + barW / 2, y: v >= 0 ? y1 - 6 : y1 + 14, 'text-anchor': 'middle', 'class': 'vlabel' + (s.emphasis ? '' : ' muted') }, labels);
          tx.textContent = fmt(v, cfg);
        }
        var hit = el('rect', { x: x - gap / 2, y: mT, width: barW + gap, height: plotH, fill: 'transparent', tabindex: 0, 'class': 'hit' }, hits);
        hit.setAttribute('aria-label', s.name + ', ' + String(cat).replace(/\n/g, ' ') + ': ' + fmt(v, cfg));
        attachHover(hit, function () { return { value: fmt(v, cfg), series: s.name, cat: String(cat).replace(/\n/g, ' '), color: color }; });
      });
    });

    var cl = el('g', { 'class': 'cat', 'font-size': FONT.cat }, svg);
    cats.forEach(function (cat, ci) {
      var cx = mL + groupW * ci + groupW / 2;
      var t = el('text', { x: cx, y: H - mB + 18, 'text-anchor': 'middle' }, cl);
      catLines[ci].forEach(function (ln, li) {
        var ts = el('tspan', { x: cx, dy: li === 0 ? 0 : LINE }, t); ts.textContent = ln;
      });
    });
    return svg;
  }

  // ---- horizontal bars (rows) ---------------------------------------------
  // cfg: rows[{ label, value|null, na, color, hollow, series, note, emphasis }],
  //      groups[{ at, label }], unit, decimals, signed, format, max, rowH,
  //      width(max), labelWidth, marginRight, xLabel, legendSeries[], compact,
  //      aria, after(container, svg)
  // Narrow containers switch to a compact layout: label and value on one line
  // above a full-width bar.
  function drawHBars(container, cfg) {
    container.innerHTML = '';
    container.classList.add('viz');
    var W = renderWidth(container, cfg);
    var rows = cfg.rows, groups = cfg.groups || [];
    var mL = cfg.labelWidth || 150, mR = cfg.marginRight || 120;
    var compact = cfg.compact != null ? !!cfg.compact : (W - mL - mR < 200);
    var rowH = cfg.rowH || 30, lineH = 18, bh;
    if (compact) { mL = 0; mR = 0; bh = 12; rowH = lineH + bh + 10; } else { bh = Math.min(20, rowH - 8); }
    var mT = 8, mB = cfg.xLabel ? 38 : 22, groupH = 26;
    var H = mT + rows.length * rowH + groups.length * groupH + mB;
    var vals = [0];
    rows.forEach(function (r) { if (typeof r.value === 'number') { vals.push(r.value); } });
    var vmax = cfg.max != null ? cfg.max : Math.max.apply(null, vals);
    var vmin = cfg.min != null ? cfg.min : Math.min(0, Math.min.apply(null, vals));
    var step = niceStep((vmax - vmin) || 1, 4);
    var top = cfg.max != null ? cfg.max : Math.ceil((vmax * 1.05) / step) * step;
    var bottom = cfg.min != null ? cfg.min : (vmin < 0 ? Math.floor((vmin * 1.05) / step) * step : 0);
    var plotW = W - mL - mR;
    var x = function (v) { return mL + plotW * ((v - bottom) / (top - bottom)); };
    var labelLeft = cfg.labelAlign === 'left';

    if (cfg.legendSeries && cfg.legendSeries.length > 1) { legend(container, cfg.legendSeries); }
    var svg = svgRoot(container, W, H, cfg);
    var ticks = el('g', { 'class': 'tick', 'font-size': FONT.tick }, svg);
    for (var v = Math.ceil(bottom / step - 1e-9) * step; v <= top + 1e-9; v += step) {
      var tx = x(v), anchor = tx < 12 ? 'start' : (tx > W - 12 ? 'end' : 'middle');
      var t = el('text', { x: tx, y: H - mB + 16, 'text-anchor': anchor }, ticks);
      t.textContent = fmtTick(v);
    }
    if (cfg.xLabel) { var xl = el('text', { x: mL + plotW / 2, y: H - 4, 'text-anchor': 'middle' }, ticks); xl.textContent = cfg.xLabel; }
    el('line', { x1: x(0), x2: x(0), y1: mT, y2: H - mB + 4 }, el('g', { 'class': 'axis' }, svg));

    var marks = el('g', null, svg), labels = el('g', { 'font-size': FONT.value }, svg);
    var cat = el('g', { 'class': 'cat', 'font-size': FONT.cat }, svg), hits = el('g', null, svg);
    var yCur = mT, gi = 0;
    rows.forEach(function (r, ri) {
      if (groups[gi] && groups[gi].at === ri) {
        var gt = el('text', { x: 0, y: yCur + 16, 'class': 'grp' }, cat);
        gt.textContent = groups[gi].label; gt.style.fontWeight = '500';
        yCur += groupH; gi++;
      }
      var hasV = typeof r.value === 'number';
      var valueText = hasV ? fmt(r.value, cfg) : (r.na || 'n/a');
      var inline = hasV ? valueText + (r.note ? '  ' + r.note : '') : valueText;
      var spoken = hasV ? valueText + (r.note ? ', ' + r.note : '') : valueText;
      var lab, vt, by, cy;
      if (compact) {
        var labY = yCur + 13; by = yCur + lineH + 2; cy = by + bh / 2;
        lab = el('text', { x: 0, y: labY }, cat);
        vt = el('text', { x: W, y: labY, 'text-anchor': 'end', 'class': 'vlabel' + (hasV && r.emphasis ? '' : ' muted') }, labels);
      } else {
        cy = yCur + rowH / 2; by = cy - bh / 2;
        lab = el('text', { x: labelLeft ? 12 : mL - 10, y: cy + 4, 'text-anchor': labelLeft ? 'start' : 'end' }, cat);
        var neg = hasV && r.value < 0;
        vt = el('text', { x: (hasV ? x(r.value) : x(0)) + (neg ? -8 : 8), y: cy + 4, 'text-anchor': neg ? 'end' : 'start', 'class': 'vlabel' + (hasV && r.emphasis ? '' : ' muted') }, labels);
      }
      lab.textContent = r.label;
      vt.textContent = inline;
      if (!hasV) { vt.style.fontStyle = 'italic'; }
      if (hasV) {
        var w = x(r.value) - x(0);
        if (w > 0.5) { barPath(marks, roundedRight(x(0), by, w, bh, 3), r.color, !!r.hollow); }
        else if (w < -0.5) { barPath(marks, roundedLeft(x(r.value), by, -w, bh, 3), r.color, !!r.hollow); }
      }
      var hit = el('rect', { x: mL, y: yCur, width: W - mL, height: rowH, fill: 'transparent', tabindex: 0, 'class': 'hit' }, hits);
      hit.setAttribute('aria-label', r.label + ': ' + spoken);
      attachHover(hit, function () { return { value: spoken, series: r.series || r.label, cat: r.series ? r.label : '', color: r.color }; });
      yCur += rowH;
    });
    return svg;
  }

  global.Viz = {
    bars: function (container, cfg) { return mount(container, 'bars', cfg); },
    hbars: function (container, cfg) { return mount(container, 'hbars', cfg); },
    rerender: rerenderAll
  };
})(window);
