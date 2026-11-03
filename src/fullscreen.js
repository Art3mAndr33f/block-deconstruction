/** Native fullscreen when available; a clearly labelled viewport-sized fallback otherwise. */
export function createFullscreenController(doc, onChange) {
  let fallback = false;
  const notify = () => onChange({ native: !!doc.fullscreenElement, fallback, active: !!doc.fullscreenElement || fallback });
  doc.addEventListener('fullscreenchange', () => { if (doc.fullscreenElement) fallback = false; notify(); });
  async function toggle() {
    if (doc.fullscreenElement) {
      try { await doc.exitFullscreen(); } catch { /* Keep the actual state if exiting fails. */ }
      notify();
    } else if (fallback) {
      fallback = false;
      notify();
    } else {
      try {
        if (!doc.fullscreenEnabled || !doc.documentElement.requestFullscreen) throw new Error('Fullscreen unavailable');
        await doc.documentElement.requestFullscreen();
        // Some embedded browsers resolve the request without granting fullscreen.
        if (!doc.fullscreenElement) fallback = true;
      } catch {
        fallback = true;
      }
      notify();
    }
  }
  function exitFallback() {
    if (!fallback) return false;
    fallback = false;
    notify();
    return true;
  }
  notify();
  return { toggle, exitFallback };
}
