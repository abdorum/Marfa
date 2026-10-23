import { render } from 'preact';
import { strings } from './i18n';
import { match, path } from './router';
import { Calendar } from './screens/Calendar';
import { Course, Courses } from './screens/Courses';
import { Home } from './screens/Home';
import { Legal } from './screens/Legal';
import { Login } from './screens/Login';
import { About, Me, More, MoreBlock, Notices, Settings } from './screens/Me';
import { Raad, RaadJob } from './screens/Raad';
import { init, ready, signedIn, snapshot } from './store/app';
import { BottomNav, Empty } from './ui';
import './styles/app.css';

function Screen() {
  const p = path.value;
  let m: Record<string, string> | undefined;
  if (p === '/' || p === '') return <Home />;
  if (p === '/calendar') return <Calendar />;
  if (p === '/raad') return <Raad />;
  if ((m = match('/raad/:id'))) return <RaadJob id={m.id!} />;
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
  if (!ready.value) return null;
  if (!signedIn.value) {
    // The policy and terms must be readable before agreeing to them.
    if (path.value === '/privacy' || path.value === '/terms') return <div class="app"><Legal doc={path.value === '/privacy' ? 'privacy' : 'terms'} /></div>;
    return <Login />;
  }
  return (
    <div class="app">
      {snapshot.value ? <Screen /> : <div class="page"><Empty><span class="spin" aria-label={strings.value.raadScreen.working} /></Empty></div>}
      <BottomNav />
    </div>
  );
}

render(<App />, document.getElementById('app')!);
void init();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
