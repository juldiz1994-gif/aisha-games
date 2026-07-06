// ══════════════════════════════════
// script.js — Айшаның AI Студиясы
// ══════════════════════════════════

// ─── THEME: күн/түн автоматты ───
(function () {
  const html = document.documentElement;
  const btn  = document.getElementById('themeBtn');
  function isDay() { const h = new Date().getHours(); return h >= 7 && h < 20; }
  function applyTheme(dark, save) {
    html.dataset.theme = dark ? 'dark' : 'light';
    if (btn) btn.textContent = dark ? '☀️' : '🌙';
    if (save) localStorage.setItem('aisha_theme', dark ? 'dark' : 'light');
  }
  const saved = localStorage.getItem('aisha_theme');
  applyTheme(saved ? saved === 'dark' : !isDay());
  let userOverride = !!saved;
  if (btn) btn.addEventListener('click', () => {
    userOverride = true;
    applyTheme(html.dataset.theme !== 'dark', true);
  });
  setInterval(() => { if (!userOverride) applyTheme(!isDay()); }, 60000);
})();

// ─── NAVBAR: scroll эффекті ───
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
});

// ─── MOBILE MENU ───
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const mobileClose = document.getElementById('mobileClose');

hamburger.addEventListener('click', () => mobileMenu.classList.add('open'));
mobileClose.addEventListener('click', () => mobileMenu.classList.remove('open'));

function closeMob() {
  mobileMenu.classList.remove('open');
}

// ─── LOGIN BAG FORM — Тайпинг анимациясы ───
(function () {
  const typedEl  = document.getElementById('afTyped');
  const cursorEl = document.getElementById('afCursor');
  if (!typedEl) return;

  const text = 'The CodingWizard';
  let i = 0;
  let started = false;

  function startTyping() {
    if (started) return;
    started = true;
    setTimeout(function type() {
      if (i <= text.length) {
        typedEl.textContent = text.slice(0, i++);
        setTimeout(type, 85);
      } else {
        setTimeout(() => { if (cursorEl) cursorEl.style.display = 'none'; }, 1800);
      }
    }, 2400);
  }

  const scene = document.getElementById('animScene');
  if (scene) {
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { startTyping(); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(scene);
  }
})();

// ─── REVEAL ANIMATIONS (Intersection Observer) ───
// Беттік элементтер экранға кіргенде fade-in + slide-up болады
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.1 }
);

// Барлық .reveal класы бар элементтерді бақылаймыз
document.querySelectorAll('.reveal').forEach((el) => {
  revealObserver.observe(el);
});

// ─── SMOOTH SCROLL ───
// Барлық якорь сілтемелері үшін жұмсақ айналу
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ─── CONTACT FORM SUBMIT ───
const contactForm = document.getElementById('contactForm');
const submitBtn   = document.getElementById('submitBtn');
const formSuccess = document.getElementById('formSuccess');

if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // Жіберу анимациясы
    submitBtn.textContent = 'Жіберілуде...';
    submitBtn.disabled = true;

    // Имитация отправки (1.2 секунда)
    setTimeout(() => {
      submitBtn.textContent = 'Жіберілді ✓';
      formSuccess.style.display = 'block';
      contactForm.reset();

      // 5 секунда кейін қалпына келтіру
      setTimeout(() => {
        submitBtn.textContent = 'Хабарлама жіберу →';
        submitBtn.disabled = false;
        formSuccess.style.display = 'none';
      }, 5000);
    }, 1200);
  });
}

// ─── HOVER: Service cards — дополнительный эффект ───
document.querySelectorAll('.service-card').forEach((card) => {
  card.addEventListener('mousemove', (e) => {
    const rect  = card.getBoundingClientRect();
    const x     = e.clientX - rect.left;
    const y     = e.clientY - rect.top;
    const cx    = rect.width  / 2;
    const cy    = rect.height / 2;
    const rotX  = ((y - cy) / cy) * 3;
    const rotY  = ((x - cx) / cx) * -3;
    card.style.transform = `translateY(-8px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

// ─── SCRATCH REVEAL (hero photo) ───
(function () {
  const canvas  = document.getElementById('photoScratch');
  const hintEl  = document.getElementById('scratchHint');
  if (!canvas) return;

  const frame   = canvas.closest('.photo-frame');
  const ctx     = canvas.getContext('2d');
  let   moved   = false;

  function initCanvas() {
    const rect    = frame.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
    ctx.globalCompositeOperation = 'source-over';
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0,   '#C8960C');
    grad.addColorStop(0.5, '#D4AF37');
    grad.addColorStop(1,   '#B07D0A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function erase(x, y) {
    ctx.globalCompositeOperation = 'destination-out';
    const r   = Math.min(canvas.width, canvas.height) * 0.18;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0,   'rgba(0,0,0,1)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.85)');
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function toLocal(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  canvas.addEventListener('mousemove', e => {
    if (!moved) { moved = true; hintEl.classList.add('hide'); }
    const p = toLocal(e.clientX, e.clientY);
    erase(p.x, p.y);
  });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!moved) { moved = true; hintEl.classList.add('hide'); }
    const t = e.touches[0];
    const p = toLocal(t.clientX, t.clientY);
    erase(p.x, p.y);
  }, { passive: false });

  // Беттің жүктелуін күту
  if (document.readyState === 'complete') {
    initCanvas();
  } else {
    window.addEventListener('load', initCanvas);
  }
  window.addEventListener('resize', initCanvas);
}());

