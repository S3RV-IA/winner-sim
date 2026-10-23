import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Avisa cuando hay una versión nueva publicada. En el iPhone la app instalada se reanuda sin recargarse,
 * así que también se comprueba cada vez que vuelve a primer plano. No recarga sola para no cortar una simulación.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => void reg.update().catch(() => undefined);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <button
      className="toast"
      style={{
        top: 'calc(10px + env(safe-area-inset-top))', bottom: 'auto', zIndex: 300, whiteSpace: 'nowrap', fontWeight: 700,
        background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
      }}
      onClick={() => {
        void updateServiceWorker(true);
        // Si la página no la controlaba aún el service worker no llega el aviso para recargar: se recarga igualmente
        setTimeout(() => window.location.reload(), 1500);
      }}
    >
      Nueva versión · Toca para actualizar
    </button>
  );
}
