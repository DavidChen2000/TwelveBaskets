// 集中處理 Service Worker 更新提示、使用者確認與頁面重新載入。
export function registerServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return;

  const banner = document.querySelector('#update-banner');
  const applyButton = document.querySelector('#update-apply');
  const dismissButton = document.querySelector('#update-dismiss');
  let waitingWorker = null;
  let hadController = Boolean(navigator.serviceWorker.controller);
  let updateAccepted = false;
  let reloading = false;

  const showUpdate = (worker) => {
    waitingWorker = worker;
    banner.hidden = false;
  };

  const observeInstallingWorker = (registration, worker) => {
    if (!worker) return;
    const checkState = () => {
      if (worker.state === 'installed' && registration.active) showUpdate(worker);
    };
    worker.addEventListener('statechange', checkState);
    checkState();
  };

  applyButton.addEventListener('click', () => {
    updateAccepted = true;
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  });
  dismissButton.addEventListener('click', () => { banner.hidden = true; });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController && !updateAccepted) {
      hadController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./service-worker.js').then((registration) => {
    if (registration.waiting && registration.active) showUpdate(registration.waiting);
    observeInstallingWorker(registration, registration.installing);
    registration.addEventListener('updatefound', () => observeInstallingWorker(registration, registration.installing));
    registration.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  }).catch(() => {});
}