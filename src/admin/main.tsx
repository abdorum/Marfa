// The owner's page (/admin/): Raad's switches and the statistics, in the
// app's own look. Its own entry (admin/index.html), so none of it reaches the
// students' app. It talks to Raad with the owner's key (raad/server/admin.ts).
import { render, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Activity, BookOpen, ChartColumn, Clock, Eraser, KeyRound, Lock, Megaphone, Power, RefreshCw, Smartphone, Users } from 'lucide-preact';
import type { StatsReport } from '../../raad/server/stats';
import type { Switches } from '../../raad/server/switches';
import { adminApi, AdminError, collegeHealth, dropKey, forgetStudent, keepKey, savedKey, type AdminState } from './api';
import { Columns, Shares } from './charts';
import { days, hours, syncs, totals } from './report';
import '../web/styles/tokens.css';
import '../web/styles/base.css';
import '../web/styles/components.css';
import './admin.css';

const MAX_MESSAGE = 200;
const MAX_NOTICE = 300;

const CODES: Record<string, string> = {
  OK: 'تمّ كاملًا', PARTIAL: 'تمّ وتعذّر بعضه',
  BAD_CREDENTIALS: 'كلمة مرورٍ خاطئة', ACCOUNT: 'حسابٌ ترفضه الكلية', SESSION_EXPIRED: 'انقطعت الجلسة',
  NOT_AUTHORIZED: 'صفحةٌ لا يُؤذن بها', TIMEOUT: 'أبطأت الكلية', UPSTREAM: 'تعثّر نظام الكلية',
  BLOCKED: 'ردّه جدار الكلية', SERVER_ERROR: 'خطأٌ في رعد', OTHER: 'غير ذلك',
  PAUSED: 'ورعدٌ موقوف', UNAVAILABLE: 'وقد غابت حمايةٌ من حماياته', COOLDOWN: 'ورعدٌ يستريح',
  RATE_LIMITED: 'جاوز حدّ الطلبات', LOCKED: 'رقمٌ موقوفٌ بعد كلماتٍ خاطئة', BUSY: 'وتحديثٌ آخر للرقم نفسه جارٍ',
};
const PARTS: Record<string, string> = { center: 'مركز الطالب', grades: 'الدرجات', attendance: 'الحضور', exams: 'الاختبارات' };
const STALE = [[undefined, '15 د'], [30, '30 د'], [60, 'ساعة'], [180, '3 س'], [720, '12 س']] as const;
const SPANS = [[1, 'اليوم'], [7, '7 أيام'], [30, '30 يومًا']] as const;

const date = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn', { ...o, timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const time = (iso: string) => new Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso));
const hourName = (h: number) => `${h % 12 || 12} ${h < 12 ? 'ص' : 'م'}`;
const percent = (x?: number) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const seconds = (ms?: number) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} ث`);

function Card({ title, index, icon, tone = '', children }: { title: string; index: number; icon?: ComponentChildren; tone?: string; children: ComponentChildren }) {
  return (
    <section class={`card ${tone}`}>
      <header class="card-head">
        <span class="idx" aria-hidden="true">{String(index).padStart(2, '0')}</span>
        <h2>{title}</h2>
        {icon}
      </header>
      {children}
    </section>
  );
}

/** A note that the same switch is also set in the Cloudflare dashboard. */
const FromDashboard = ({ children }: { children: ComponentChildren }) => <p class="dash-note"><KeyRound aria-hidden="true" />{children}</p>;

// ── The gate ────────────────────────────────────────────────────────────────

const PROBLEMS: Record<string, string> = {
  UNAUTHORIZED: 'المفتاح غير صحيح.',
  RATE_LIMITED: 'محاولاتٌ كثيرة من هذا العنوان. انتظر دقيقةً ثم أعد.',
  OFFLINE: 'لا اتصال بالشبكة.',
  UNAVAILABLE: 'رعدٌ لا يجد إحدى حماياته، فأغلق اللوحة.',
};

function Gate({ problem, onKey }: { problem?: string; onKey: (key: string, remember: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <main class="page gate">
      <Card title="مفتاح اللوحة" index={1} icon={<Lock aria-hidden="true" />}>
        <p class="label" style={{ lineHeight: 1.8 }}>هذه اللوحة لصاحب المشروع وحده. أدخل المفتاح الذي وضعته في رعد مرةً واحدة.</p>
        {problem === 'NOT_CONFIGURED' ? (
          <div class="setup">
            <p>لم يُوضع مفتاح اللوحة بعد. ضعه من حاسوبك، من مجلد المشروع، بأمرٍ واحد، ثم الصق المفتاح حين يطلبه (32 حرفًا فأكثر):</p>
            <code dir="ltr">npx.cmd wrangler secret put ADMIN_KEY -c raad/wrangler.toml</code>
            <p class="label">والطريقة كاملةً في دليل الطوارئ (RUNBOOK.md): «لوحة المشرف».</p>
          </div>
        ) : problem && <p class="alert-box" role="alert">{PROBLEMS[problem] ?? 'تعذّر الوصول إلى رعد. أعد المحاولة بعد قليل.'}</p>}
        <form class="stack" onSubmit={async e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          await onKey(String(f.get('key') ?? '').trim(), f.get('remember') === 'on');
          setBusy(false);
        }}>
          <label class="field">المفتاح<input name="key" type="password" autoComplete="current-password" required minLength={32} disabled={busy} /></label>
          <label class="check"><input type="checkbox" name="remember" defaultChecked />تذكّره على هذا الجهاز</label>
          <button class="btn primary block" disabled={busy}>{busy ? <span class="spin" /> : <KeyRound />}ادخل</button>
        </form>
      </Card>
    </main>
  );
}

// ── The switches ────────────────────────────────────────────────────────────

type Save = (patch: Partial<Switches>, done: string) => Promise<boolean>;

function NowCard({ s, health, onEndRest }: { s: AdminState; health?: { sis?: number; reachable?: boolean }; onEndRest: () => void }) {
  const paused = !!(s.page.paused || s.dashboard.paused);
  return (
    <Card title="الحال الآن" index={1} icon={<Activity aria-hidden="true" />} tone={paused || s.rest ? 'tone-risk' : ''}>
      <dl class="kv">
        <dt>رعد</dt>
        <dd>{paused ? <b class="risk">موقوفٌ للجميع</b> : s.rest ? <b class="warn">يستريح حتى {time(s.rest.until)}</b> : <b class="ok">يعمل</b>}</dd>
        {s.rest && <><dt>سبب الاستراحة</dt><dd>{s.rest.reason === 'BLOCKED' ? 'ردّه جدار الكلية' : 'تتابعت أخطاء الكلية'}</dd></>}
        <dt>نظام الكلية</dt>
        <dd>{!health ? '—' : health.reachable ? <span class="ok">يجيب</span> : <span class="risk">لا يجيب{health.sis ? <> (<bdi class="mono">{health.sis}</bdi>)</> : null}</span>}</dd>
        <dt>الإصدار</dt>
        <dd><bdi class="mono">{s.version}{s.build ? ` · ${s.build}` : ''}</bdi></dd>
        {s.page.at && <><dt>آخر تعديلٍ منك</dt><dd>{time(s.page.at)}</dd></>}
      </dl>
      {s.rest && (
        <div class="card-foot">
          <span class="label">إن عادت الكلية قبل ذلك فأنهِ الاستراحة.</span>
          <button class="btn sm soft" onClick={onEndRest}>أنهِ الاستراحة</button>
        </div>
      )}
    </Card>
  );
}

function PauseCard({ s, save }: { s: AdminState; save: Save }) {
  const [ar, setAr] = useState(s.page.message?.ar ?? '');
  const [en, setEn] = useState(s.page.message?.en ?? '');
  const paused = !!s.page.paused;
  const message = { ar: ar.trim() || undefined, en: en.trim() || undefined };
  return (
    <Card title="إيقاف رعد" index={7} icon={<Power aria-hidden="true" />} tone={paused ? 'tone-risk' : ''}>
      <p class="label" style={{ lineHeight: 1.8 }}>
        {paused ? 'رعدٌ موقوفٌ الآن: لا يصل منه إلى الكلية شيء، ويرى الطلاب رسالتك في سطره.' : 'يوقف كل تحديثٍ للجميع قبل أن يصل إلى الكلية، حتى تعيده. ويرى الطلاب رسالتك في سطر رعد.'}
      </p>
      <Words label="الرسالة" ar={ar} en={en} setAr={setAr} setEn={setEn} max={MAX_MESSAGE} rows={2} />
      {s.dashboard.paused && <FromDashboard>وهو موقوفٌ كذلك من لوحة Cloudflare، فلا يعود حتى يُحذف المتغير RAAD_PAUSED هناك.</FromDashboard>}
      <div class="card-foot">
        {paused ? <button class="btn sm soft" onClick={() => void save({ message }, 'حُدّثت الرسالة')}>حدّث الرسالة</button> : <span />}
        {paused
          ? <button class="btn primary" onClick={() => void save({ paused: false }, 'عاد رعدٌ إلى العمل')}><Power />أعِده إلى العمل</button>
          : <button class="btn danger" onClick={() => confirm('يتوقف رعدٌ عن التحديث لكل الطلاب حتى تعيده. أتوقفه؟') && void save({ paused: true, message }, 'أُوقف رعدٌ للجميع')}><Power />أوقفه للجميع</button>}
      </div>
    </Card>
  );
}

function Words({ label, ar, en, setAr, setEn, max, rows }: { label: string; ar: string; en: string; setAr: (v: string) => void; setEn: (v: string) => void; max: number; rows: number }) {
  return (
    <div class="words">
      <label class="field">{label} بالعربية <small class="mono"><bdi>{ar.length}/{max}</bdi></small>
        <textarea dir="rtl" rows={rows} maxLength={max} value={ar} onInput={e => setAr(e.currentTarget.value)} />
      </label>
      <label class="field">وبالإنجليزية، لمن اختارها <small class="mono"><bdi>{en.length}/{max}</bdi></small>
        <textarea dir="ltr" rows={rows} maxLength={max} value={en} onInput={e => setEn(e.currentTarget.value)} />
      </label>
    </div>
  );
}

function NoticeCard({ s, save }: { s: AdminState; save: Save }) {
  const [ar, setAr] = useState(s.page.notice?.ar ?? '');
  const [en, setEn] = useState(s.page.notice?.en ?? '');
  const live = s.page.notice;
  const text = ar.trim() || en.trim();
  return (
    <Card title="الإعلان" index={8} icon={<Megaphone aria-hidden="true" />} tone={live ? 'tone-lime' : ''}>
      <p class="label" style={{ lineHeight: 1.8 }}>بطاقةٌ في أعلى الرئيسية يراها كل طالبٍ عند فتح التطبيق. نصٌّ فقط، بلا روابط.</p>
      <Words label="الإعلان" ar={ar} en={en} setAr={setAr} setEn={setEn} max={MAX_NOTICE} rows={3} />
      {text && (
        <div class="preview" aria-label="كما يراه الطلاب">
          <section class="card tone-lime"><header class="card-head"><h2>إعلان</h2><Megaphone aria-hidden="true" /></header><p style={{ whiteSpace: 'pre-line', lineHeight: 1.8 }}><bdi>{ar.trim() || en.trim()}</bdi></p></section>
        </div>
      )}
      {s.dashboard.notice && <FromDashboard>{live ? 'وفي لوحة Cloudflare إعلانٌ آخر، يظهر إن حذفت هذا.' : 'والإعلان الظاهر الآن من لوحة Cloudflare (NOTICE_AR).'}</FromDashboard>}
      <div class="card-foot">
        {live ? <button class="btn sm soft" onClick={() => { setAr(''); setEn(''); void save({ notice: undefined }, 'حُذف الإعلان'); }}><Eraser />احذفه</button> : <span />}
        <button class="btn primary" disabled={!text} onClick={() => void save({ notice: { ar: ar.trim() || undefined, en: en.trim() || undefined } }, 'نُشر الإعلان')}><Megaphone />{live ? 'حدّثه' : 'انشره'}</button>
      </div>
    </Card>
  );
}

function ReadingCard({ s, save }: { s: AdminState; save: Save }) {
  const [skip, setSkip] = useState(new Set(s.page.skip ?? []));
  const [stale, setStale] = useState(s.page.staleMinutes);
  const byDashboard = new Set(s.dashboard.skip ?? []);
  return (
    <Card title="ما يقرؤه رعد" index={9} icon={<BookOpen aria-hidden="true" />}>
      <div>
        {s.parts.map(p => (
          <label class="setting">
            <span>{PARTS[p] ?? p}{byDashboard.has(p) && <small>موقوفةٌ من لوحة Cloudflare</small>}</span>
            <input class="toggle" type="checkbox" checked={!skip.has(p) && !byDashboard.has(p)} disabled={byDashboard.has(p)} onChange={e => {
              const next = new Set(skip);
              if (e.currentTarget.checked) next.delete(p); else next.add(p);
              setSkip(next);
            }} />
          </label>
        ))}
        <div class="setting">
          <span>تحديث الأجهزة<small>كم تبلغ البيانات من العمر قبل أن يحدّثها الجهاز بنفسه</small></span>
        </div>
        <span class="seg wrap">{STALE.map(([v, label]) => <button aria-pressed={stale === v} onClick={() => setStale(v)}>{label}</button>)}</span>
      </div>
      <p class="label" style={{ lineHeight: 1.8 }}>أوقف صفحةً إن صارت تقطع الجلسات، وأبطئ التحديث في أسابيع الاختبارات.</p>
      <div class="card-foot">
        <span />
        <button class="btn primary" onClick={() => void save({ skip: [...skip], staleMinutes: stale }, 'حُفظ')}>احفظ</button>
      </div>
    </Card>
  );
}

// ── The statistics ──────────────────────────────────────────────────────────

function StudentsCard({ r }: { r: StatsReport }) {
  const rows = days(r);
  const today = rows[rows.length - 1]!;
  const newWeek = rows.slice(-7).reduce((n, d) => n + d.new, 0);
  return (
    <Card title="الطلاب" index={2} icon={<Users aria-hidden="true" />}>
      <div class="stats">
        <div class="stat"><b>{r.students.total}</b><span>دخلوا البوابة</span></div>
        <div class="stat"><b>{today.students}</b><span>اليوم</span></div>
        <div class="stat"><b>{r.students.week}</b><span>آخر 7 أيام</span></div>
        <div class="stat"><b>{r.students.month}</b><span>آخر 30 يومًا</span></div>
      </div>
      <p class="label">جددٌ اليوم: <bdi class="mono">{today.new}</bdi> · وفي آخر 7 أيام: <bdi class="mono">{newWeek}</bdi> · ومرّات فتح التطبيق اليوم: <bdi class="mono">{today.opens}</bdi></p>
    </Card>
  );
}

function DailyCard({ r }: { r: StatsReport }) {
  const rows = days(r);
  return (
    <Card title="كل يوم" index={3} icon={<ChartColumn aria-hidden="true" />}>
      <ul class="legend">
        <li><i style={{ background: 'var(--chart-1)' }} />طلابٌ عادوا</li>
        <li><i style={{ background: 'var(--chart-2)' }} />طلابٌ جدد</li>
      </ul>
      <Columns
        label="الطلاب كل يومٍ في آخر 30 يومًا"
        columns={rows.map((d, i) => ({
          parts: [{ value: d.students - d.new, color: '--chart-1' }, { value: d.new, color: '--chart-2' }],
          tick: i % 7 === (rows.length - 1) % 7 ? `${Number(d.day.slice(8))}/${Number(d.day.slice(5, 7))}` : undefined,
        }))}
        readout={i => {
          const d = rows[i]!;
          return <><b>{date(d.day, { weekday: 'long', day: 'numeric', month: 'long' })}</b> طلابٌ <bdi class="mono">{d.students}</bdi>، منهم جدد <bdi class="mono">{d.new}</bdi> · تحديثات <bdi class="mono">{d.syncs}</bdi> · فتحات <bdi class="mono">{d.opens}</bdi></>;
        }}
        table={
          <table>
            <thead><tr><th>اليوم</th><th>الطلاب</th><th>الجدد</th><th>التحديثات</th><th>الفتحات</th></tr></thead>
            <tbody>{[...rows].reverse().map(d => <tr><td>{date(d.day, { weekday: 'short', day: 'numeric', month: 'numeric' })}</td><td>{d.students}</td><td>{d.new}</td><td>{d.syncs}</td><td>{d.opens}</td></tr>)}</tbody>
          </table>
        }
      />
    </Card>
  );
}

function SyncsCard({ r }: { r: StatsReport }) {
  const [span, setSpan] = useState(7);
  const x = syncs(r, span);
  const parts = [...totals(r, 'part', span)].sort((a, b) => b[1].n - a[1].n);
  return (
    <Card title="التحديثات" index={4} icon={<RefreshCw aria-hidden="true" />}>
      <span class="seg">{SPANS.map(([v, label]) => <button aria-pressed={span === v} onClick={() => setSpan(v)}>{label}</button>)}</span>
      <div class="stats three">
        <div class="stat"><b>{x.reached}</b><span>وصلت إلى الكلية</span></div>
        <div class="stat"><b>{percent(x.rate)}</b><span>نجحت</span></div>
        <div class="stat"><b>{seconds(x.avgMs)}</b><span>متوسط المدة</span></div>
      </div>
      {x.failed.length > 0 && <>
        <h3 class="sub">ما تعثّر</h3>
        <Shares total={x.reached} rows={x.failed.map(([c, t]) => ({ label: CODES[c] ?? c, n: t.n, color: '--chart-2' }))} />
      </>}
      {parts.length > 0 && <>
        <h3 class="sub">صفحاتٌ تعذّرت وحدها</h3>
        <Shares total={x.reached} rows={parts.map(([k, t]) => {
          const [p, c] = k.split(':');
          return { label: PARTS[p!] ?? p, note: CODES[c!] ?? c, n: t.n, color: '--chart-2' };
        })} />
      </>}
      {x.refused.length > 0 && <>
        <h3 class="sub">رُدّت قبل الكلية</h3>
        <Shares total={x.refused.reduce((n, [, t]) => n + t.n, 0)} rows={x.refused.map(([c, t]) => ({ label: CODES[c] ?? c, n: t.n }))} />
      </>}
      {!x.reached && !x.refused.length && <p class="empty">لا تحديث في هذه المدة.</p>}
    </Card>
  );
}

function HoursCard({ r }: { r: StatsReport }) {
  const h = hours(r, 30);
  const peak = h.indexOf(Math.max(...h));
  return (
    <Card title="أوقات الذروة" index={5} icon={<Clock aria-hidden="true" />}>
      <p class="label">التحديثات في كل ساعةٍ من اليوم، بتوقيت جدة، في آخر 30 يومًا.</p>
      <Columns
        label="التحديثات في كل ساعة"
        initial={peak}
        columns={h.map((n, i) => ({ parts: [{ value: n, color: '--chart-1' }], tick: i % 6 === 0 ? hourName(i) : undefined }))}
        readout={i => <><b>{hourName(i)}</b> تحديثات <bdi class="mono">{h[i]}</bdi>{i === peak && h[i] ? ' · أكثر ساعات اليوم' : ''}</>}
        table={
          <table>
            <thead><tr><th>الساعة</th><th>التحديثات</th></tr></thead>
            <tbody>{h.map((n, i) => <tr><td>{hourName(i)}</td><td>{n}</td></tr>)}</tbody>
          </table>
        }
      />
    </Card>
  );
}

function VersionsCard({ r, version }: { r: StatsReport; version: string }) {
  const t = totals(r, 'open', 7);
  const n = (k: string) => t.get(k)?.n ?? 0;
  const total = [...t.values()].reduce((s, x) => s + x.n, 0);
  return (
    <Card title="الإصدارات" index={6} icon={<Smartphone aria-hidden="true" />}>
      <p class="label">مرّات فتح التطبيق في آخر 7 أيام، بإصداره. تعرف بها كم وصلهم آخر تحديث.</p>
      {total ? (
        <Shares total={total} rows={[
          { label: <>الإصدار الحالي <bdi class="mono">{version}</bdi></>, n: n(version) },
          { label: 'إصدارٌ أقدم', n: n('older'), color: '--chart-2' },
          { label: 'أقدم من 1.3، أو غير معروف', n: n('unknown'), color: '--chart-2' },
        ]} />
      ) : <p class="empty">لم يُفتح التطبيق في هذه المدة.</p>}
    </Card>
  );
}

function ForgetCard({ flash }: { flash: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card title="حذف طالبٍ من الإحصاء" index={10} icon={<Eraser aria-hidden="true" />}>
      <p class="label" style={{ lineHeight: 1.8 }}>إن طلب طالبٌ حذف أثره، فاكتب رقمه هنا: يُحذف معرّفه المستعار وتاريخا أول دخوله وآخره. ولا يُحفظ الرقم نفسه، ولا يُقال لك هل كان موجودًا.</p>
      <form class="row-flex" onSubmit={async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const id = String(new FormData(form).get('id') ?? '').trim();
        if (!id) return;
        setBusy(true);
        const ok = await forgetStudent(id);
        setBusy(false);
        if (ok) form.reset();
        flash(ok ? 'حُذف إن كان موجودًا' : 'تعذّر الحذف. تحقّق من الرقم وأعد');
      }}>
        <label class="field grow"><span class="sr">الرقم الجامعي</span><input name="id" inputMode="numeric" placeholder="الرقم الجامعي" autoComplete="off" disabled={busy} /></label>
        <button class="btn soft" disabled={busy}>احذف</button>
      </form>
    </Card>
  );
}

// ── The page ────────────────────────────────────────────────────────────────

function App() {
  const [key, setKey] = useState(savedKey());
  const [problem, setProblem] = useState<string>();
  const [s, setS] = useState<AdminState>();
  const [stats, setStats] = useState<StatsReport>();
  const [statsProblem, setStatsProblem] = useState<string>();
  const [health, setHealth] = useState<{ sis?: number; reachable?: boolean }>();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string>();
  const [round, setRound] = useState(0);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(t => (t === m ? undefined : t)), 2800);
  };

  /** Everything from Raad; true when the key opened the page. */
  const load = async (k: string): Promise<boolean> => {
    setLoading(true);
    try {
      const api = adminApi(k);
      const state = await api.state();
      setS(state);
      setProblem(undefined);
      setRound(n => n + 1);
      void collegeHealth().then(setHealth);
      if (state.stats) {
        api.stats().then(r => { setStats(r); setStatsProblem(undefined); }, (e: AdminError) => setStatsProblem(e.code));
      } else setStatsProblem('NO_STATS');
      return true;
    } catch (e) {
      const code = e instanceof AdminError ? e.code : 'SERVER_ERROR';
      setProblem(code);
      if (code === 'UNAUTHORIZED' || code === 'NOT_CONFIGURED') {
        dropKey();
        setKey(null);
        setS(undefined);
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (key) void load(key); }, []);

  if (!key || !s) {
    if (key && !problem) return <main class="page gate"><p class="empty"><span class="spin" /></p></main>;
    return <><Top /><Gate problem={problem} onKey={async (k, remember) => {
      if (await load(k)) {
        keepKey(k, remember);
        setKey(k);
      }
    }} /></>;
  }

  const api = adminApi(key);
  const save: Save = async (patch, done) => {
    const next: Switches = { ...s.page, ...patch };
    delete next.at;
    try {
      const { page } = await api.save(next);
      setS({ ...s, page });
      flash(done);
      return true;
    } catch (e) {
      flash(e instanceof AdminError && e.code === 'BAD_REQUEST' ? 'لم يُحفظ: في النص ما لا يُقبل' : 'لم يُحفظ. أعد المحاولة');
      return false;
    }
  };

  return (
    <>
      <Top end={
        <>
          <button class="icon-btn" aria-label="حدّث" disabled={loading} onClick={() => void load(key)}>{loading ? <span class="spin" /> : <RefreshCw />}</button>
          <button class="icon-btn" aria-label="اقفل اللوحة على هذا الجهاز" onClick={() => { dropKey(); setKey(null); setS(undefined); setProblem(undefined); }}><Lock /></button>
        </>
      } />
      <main class="page wide admin-board" key={round}>
        <div class="dots-rule" aria-hidden="true" />
        {problem && <p class="alert-box" role="alert">{PROBLEMS[problem] ?? 'تعذّر الوصول إلى رعد.'}</p>}
        <div class="board-cols">
          <div class="col">
            <NowCard s={s} health={health} onEndRest={async () => {
              try {
                await api.endRest();
                setS({ ...s, rest: null });
                flash('انتهت الاستراحة');
              } catch {
                flash('تعذّر ذلك. أعد المحاولة');
              }
            }} />
            {stats ? <>
              <StudentsCard r={stats} />
              <DailyCard r={stats} />
              <SyncsCard r={stats} />
              <HoursCard r={stats} />
              <VersionsCard r={stats} version={s.version} />
            </> : (
              <Card title="الإحصاء" index={2} icon={<Users aria-hidden="true" />}>
                {statsProblem
                  ? <p class="label" style={{ lineHeight: 1.8 }}>{statsProblem === 'NO_STATS' ? 'قاعدة الإحصاء غير مربوطةٍ برعد بعد (STATS في raad/wrangler.toml)، أو تعذّرت قراءتها الآن.' : 'تعذّرت قراءة الإحصاء الآن.'}</p>
                  : <p class="empty"><span class="spin" /></p>}
              </Card>
            )}
          </div>
          <div class="col">
            <PauseCard s={s} save={save} />
            <NoticeCard s={s} save={save} />
            <ReadingCard s={s} save={save} />
            <ForgetCard flash={flash} />
          </div>
        </div>
        <p class="on-bg-muted foot">في الإحصاء أعدادٌ لكل يوم لا تدلّ على أحد، ولكل طالبٍ دخل معرّفٌ مستعارٌ لرقمه مع يومَي أول دخوله وآخره. يُحذف إذا سجّل الخروج، أو بعد سنةٍ لا يدخل فيها.</p>
      </main>
      {toast && <div class="toast admin-toast" role="status">{toast}</div>}
    </>
  );
}

function Top({ end }: { end?: ComponentChildren }) {
  return (
    <header class="topbar wide">
      <div class="title">
        <p class="crumb">بوابة معلومات الطالب</p>
        <h1>لوحة المشرف</h1>
      </div>
      {end}
    </header>
  );
}

render(<App />, document.getElementById('admin')!);
