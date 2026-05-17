(() => {
  const BODY_CLASS = 'smarttaxi-map-focus';

  function ensureButton(className, text, onClick) {
    let button = document.querySelector('.' + className);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = text;
      button.addEventListener('click', onClick);
      document.body.appendChild(button);
    }
    return button;
  }

  function isClientRoute() {
    return location.pathname === '/client' || location.pathname.startsWith('/client/');
  }

  function setup() {
    if (!isClientRoute()) return;
    ensureButton('map-focus-btn', 'Карта', () => document.body.classList.add(BODY_CLASS));
    ensureButton('map-focus-close', '×', () => document.body.classList.remove(BODY_CLASS));
  }

  function cleanupOnRoute() {
    if (!isClientRoute()) {
      document.body.classList.remove(BODY_CLASS);
      document.querySelectorAll('.map-focus-btn,.map-focus-close').forEach(node => node.remove());
    } else {
      setup();
    }
  }

  window.addEventListener('DOMContentLoaded', setup);
  window.addEventListener('popstate', cleanupOnRoute);
  setInterval(cleanupOnRoute, 1200);
})();
