(function () {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.documentElement.classList.add('motion-ready');

  const revealItems = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduced.matches) {
    const revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }, { threshold: 0.14, rootMargin: '0px 0px -35px 0px' });
    revealItems.forEach((item, index) => {
      item.style.setProperty('--reveal-delay', Math.min(index % 4, 3) * 75 + 'ms');
      revealObserver.observe(item);
    });
  } else revealItems.forEach(item => item.classList.add('is-visible'));

  const stage = document.querySelector('[data-tilt-stage]');
  const card = stage && stage.querySelector('[data-tilt]');
  const pointerFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!stage || !card || reduced.matches || !pointerFine.matches) return;
  let frame = 0, targetX = -4, targetY = -10;
  const paint = () => {
    frame = 0;
    card.style.setProperty('--tilt-x', targetX.toFixed(2) + 'deg');
    card.style.setProperty('--tilt-y', targetY.toFixed(2) + 'deg');
  };
  stage.addEventListener('pointermove', event => {
    const rect = stage.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    targetX = -4 + ny * -8;
    targetY = -10 + nx * 12;
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });
  stage.addEventListener('pointerleave', () => {
    targetX = -4; targetY = -10;
    if (!frame) frame = requestAnimationFrame(paint);
  });
})();
