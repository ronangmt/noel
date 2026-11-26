// Flocons de neige qui tombent (canvas léger, ne bloque pas les clics)
export function startSnow(button) {
  const canvas = document.createElement('canvas');
  canvas.id = 'snow';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saved = localStorage.getItem('snow');
  let enabled = saved ? saved === 'on' : !reduceMotion;
  let flakes = [];
  let w = 0, h = 0, raf = null;

  function makeFlake(anywhere) {
    const r = Math.random() * 2.6 + 0.8;
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -10,
      r,
      vy: (Math.random() * 0.6 + 0.5) * (r / 1.6),
      vx: Math.random() * 0.4 - 0.2,
      phase: Math.random() * Math.PI * 2,
      alpha: Math.random() * 0.5 + 0.45,
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(Math.min(150, (w * h) / 9000));
    while (flakes.length < target) flakes.push(makeFlake(true));
    flakes.length = target;
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    for (const f of flakes) {
      f.phase += 0.012;
      f.y += f.vy;
      f.x += f.vx + Math.sin(f.phase) * 0.35;
      if (f.y > h + 10) Object.assign(f, makeFlake(false));
      if (f.x > w + 10) f.x = -10;
      if (f.x < -10) f.x = w + 10;
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf) return;
    canvas.style.display = '';
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    ctx.clearRect(0, 0, w, h);
    canvas.style.display = 'none';
  }
  function updateButton() {
    if (button) {
      button.classList.toggle('off', !enabled);
      button.setAttribute('aria-pressed', String(enabled));
    }
  }

  window.addEventListener('resize', resize);
  resize();
  enabled ? start() : stop();
  updateButton();

  if (button) {
    button.addEventListener('click', () => {
      enabled = !enabled;
      localStorage.setItem('snow', enabled ? 'on' : 'off');
      enabled ? start() : stop();
      updateButton();
    });
  }
}
