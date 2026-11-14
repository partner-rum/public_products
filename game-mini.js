/* Мини-сцена игры «Лови купоны» для входов на главной телефона (14.11.2026, выбор Руслана «4 и 2
   вместе»: кружок «Игра» первым в ряду историй и живой значок вместо строки «Есть минута?»).

   Падают зелёные купоны и красные свечи, звезда сама ловит купоны и уходит от свечей — та же
   картинка, что в game.html, в миниатюре. Без звука и текста (кроме «+1» в значке).
   Бережёт телефон: рисует не чаще 30 раз в секунду, стоит, пока холст не виден или вкладка
   скрыта, и останавливается насовсем, когда холст убран со страницы (вкладки главной
   пересоздают вид целиком). При prefers-reduced-motion — один неподвижный кадр.

   Подключение: <canvas data-mini="card|story"> в разметке и window.soMiniAll(корень) после
   вставки — запускает каждый холст один раз. */
(function () {
  "use strict";
  var STAR = [[0, -12], [2.6, -2.6], [12, 0], [2.6, 2.6], [0, 12], [-2.6, 2.6], [-12, 0], [-2.6, -2.6]];
  var RM = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var PRESET = {
    card: { bg: "#22243B", star: 9, every: 0.55, zoom: 1.3, pops: true },
    story: { star: 10, every: 0.55, zoom: 1.25, pops: false, line: false, starBottom: 15 }
  };

  function soMini(cv, o) {
    o = o || {};
    var ctx = cv.getContext && cv.getContext("2d"); if (!ctx) return null;
    var DPR = Math.min(window.devicePixelRatio || 1, 3);
    var W = 0, H = 0, K = 1, items = [], pops = [], star = { x: 0 }, spawnIn = 0.2, last = 0, drawn = 0, run = false, raf = 0, t = 0;
    var io = null, ro = null;

    function size() {
      var r = cv.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false;
      W = r.width; H = r.height; K = Math.min(W, H) / 64 * (o.zoom || 1);
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      if (!star.x) star.x = W / 2;
      return true;
    }
    function sy() { return H - (o.starBottom || 13) * K; }
    function spawn() {
      var m = 9 * K;
      items.push({ c: Math.random() < 0.3, x: m + Math.random() * (W - 2 * m), y: -8 * K,
        v: (H + 16 * K) / (1.7 * (0.9 + Math.random() * 0.2)), ph: Math.random() * 6 });
    }
    function target() {
      var best = null, bd = 1e9, Y = sy(), i;
      for (i = 0; i < items.length; i++) { var it = items[i]; if (it.c || it.y > Y) continue; if (Y - it.y < bd) { bd = Y - it.y; best = it; } }
      var x = best ? best.x : W / 2;
      for (i = 0; i < items.length; i++) {         // свеча вот-вот на линии звезды — в сторону
        var c = items[i]; if (!c.c) continue;
        if (Math.abs(Y - c.y) < 34 * K && Math.abs(c.x - x) < 14 * K) x = c.x + (c.x > W / 2 ? -1 : 1) * 22 * K;
      }
      return Math.max(10 * K, Math.min(W - 10 * K, x));
    }
    function step(dt) {
      t += dt;
      spawnIn -= dt; if (spawnIn <= 0) { spawn(); spawnIn = (o.every || 0.55) * (0.75 + Math.random() * 0.5); }
      star.x += (target() - star.x) * (1 - Math.exp(-dt * 7));
      var Y = sy();
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i]; it.y += it.v * dt; it.ph += dt * 4;
        if (!it.c && Math.abs(it.y - Y) < 8 * K && Math.abs(it.x - star.x) < 10 * K) { items.splice(i, 1); if (o.pops) pops.push({ x: it.x, y: Y, life: 0.6 }); continue; }
        if (it.y > H + 12 * K) items.splice(i, 1);
      }
      for (var p = pops.length - 1; p >= 0; p--) { pops[p].life -= dt; if (pops[p].life <= 0) pops.splice(p, 1); }
    }
    function draw() {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H); }
      ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;   // сетка графика
      var st = 14 * K, off = (t * 10 * K) % st, y, i;
      ctx.beginPath();
      for (y = off - st; y < H; y += st) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
      ctx.stroke();
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.c) {
          var w = 4.2 * K, h = 9 * K;
          ctx.strokeStyle = "#E0705A"; ctx.lineWidth = Math.max(1, 1.1 * K);
          ctx.beginPath(); ctx.moveTo(it.x, it.y - h / 2 - 2.5 * K); ctx.lineTo(it.x, it.y + h / 2 + 2.5 * K); ctx.stroke();
          ctx.fillStyle = "#E0705A"; ctx.fillRect(it.x - w / 2, it.y - h / 2, w, h);
        } else {
          var sx = 0.55 + 0.45 * Math.abs(Math.cos(it.ph)), r = 5.2 * K;
          ctx.save(); ctx.translate(it.x, it.y); ctx.scale(sx, 1);
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fillStyle = "#55C08A"; ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, 6.283); ctx.strokeStyle = "rgba(25,26,47,.32)"; ctx.lineWidth = Math.max(0.8, r * 0.14); ctx.stroke();
          ctx.restore();
        }
      }
      if (o.line !== false) {
        ctx.save(); ctx.setLineDash([2 * K, 4 * K]); ctx.strokeStyle = "rgba(242,243,247,.16)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, Math.round(sy()) + 0.5); ctx.lineTo(W, Math.round(sy()) + 0.5); ctx.stroke(); ctx.restore();
      }
      var k = (o.star || 7.5) * K / 12;
      ctx.save(); ctx.translate(star.x, sy()); ctx.beginPath();
      for (i = 0; i < STAR.length; i++) { var px = STAR[i][0] * k, py = STAR[i][1] * k; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fillStyle = "#F06E08"; ctx.fill(); ctx.restore();
      if (o.pops) {
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "600 " + Math.round(9 * K) + "px Montserrat, sans-serif";
        for (i = 0; i < pops.length; i++) { var p = pops[i]; ctx.globalAlpha = Math.min(1, p.life / 0.3); ctx.fillStyle = "#74D0A2"; ctx.fillText("+1", p.x, p.y - (0.6 - p.life) * 22 * K - 10 * K); }
        ctx.globalAlpha = 1;
      }
    }
    var vis = true;
    function onVis() { if (document.hidden || !vis) stop(); else if (cv.isConnected) play(); }
    function kill() { stop(); if (io) io.disconnect(); if (ro) ro.disconnect(); document.removeEventListener("visibilitychange", onVis); }
    function frame(ts) {
      raf = 0; if (!run) return;
      if (!cv.isConnected) { kill(); return; }                    // вид главной пересоздан — этот холст больше не нужен
      if (last && ts - drawn < 30) { raf = requestAnimationFrame(frame); return; }   // ~30 кадров в секунду хватает
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts; drawn = ts;
      step(dt); draw(); raf = requestAnimationFrame(frame);
    }
    function play() { if (run || RM) return; run = true; last = 0; raf = requestAnimationFrame(frame); }
    function stop() { run = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    if (!size()) { // холст ещё без размеров (вид скрыт) — запустимся, когда появятся
      if (window.ResizeObserver) { ro = new ResizeObserver(function () { if (size()) { ro.disconnect(); ro = null; start(); } }); ro.observe(cv); }
      return { stop: stop, play: play };
    }
    start();
    function start() {
      for (var w = 0; w < 40; w++) step(0.05);                 // первый кадр — уже со сценой, а не пустой
      draw();
      if (window.IntersectionObserver) {
        io = new IntersectionObserver(function (e) { vis = e[e.length - 1].isIntersecting; if (vis && !document.hidden) play(); else stop(); });
        io.observe(cv);
      }
      document.addEventListener("visibilitychange", onVis);
      if (window.ResizeObserver && !ro) { ro = new ResizeObserver(function () { if (size()) draw(); }); ro.observe(cv); }
      play();
    }
    return { stop: stop, play: play };
  }

  window.soMini = soMini;
  window.soMiniAll = function (root) {
    var list = (root || document).querySelectorAll("canvas[data-mini]");
    for (var i = 0; i < list.length; i++) {
      var cv = list[i]; if (cv.__mini) continue;
      cv.__mini = soMini(cv, PRESET[cv.getAttribute("data-mini")] || PRESET.card) || true;
    }
  };
})();
