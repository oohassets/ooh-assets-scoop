// ===== PWA Service Worker + Auto Update =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register("/ooh-assets-scoop/service-worker.js")
      .then(registration => {
        console.log('✅ Service Worker registered:', registration.scope);

        // --- Check for updates periodically ---
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Every 1 hour

        // --- Listen for updates ---
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version ready
              showUpdatePopup(newWorker);
            }
          });
        });
      })
      .catch(err => console.error('❌ SW registration failed:', err));
  });
}

// ===== AUTO-UPDATE POPUP =====
function showUpdatePopup(newWorker) {
  // Create popup container
  const popup = document.createElement('div');
  popup.innerHTML = `
    <div id="sw-update-popup" style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #222;
      color: #ffffff;
      font-family: sans-serif;
      padding: 14px 18px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 10px;
    ">
      <span>🔄 A new version is available.</span>
      <button id="refreshAppBtn" style="
        background: #007bff;
        border: none;
        color: #ffffff;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
      ">Refresh</button>
    </div>
  `;
  document.body.appendChild(popup);

  document.getElementById('refreshAppBtn').addEventListener('click', () => {
    newWorker.postMessage({ type: 'SKIP_WAITING' });
  });

  // Refresh automatically after SW is activated
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

  // --- Floating "Install App" badge ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Avoid duplicate buttons
  if (document.getElementById('installBadge')) return;

  // Create floating badge
  const installBadge = document.createElement('div');
  installBadge.id = 'installBadge';
  installBadge.textContent = '⬇️ Install App';
  installBadge.style.cssText = `
    position: fixed;
    bottom: 1.2rem;
    right: 1.2rem;
    background: #1f6feb;
    color: #fff;
    padding: .6rem 1rem;
    border-radius: 50px;
    font-weight: 600;
    font-size: 0.9rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    cursor: pointer;
    z-index: 999999;
    transition: all .3s ease;
    opacity: 0;
    transform: translateY(20px);
  `;

  document.body.appendChild(installBadge);

  // Animate in
  requestAnimationFrame(() => {
    installBadge.style.opacity = '1';
    installBadge.style.transform = 'translateY(0)';
  });

  // Adjust placement for mobile
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    installBadge.style.right = '50%';
    installBadge.style.transform = 'translateX(50%)';
    installBadge.style.bottom = '1.5rem';
  }

  // Handle click → show browser install prompt
  installBadge.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installBadge.textContent = 'Installing...';
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response: ${outcome}`);
    deferredPrompt = null;
    installBadge.remove();
  });
});

// Hide badge when installed
window.addEventListener('appinstalled', () => {
  const badge = document.getElementById('installBadge');
  if (badge) badge.remove();
  deferredPrompt = null;
  console.log('✅ App successfully installed!');
});
