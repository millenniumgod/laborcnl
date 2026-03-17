/* ── script.js ── */

// ── Navbar scroll effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ── Active nav link on scroll
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

const observerOptions = {
  root: null,
  rootMargin: '-40% 0px -40% 0px',
  threshold: 0
};

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + entry.target.id) {
          link.classList.add('active');
        }
      });
    }
  });
}, observerOptions);

sections.forEach(section => sectionObserver.observe(section));

// ── Mobile hamburger menu
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});

// Close mobile menu on link click
document.querySelectorAll('.mob-link').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
  });
});

// ── Scroll-reveal for sections
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(
  '.about-card, .service-card, .lmaster-reason, .plan-card, .column-card, .client-logo'
).forEach(el => {
  el.classList.add('reveal-target');
  revealObserver.observe(el);
});

// Add CSS for reveal animation
const style = document.createElement('style');
style.textContent = `
  .reveal-target {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .reveal-target.revealed {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(style);

// ── Staggered reveal for grids
function staggerReveal(parentSelector, childSelector, delay = 80) {
  const parents = document.querySelectorAll(parentSelector);
  parents.forEach(parent => {
    const children = parent.querySelectorAll(childSelector);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          children.forEach((child, i) => {
            setTimeout(() => {
              child.classList.add('revealed');
            }, i * delay);
          });
          observer.disconnect();
        }
      });
    }, { threshold: 0.05 });
    observer.observe(parent);
  });
}

staggerReveal('.service-grid', '.service-card', 80);
staggerReveal('.about-visual', '.about-card', 100);
staggerReveal('.lmaster-reasons', '.lmaster-reason', 100);
staggerReveal('.plan-grid', '.plan-card', 100);

// ── Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 68; // navbar height
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ── Contact form handler
function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.textContent = '전송 중...';
  btn.disabled = true;

  setTimeout(() => {
    btn.textContent = '✓ 문의가 접수되었습니다';
    btn.style.background = '#27ae60';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = '';
      btn.disabled = false;
      e.target.reset();
    }, 3000);
  }, 1000);
}

// ── Counter animation for stats
function animateCounter(el, target, duration = 1500) {
  let start = 0;
  const step = (timestamp) => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target) + (el.dataset.suffix || '');
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const nums = entry.target.querySelectorAll('.stat-num');
      nums.forEach(num => {
        const raw = num.textContent;
        const value = parseInt(raw);
        const suffix = raw.replace(/[0-9]/g, '');
        num.dataset.suffix = suffix;
        animateCounter(num, value);
      });
      statsObserver.disconnect();
    }
  });
}, { threshold: 0.3 });

const statsSection = document.querySelector('.about-stats');
if (statsSection) statsObserver.observe(statsSection);
