(function () {
  const toggle = document.querySelector('#navToggle');
  const links = document.querySelector('#navLinks');
  if (toggle && links) toggle.addEventListener('click', function () {
    const open = links.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('#navLinks a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function () { links.classList.remove('open'); toggle?.setAttribute('aria-expanded', 'false'); });
  });
})();
