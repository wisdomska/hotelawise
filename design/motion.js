/* Hotel A-Wise motion layer: scroll reveal (enter + leave), stagger, hover micro-interactions, parallax.
   Load in <helmet>: <script src="motion.js" data-mode="full|stagger"></script>
   Rules: ease-out for anything entering, <=300ms for UI feedback, transform/opacity/filter only,
   hover effects gated to fine pointers, everything off under prefers-reduced-motion. */
(function () {
  if (window.__awMotion) return;
  window.__awMotion = true;
  var script = document.currentScript;
  var mode = (script && script.getAttribute('data-mode')) || 'full';
  var EASE = 'cubic-bezier(0.23,1,0.32,1)';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  var css = document.createElement('style');
  css.textContent = [
    '[data-mi-img]{transition:scale 900ms cubic-bezier(0.22,1,0.36,1)}',
    '[data-mi-tag]{transition:rotate 700ms cubic-bezier(0.22,1,0.36,1)}',
    '[data-mi-arrow]{transition:rotate 280ms ' + EASE + ', translate 280ms ' + EASE + '}',
    '[data-mi-ul]{background-image:linear-gradient(currentColor,currentColor);background-repeat:no-repeat;background-position:100% 100%;background-size:0 1px;transition:background-size 300ms ' + EASE + '}',
    '[data-mi-nudge]{transition:translate 220ms ' + EASE + '}',
    '@media (hover:hover) and (pointer:fine){',
    '  [data-mi-card]:hover [data-mi-img]{scale:1.03}',
    '  [data-mi-card]:hover [data-mi-tag]{rotate:-4deg}',
    '  [data-mi-arrow-host]:hover [data-mi-arrow]{rotate:45deg}',
    '  [data-mi-ul]:hover,[data-mi-ul][aria-current="page"]{background-position:0 100%;background-size:100% 1px}',
    '  [data-mi-nudge-host]:hover [data-mi-nudge]{translate:3px 0}',
    '}',
    'a,button{-webkit-tap-highlight-color:transparent}',
    '[data-mi-btn]{transition:transform 160ms ' + EASE + ', translate 220ms ' + EASE + ', box-shadow 240ms ' + EASE + ', filter 220ms ' + EASE + ', background-color 200ms ' + EASE + ', color 200ms ' + EASE + ', border-color 200ms ' + EASE + ', opacity 200ms ' + EASE + ' !important}',
    '[data-mi-icon]{display:inline-block;transition:translate 240ms ' + EASE + ', rotate 300ms ' + EASE + ', scale 240ms ' + EASE + '}',
    '@media (hover:hover) and (pointer:fine){',
    '  [data-mi-btn="fill"]:not(:disabled):hover{translate:0 -1px;filter:brightness(1.07) saturate(1.05);box-shadow:0 8px 20px -10px rgba(0,0,40,0.55)}',
    '  [data-mi-btn="ghost"]:not(:disabled):hover{translate:0 -1px;box-shadow:inset 0 0 0 999px rgba(0,0,99,0.06)}',
    '  [data-mi-btn="ghost-dark"]:not(:disabled):hover{translate:0 -1px;box-shadow:inset 0 0 0 999px rgba(255,255,255,0.12)}',
    '  [data-mi-btn="chip"]:not(:disabled):hover{box-shadow:inset 0 0 0 999px rgba(0,0,99,0.06)}',
    '  [data-mi-btn]:not(:disabled):active{translate:0 0}',
    '  [data-mi-icon-host]:hover [data-mi-icon="right"]{translate:3px 0}',
    '  [data-mi-icon-host]:hover [data-mi-icon="left"]{translate:-3px 0}',
    '  [data-mi-icon-host]:hover [data-mi-icon="diag"]{translate:2px -2px}',
    '  [data-mi-icon-host]:hover [data-mi-icon="down"]{translate:0 2px}',
    '  [data-mi-icon-host]:hover [data-mi-icon="up"]{translate:0 -2px}',
    '}',
    '@media (prefers-reduced-motion:reduce){[data-mi-img],[data-mi-tag],[data-mi-arrow],[data-mi-ul],[data-mi-nudge],[data-mi-btn],[data-mi-icon]{transition:none!important;translate:none!important;rotate:none!important;scale:none!important}}'
  ].join('\n');
  document.head.appendChild(css);

  var ICONS = { '\u2192':'right', '\u2190':'left', '\u2197':'diag', '\u203a':'right', '\u2039':'left', '\u2193':'down', '\u2191':'up' };
  var tagged = new WeakSet();
  function luminance(rgb) { var m = rgb.match(/[\d.]+/g); if (!m) return 1; return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255; }
  function alpha(rgb) { var m = rgb.match(/[\d.]+/g); return !m ? 0 : m.length > 3 ? +m[3] : 1; }
  function tagInteractive() {
    document.querySelectorAll('button, a[href], [role="tab"], [role="switch"]').forEach(function (el) {
      if (tagged.has(el)) return;
      tagged.add(el);
      if (el.hasAttribute('data-mi-card') || el.closest('[role="grid"]') || el.getAttribute('role') === 'option') return;
      var cs = getComputedStyle(el), r = el.getBoundingClientRect();
      var hasBox = parseFloat(cs.borderRadius) > 0 || alpha(cs.backgroundColor) > 0.05 || parseFloat(cs.borderTopWidth) > 0;
      if (!el.hasAttribute('data-mi-btn') && hasBox && r.height >= 26 && r.height <= 72 && cs.display !== 'inline' && el.getAttribute('role') !== 'tab') {
        var a = alpha(cs.backgroundColor), radius = parseFloat(cs.borderRadius);
        var kind = a > 0.5 ? 'fill' : (radius >= 999 && r.height <= 40) ? 'chip' : luminance(cs.color) > 0.6 ? 'ghost-dark' : 'ghost';
        el.setAttribute('data-mi-btn', kind);
      }
      // Only directional icons that sit at the END of a labelled control move (arrows, external links).
      // Leading/decorative icons stay still: no zoom, no spin.
      var icon = null, kindI = null, txt = (el.textContent || '').trim();
      var cands = el.querySelectorAll('aw-icon, [aria-hidden="true"]');
      if (cands.length && txt) {
        var c = cands[cands.length - 1], ct = (c.textContent || '').trim(), nm = (c.getAttribute && c.getAttribute('name')) || '';
        var dir = { arrowright:'right', external:'diag', arrowdown:'down', arrowup:'up' }[nm] || ICONS[ct] || null;
        if (dir && (dir === 'right' || dir === 'diag' || dir === 'down' || dir === 'up') && txt !== ct) {
          var er = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
          if (!cr.width || cr.left > er.left + er.width * 0.45) { icon = c; kindI = dir; }
        }
        if (!icon) { var f = cands[0], ft = (f.textContent || '').trim(), fn = (f.getAttribute && f.getAttribute('name')) || ''; if ((fn === 'arrowleft' || ft === '\u2190' || ft === '\u2039') && txt !== ft) { icon = f; kindI = 'left'; } }
      }
      if (icon && !icon.hasAttribute('data-mi-icon') && !icon.hasAttribute('data-mi-arrow')) { icon.setAttribute('data-mi-icon', kindI); el.setAttribute('data-mi-icon-host', ''); }
    });
  }

  if (reduce.matches) {
    new MutationObserver(function () { requestAnimationFrame(tagInteractive); }).observe(document.documentElement, { childList: true, subtree: true });
    tagInteractive();
    return;
  }

  var BLOCKS = 'main section:not([data-noreveal]) > *:not([data-noreveal]), footer[data-screen-label] > *, [data-reveal]';
  var seen = new WeakSet();

  function hide(el, fromBelow) {
    var y = fromBelow ? 28 : -18;
    if (el.__awItem) { el.style.translate = '0 ' + (fromBelow ? 16 : -10) + 'px'; el.style.filter = 'opacity(0)'; }
    else { el.style.translate = '0 ' + y + 'px'; el.style.opacity = '0'; }
  }
  function show(el) {
    el.style.translate = '0 0';
    if (el.__awItem) el.style.filter = ''; else el.style.opacity = '';
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var el = e.target;
      if (e.isIntersecting) {
        el.style.transitionDelay = (el.__awDelay || 0) + 'ms';
        show(el);
      } else if (el.__awShown) {
        var vh = (e.rootBounds && e.rootBounds.height) || window.innerHeight;
        var rb = e.boundingClientRect;
        if (rb.bottom > 0 && rb.top < vh) return;
        el.style.transitionDelay = '0ms';
        hide(el, rb.top > vh / 2);
      }
      if (e.isIntersecting) el.__awShown = true;
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });

  function register(el, isItem, delay) {
    if (seen.has(el)) return;
    var cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky' || el.offsetParent === null && cs.position !== 'fixed') return;
    seen.add(el);
    el.__awItem = isItem;
    el.__awDelay = delay || 0;
    var t = el.style.transition;
    var add = isItem
      ? 'translate 720ms cubic-bezier(0.22,1,0.36,1), filter 600ms cubic-bezier(0.22,1,0.36,1)'
      : 'translate 680ms ' + EASE + ', opacity 560ms ' + EASE;
    el.style.transition = t ? t + ', ' + add : add;
    hide(el, true);
    io.observe(el);
  }

  function scan() {
    tagInteractive();
    if (mode === 'full') document.querySelectorAll(BLOCKS).forEach(function (el) { register(el, false, 0); });
    document.querySelectorAll('[data-stagger]').forEach(function (parent) {
      var i = 0;
      Array.prototype.forEach.call(parent.children, function (child) {
        if (seen.has(child)) return;
        register(child, true, Math.min(i * 70, 280));
        i++;
      });
    });
    document.querySelectorAll('[data-parallax]').forEach(function (el) {
      if (seen.has(el)) return;
      seen.add(el);
      parallax.push(el);
      if (el.animate) el.animate([{ scale: '1.07' }, { scale: '1' }], { duration: 1800, easing: EASE, fill: 'both' });
    });
  }

  var parallax = [];
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      parallax.forEach(function (el) {
        if (!el.isConnected) return;
        var r = el.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        var k = parseFloat(el.getAttribute('data-parallax')) || 0.12;
        el.style.translate = '0 ' + Math.round(-r.top * k) + 'px';
      });
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; scan(); });
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule); else schedule();
})();
