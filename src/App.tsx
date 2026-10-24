import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { requestPersistence } from './game/backup';
import { ensureGame } from './game/init';
import { UiProvider } from './ui/common';
import { Competition } from './ui/screens/Competition';
import { Home } from './ui/screens/Home';
import { LiveView } from './ui/screens/Live';
import { MatchView } from './ui/screens/MatchView';
import { PlayerView } from './ui/screens/PlayerView';
import { Records } from './ui/screens/Records';
import { SeasonView } from './ui/screens/SeasonView';
import { Settings } from './ui/screens/Settings';
import { TeamView } from './ui/screens/TeamView';
import { TitleWall } from './ui/screens/TitleWall';
import { UpdateBanner } from './ui/UpdateBanner';
import { WorldProvider } from './ui/world';

function Loading({ text }: { text: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <img src="icons/icon-192.png" width={72} height={72} style={{ borderRadius: 18 }} alt="" />
        <div className="muted" style={{ marginTop: 14 }}>{text}</div>
      </div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ensureGame()
      .then(() => setReady(true))
      .catch((e) => setError(String(e)));
    void requestPersistence();
  }, []);
  if (error) return <Loading text={`Error al cargar: ${error}`} />;
  if (!ready) return <Loading text="Preparando ligas y plantillas…" />;
  return (
    <UiProvider>
      <UpdateBanner />
      <WorldProvider fallback={<Loading text="Cargando…" />}>
        <HashRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/c/:id" element={<Competition />} />
            <Route path="/m/:id" element={<MatchView />} />
            <Route path="/m/:id/live" element={<LiveView />} />
            <Route path="/t/:id" element={<TeamView />} />
            <Route path="/p/:id" element={<PlayerView />} />
            <Route path="/season/:id" element={<SeasonView />} />
            <Route path="/records" element={<Records />} />
            <Route path="/titles/:key" element={<TitleWall />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </HashRouter>
      </WorldProvider>
    </UiProvider>
  );
}
