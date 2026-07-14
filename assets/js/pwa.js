// ===== PWA Service Worker + Auto Update =====
if ('serviceWorker' in navigator) {

  navigator.serviceWorker.register("/ooh-assets-scoop/service-worker.js", { updateViaCache: 'none' })
    .then(reg => {
      // Expose globally so notifications.js can access it immediately
      window.__swReg = reg;
      console.log('[SCOOP SW] Registered:', reg.scope);
      listenForUpdate(reg);
      // No background polling for updates (no visibilitychange/setInterval
      // reg.update() loop) — the browser already re-checks the service
      // worker on normal navigation, so a page left open and idle won't
      // silently pick up and activate a new version on its own. Updates are
      // still caught on the next real page load/navigation.
    })
    .catch(err => console.error('[SCOOP SW] Registration failed:', err));

  function listenForUpdate(reg) {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      showUpdateToast('downloading');

      worker.addEventListener('statechange', () => {
        // SW calls skipWaiting() in its install event, so it goes straight to
        // activating/activated — catch any post-install state, not just 'installed'.
        if ((worker.state === 'installed' || worker.state === 'activating' || worker.state === 'activated')
            && navigator.serviceWorker.controller) {
          showUpdateToast('ready');
        }
      });
    });
  }
}

// ===== UPDATE TOAST =====
let toastEl = null;

function showUpdateToast(phase) {
  // Remove any existing toast
  toastEl?.remove();

  toastEl = document.createElement('div');
  toastEl.id = 'sw-update-toast';

  const isReady = phase === 'ready';

  toastEl.innerHTML = `
    <div class="sw-toast-icon">${isReady ? '✦' : ''}</div>
    <div class="sw-toast-text">
      <span class="sw-toast-title">${isReady ? 'Update ready' : 'Updating app…'}</span>
      <span class="sw-toast-sub">${isReady ? 'Tap Refresh to load the latest version.' : 'Downloading new version in the background.'}</span>
    </div>
    ${isReady ? '<button class="sw-toast-btn" id="swRefreshBtn">Refresh</button>' : '<span class="sw-toast-spinner"></span>'}
  `;

  Object.assign(toastEl.style, {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: 'var(--bg-secondary, #1a1a2e)',
    border: '1px solid var(--border-glow, rgba(79,70,229,0.4))',
    borderRadius: '14px',
    padding: '14px 18px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: '99999',
    maxWidth: '340px',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    fontFamily: 'var(--font-display, system-ui)',
    color: 'var(--text-primary, #fff)',
    opacity: '0',
    transform: 'translateY(12px)',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
  });

  injectToastStyles();
  document.body.appendChild(toastEl);

  requestAnimationFrame(() => {
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translateY(0)';
  });

  if (isReady) {
    document.getElementById('swRefreshBtn')?.addEventListener('click', () => {
      toastEl.style.opacity = '0';
      // New SW already activated via skipWaiting in install event — just reload.
      window.location.reload();
    });
  }
}

function injectToastStyles() {
  if (document.getElementById('sw-toast-styles')) return;
  const s = document.createElement('style');
  s.id = 'sw-toast-styles';
  s.textContent = `
    #sw-update-toast .sw-toast-icon {
      font-size: 18px; color: var(--accent-indigo, #4f46e5); flex-shrink: 0;
    }
    #sw-update-toast .sw-toast-text {
      display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;
    }
    #sw-update-toast .sw-toast-title {
      font-size: 13px; font-weight: 700; color: var(--text-primary, #fff);
    }
    #sw-update-toast .sw-toast-sub {
      font-size: 11px; color: var(--text-muted, rgba(255,255,255,0.5));
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #sw-update-toast .sw-toast-btn {
      background: var(--accent-indigo, #4f46e5); color: #fff; border: none;
      padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 700;
      cursor: pointer; flex-shrink: 0; transition: opacity 0.2s;
      font-family: var(--font-display, system-ui);
    }
    #sw-update-toast .sw-toast-btn:hover { opacity: 0.85; }
    #sw-update-toast .sw-toast-spinner {
      width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.15);
      border-top-color: var(--accent-indigo, #4f46e5); border-radius: 50%;
      animation: sw-spin 0.8s linear infinite; flex-shrink: 0;
    }
    @keyframes sw-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(s);
}

// ===== INSTALL BADGE =====
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  if (document.getElementById('installBadge')) return;

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

  requestAnimationFrame(() => {
    installBadge.style.opacity = '1';
    installBadge.style.transform = 'translateY(0)';
  });

  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    installBadge.style.right = '50%';
    installBadge.style.transform = 'translateX(50%)';
    installBadge.style.bottom = '1.5rem';
  }

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

window.addEventListener('appinstalled', () => {
  document.getElementById('installBadge')?.remove();
  deferredPrompt = null;
  console.log('✅ App successfully installed!');
});
