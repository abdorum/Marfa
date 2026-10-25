// The web app: the one driving adapter of the application (Docs/05). Routes,
// the shell, and the start.
import { render } from 'preact';
import { PRODUCT } from '../app/product';
import { strings } from './i18n';
import { match, path } from './router';
import { Course, Courses } from './screens/Courses';
import { Home } from './screens/Home';
import { Login, Welcome } from './screens/Login';
import { About, Legal, Me, More, MoreBlock, Notices, Settings } from './screens/Me';
import { Raad } from './screens/Raad';
import { Schedule } from './screens/Schedule';
import { ShareSheet } from './share/ShareSheet';
import { prefs, ready, setPrefs, signedIn, start } from './state';
import { Dock, Spinner, Toast } from './ui';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';

// The project's old address sends everyone to the new one.
if (location.hostname === 'ties-bmc.pages.dev') location.replace(`${PRODUCT.site}${location.pathname}${location.search}${location.hash}`);

function Screen() {
  const p = path.value;
  let m: Record<string, string> | undefined;
  if (p === '/schedule' || p === '/calendar') return <Schedule />;
  if (p === '/raad' || p.startsWith('/raad/')) return <Raad />;
  if (p === '/courses') return <Courses />;
  if ((m = match('/courses/:slug'))) return <Course slug={m.slug!} />;
  if (p === '/me') return <Me />;
  if (p === '/me/notices') return <Notices />;
  if (p === '/me/more') return <More />;
  if ((m = match('/me/more/:id'))) return <MoreBlock id={m.id!} />;
  if (p === '/me/settings') return <Settings />;
  if (p === '/me/about') return <About />;
  if (p === '/privacy') return <Legal doc="privacy" />;
  if (p === '/terms') return <Legal doc="terms" />;
  return <Home />;
}

function App() {
  if (!ready.value) return <div class="login"><Spinner label={strings.value.appName} /></div>;
  if (!prefs.value.welcomed) return <Welcome />;
  if (!signedIn.value) {
    // The policy and terms must be readable before agreeing to them.
    if (path.value === '/privacy' || path.value === '/terms') return <div class="app"><Legal doc={path.value === '/privacy' ? 'privacy' : 'terms'} /></div>;
    return <><Login /><Toast /></>;
  }
  return (
    <div class="app">
      <Screen />
      <Dock />
      <ShareSheet />
      <Toast />
    </div>
  );
}

render(<App />, document.getElementById('app')!);
void start().then(() => {
  // A first visit has nothing new to announce; later versions do, once.
  if (!prefs.value.lastSeenVersion) void setPrefs({ lastSeenVersion: PRODUCT.version });
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
