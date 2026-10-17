export function createScreenWakeLock({
  wakeLock = globalThis.navigator?.wakeLock,
  document = globalThis.document,
  onError = () => {},
} = {}) {
  let reading = false;
  let sentinel = null;
  let requestPending = false;

  async function releaseCurrent() {
    const current = sentinel;
    sentinel = null;
    if (!current || current.released) return;
    try {
      await current.release();
    } catch (error) {
      onError(error);
    }
  }

  async function acquire() {
    if (!reading || document.visibilityState !== 'visible' || !wakeLock?.request || sentinel || requestPending) return;
    requestPending = true;
    try {
      const requested = await wakeLock.request('screen');
      if (!reading || document.visibilityState !== 'visible') {
        await requested.release();
        return;
      }
      sentinel = requested;
      requested.addEventListener('release', () => {
        if (sentinel === requested) sentinel = null;
      }, { once: true });
    } catch (error) {
      onError(error);
    } finally {
      requestPending = false;
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') acquire();
    else releaseCurrent();
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return {
    setReading(value) {
      reading = Boolean(value);
      if (reading) acquire();
      else releaseCurrent();
    },
  };
}
