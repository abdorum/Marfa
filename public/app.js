import { parsePages } from './parse.js';

// Bars are drawn against this absence percentage. Set it to the college's
// official limit.
const ABSENCE_LIMIT = 25;
const STALE_MS = 15 * 60 * 1000;

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const COMPONENTS = { LEC: 'محاضرة', LAB: 'عملي', TUT: 'تمارين', SEM: 'ندوة', CLN: 'سريري', PRA: 'تطبيقي' };
const SECTIONS = { center: 'الجدول', grades: 'الدرجات', attendance: 'الغياب', exams: 'الاختبارات' };
const COURSE_COLORS = ['#2f6db5', '#7b4fb0', '#1f8a70', '#c2571a', '#b0306a', '#3c7a2a', '#5b5bd6', '#a0632a', '#0e7c8c'];
const VIEWS = {
  home: ['الرئيسية', () => todayLabel()],
  schedule: ['الجدول الأسبوعي', () => data?.grades?.term || ''],
  attendance: ['الغياب', () => data?.attendance?.from ? `الفترة من ${data.attendance.from} إلى ${data.attendance.to}` : ''],
  grades: ['الدرجات', () => data?.grades?.term || ''],
  more: ['حسابي', () => data?.grades?.name || data?.attendance?.name || ''],
};

const $ = sel => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v; // CSSOM, allowed by the CSP
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
  return n;
};

// Storage can be unavailable (private mode); the app still works for the session.
const store = {
  get(area, key) { try { return JSON.parse(window[area].getItem(key)); } catch { return null; } },
  set(area, key, val) { try { window[area].setItem(key, JSON.stringify(val)); } catch { /* ignore */ } },
  del(key) { for (const a of ['localStorage', 'sessionStorage']) { try { window[a].removeItem(key); } catch { /* ignore */ } } },
};
let memoryCred = null;
const getCred = () => memoryCred || store.get('localStorage', 'bmc:cred') || store.get('sessionStorage', 'bmc:cred');
function saveCred(cred, remember) {
  memoryCred = cred;
  store.del('bmc:cred');
  store.set(remember ? 'localStorage' : 'sessionStorage', 'bmc:cred', cred);
}

let data = store.get('localStorage', 'bmc:data');
let view = 'home';
let selectedDay = new Date().getDay();
let refreshing = false;

// ---------- helpers ----------
function fmtTime(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60), m = String(min % 60).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'ص' : 'م'}`;
}
function todayLabel() {
  return new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
}
function ago(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'محدّث الآن';
  if (mins < 60) return `آخر تحديث قبل ${mins} دقيقة`;
  const h = Math.round(mins / 60);
  if (h < 24) return `آخر تحديث قبل ${h} ساعة`;
  return `آخر تحديث ${new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}`;
}
function titleFor(course) {
  const all = [...(data?.grades?.classes || []), ...(data?.attendance?.semester || [])];
  return all.find(c => c.course === course && c.title)?.title || '';
}
function colorFor(course) {
  let h = 0;
  for (const ch of course || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_COLORS[h % COURSE_COLORS.length];
}
function absenceLevel(pct) {
  const ratio = Math.min(pct / ABSENCE_LIMIT, 1);
  return { ratio, lvl: ratio >= 0.8 ? 'bad' : ratio >= 0.5 ? 'warn' : 'ok' };
}
const empty = msg => el('p', { class: 'empty' }, msg);
const sectionTitle = t => el('h2', { class: 'section-title' }, t);

function meetingsOn(day) {
  const items = [];
  const seen = new Set();
  for (const c of data?.center?.classes || []) {
    for (const m of c.meetings) {
      if (!m.days.includes(day)) continue;
      const key = `${c.course}|${c.component}|${m.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...c, ...m });
    }
  }
  return items.sort((a, b) => a.start - b.start);
}

// ---------- components ----------
function streamItem(i, state = '') {
  const title = titleFor(i.course);
  return el('article', { class: `card stream ${state}`, style: `--course:${colorFor(i.course)}` },
    el('div', { class: 'accent' }),
    el('div', { class: 'body' },
      el('div', {},
        state === 'now' ? el('span', { class: 'badge' }, 'الآن') : state === 'next' ? el('span', { class: 'badge' }, 'التالية') : null,
        el('h3', {}, title || i.course)),
      el('div', { class: 'time' }, fmtTime(i.start), el('span', {}, fmtTime(i.end))),
      el('div', { class: 'meta' },
        el('span', { class: 'chip code' }, `${i.course} · ${i.section}`),
        el('span', { class: 'chip' }, COMPONENTS[i.component] || i.component),
        el('span', { class: 'chip' }, i.room && i.room !== 'TBA' ? `القاعة ${i.room}` : 'القاعة غير محددة'))));
}

function courseCard(course, title, ...content) {
  return el('article', { class: 'card course', style: `--course:${colorFor(course)}` },
    el('div', { class: 'banner-img' }, el('span', { class: 'chip code' }, course)),
    el('div', { class: 'content' }, el('h3', {}, title || course), ...content));
}

function absenceCard(r) {
  const { ratio, lvl } = absenceLevel(r.absence);
  const card = courseCard(r.course, r.title,
    el('div', { class: 'row' }, el('span', { class: 'muted' }, 'نسبة الغياب'), el('span', { class: 'pct' }, `${r.absence}%`)),
    el('div', { class: 'bar', role: 'img', 'aria-label': `نسبة الغياب ${r.absence}٪` },
      el('i', { style: `width:${Math.max(ratio * 100, r.absence > 0 ? 3 : 0)}%` })),
    r.examStatus ? el('p', { class: 'muted' }, `حالة الاختبار: ${r.examStatus}`) : null);
  card.classList.add(`lvl-${lvl}`);
  return card;
}

// ---------- views ----------
function renderHome() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = meetingsOn(now.getDay()).filter(i => i.end > nowMin);
  const parts = [];

  parts.push(sectionTitle('محاضرات اليوم'));
  if (!data.center) parts.push(empty('لم نتمكن من جلب الجدول بعد.'));
  else if (today.length) {
    const nextIdx = today.findIndex(i => i.start > nowMin);
    parts.push(el('div', { class: 'list' }, today.map((i, idx) =>
      streamItem(i, i.start <= nowMin ? 'now' : idx === nextIdx ? 'next' : ''))));
  } else {
    let d = now.getDay(), next = [];
    for (let k = 1; k <= 7 && !next.length; k++) { d = (now.getDay() + k) % 7; next = meetingsOn(d); }
    parts.push(empty(next.length
      ? `لا محاضرات متبقية اليوم. أول محاضرة قادمة يوم ${DAYS[d]} الساعة ${fmtTime(next[0].start)}.`
      : 'لا توجد محاضرات في جدولك.'));
  }

  const att = [...(data.attendance?.semester || [])];
  const alerts = att.filter(r => absenceLevel(r.absence).lvl !== 'ok').sort((a, b) => b.absence - a.absence);
  if (alerts.length) {
    parts.push(sectionTitle('تنبيهات الغياب'));
    parts.push(el('div', { class: 'courses' }, alerts.map(absenceCard)));
  }

  const maxAbs = att.reduce((m, r) => Math.max(m, r.absence), 0);
  parts.push(sectionTitle('نظرة سريعة'));
  parts.push(el('div', { class: 'tiles' },
    el('div', { class: 'tile' }, el('b', {}, String(data.grades?.classes?.length ?? data.center?.classes?.length ?? '—')), el('span', {}, 'مواد هذا الفصل')),
    el('div', { class: 'tile' }, el('b', {}, data.grades?.gpa || '—'), el('span', {}, 'المعدل الفصلي')),
    el('div', { class: 'tile' }, el('b', {}, att.length ? `${maxAbs}%` : '—'), el('span', {}, 'أعلى نسبة غياب')),
    el('div', { class: 'tile' }, el('b', {}, String(meetingsOn(now.getDay()).length)), el('span', {}, 'محاضرات اليوم'))));

  if (data.exams?.exams?.length) {
    parts.push(sectionTitle('الاختبارات'));
    parts.push(el('div', { class: 'courses' }, data.exams.exams.slice(0, 3).map(examCard)));
  }

  const p = data.center?.profile;
  if (p?.holds?.length || p?.todos?.length) {
    parts.push(sectionTitle('تنبيهات من الكلية'));
    parts.push(el('div', { class: 'list' },
      (p.holds || []).map(h => el('div', { class: 'card lvl-bad' }, el('b', {}, 'إيقاف (Hold): '), h)),
      (p.todos || []).map(t => el('div', { class: 'card' }, el('b', {}, 'مطلوب منك: '), t))));
  }
  $('#view-home').replaceChildren(...parts);
}

function renderSchedule() {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  $('#days').replaceChildren(...DAYS_SHORT.map((name, d) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + d);
    return el('button', {
      class: `day${d === selectedDay ? ' active' : ''}${d === today.getDay() ? ' today' : ''}`,
      'aria-pressed': d === selectedDay ? 'true' : 'false',
      'aria-label': DAYS[d],
      onclick: () => { selectedDay = d; renderSchedule(); },
    }, el('b', {}, name), el('small', {}, String(date.getDate())), el('span', { class: `dot${meetingsOn(d).length ? '' : ' none'}` }));
  }));
  $('#day-title').textContent = selectedDay === today.getDay() ? `اليوم · ${DAYS[selectedDay]}` : DAYS[selectedDay];

  const list = $('#day-list');
  if (!data.center) return list.replaceChildren(empty('لم نتمكن من جلب الجدول بعد. اضغط زر التحديث في الأعلى.'));
  const items = meetingsOn(selectedDay);
  if (!items.length) return list.replaceChildren(empty(`لا توجد محاضرات يوم ${DAYS[selectedDay]}`));
  const isToday = selectedDay === today.getDay();
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const nextIdx = isToday ? items.findIndex(i => i.start > nowMin) : -1;
  list.replaceChildren(...items.map((i, idx) => streamItem(i,
    !isToday ? '' : i.end <= nowMin ? 'past' : i.start <= nowMin ? 'now' : idx === nextIdx ? 'next' : '')));
}

function examCard(x) {
  return courseCard(x.course, x.title || titleFor(x.course),
    el('dl', { class: 'kv' },
      el('dt', {}, 'التاريخ'), el('dd', {}, x.date),
      x.time ? [el('dt', {}, 'الوقت'), el('dd', {}, x.time)] : null,
      x.room ? [el('dt', {}, 'المكان'), el('dd', {}, x.room)] : null));
}

function renderExams() {
  const x = data.exams;
  const list = $('#exam-list');
  if (!x) return list.replaceChildren(empty('لم نتمكن من جلب جدول الاختبارات بعد.'));
  if (!x.exams.length) return list.replaceChildren(empty('لم يُنشر جدول الاختبارات لهذا الفصل بعد.'));
  list.replaceChildren(...x.exams.map(examCard));
}

function renderAttendance() {
  const a = data.attendance;
  const list = $('#att-list');
  $('#att-note').textContent = `الشريط مرسوم على أساس حد ${ABSENCE_LIMIT}٪ من الغياب.`;
  if (!a) return list.replaceChildren(empty('لم نتمكن من جلب الغياب بعد.'));
  const rows = [...a.semester, ...a.yearly];
  if (!rows.length) return list.replaceChildren(empty('لا توجد بيانات غياب مسجّلة حتى الآن.'));
  list.replaceChildren(...rows.sort((x, y) => y.absence - x.absence).map(absenceCard));
}

function renderGrades() {
  const g = data.grades;
  const list = $('#grades-list');
  const tiles = $('#grades-summary');
  if (!g) {
    tiles.replaceChildren();
    return list.replaceChildren(empty('لم نتمكن من جلب الدرجات بعد.'));
  }
  const units = g.classes.reduce((s, c) => s + (c.units || 0), 0);
  const graded = g.classes.filter(c => c.grade).length;
  tiles.replaceChildren(
    el('div', { class: 'tile' }, el('b', {}, g.gpa || '—'), el('span', {}, 'المعدل الفصلي')),
    el('div', { class: 'tile' }, el('b', {}, String(units)), el('span', {}, 'الساعات المسجلة')),
    el('div', { class: 'tile' }, el('b', {}, `${graded}/${g.classes.length}`), el('span', {}, 'مواد رُصدت درجاتها')),
    el('div', { class: 'tile' }, el('b', {}, g.stats?.['Units Toward GPA / Passed'] || '—'), el('span', {}, 'ساعات مجتازة')));
  list.replaceChildren(...g.classes.map(c => courseCard(c.course, c.title,
    el('div', { class: 'row' },
      el('span', { class: 'muted' }, c.units ? `${c.units} ساعات` : 'بدون ساعات معتمدة'),
      c.grade ? el('span', { class: 'grade' }, c.grade) : el('span', { class: 'grade pending' }, 'لم تُرصد')))));
}

function renderMore() {
  const p = data.center?.profile || {};
  const name = data.grades?.name || data.attendance?.name || '—';
  const rows = [
    ['الاسم', name],
    data.attendance?.name && data.attendance.name !== name ? ['الاسم (EN)', data.attendance.name] : null,
    p.email ? ['البريد', p.email] : null,
    p.phone ? ['الجوال', p.phone] : null,
    p.advisor ? ['المرشد الأكاديمي', p.advisor] : null,
    ['آخر تحديث', data.fetchedAt ? new Date(data.fetchedAt).toLocaleString('ar-SA-u-ca-gregory-nu-latn') : '—'],
  ].filter(Boolean);
  $('#view-more').replaceChildren(
    sectionTitle('معلوماتي'),
    el('div', { class: 'card' }, el('dl', { class: 'kv' }, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]))),
    sectionTitle('روابط'),
    el('div', { class: 'list' },
      el('a', { class: 'card link', href: 'https://sis.bmc.edu.sa/psp/hp/?cmd=login&languageCd=ENG&', target: '_blank', rel: 'noopener' }, 'فتح نظام الكلية الأصلي (SIS) ↗'),
      el('button', { class: 'card danger', onclick: logout }, 'تسجيل الخروج ومسح البيانات من الجهاز')),
    el('p', { class: 'fine', style: 'margin-top:16px' }, 'قاعدة الطالب مشروع طلابي غير رسمي، غير تابع لكلية البترجي الطبية. البيانات تُقرأ فقط ولا يُعدَّل أي شيء في حسابك.'));
}

let renderedDay = new Date().getDay();
function render() {
  if (!data) return;
  // Past midnight, jump the day picker to the new day.
  if (new Date().getDay() !== renderedDay) selectedDay = renderedDay = new Date().getDay();
  $('#status').textContent = refreshing ? 'جارٍ التحديث…' : ago(data.fetchedAt);
  const [title, sub] = VIEWS[view];
  $('#page-title').textContent = view === 'home' && (data.center?.firstName || data.attendance?.name)
    ? `مرحباً ${data.center?.firstName || data.attendance.name.split(' ')[0]}` : title;
  $('#page-sub').textContent = sub();
  renderHome();
  renderSchedule();
  renderExams();
  renderAttendance();
  renderGrades();
  renderMore();
}

function banner(msg) {
  const b = $('#banner');
  b.textContent = msg || '';
  b.hidden = !msg;
}

// ---------- data ----------
async function refresh(cred = getCred()) {
  if (!cred || refreshing) return false;
  refreshing = true;
  $('#refresh').classList.add('spinning');
  if (data) render();
  try {
    const res = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cred),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      store.del('bmc:cred'); memoryCred = null;
      showLogin('الرقم الجامعي أو كلمة المرور غير صحيحة.');
      return false;
    }
    if (res.status === 429) { banner('محاولات كثيرة خلال وقت قصير، انتظر دقائق ثم حاول مجدداً.'); return false; }
    if (res.status === 409) return false;
    if (!res.ok) {
      banner(data ? 'نظام الكلية لا يستجيب الآن، نعرض آخر بيانات محفوظة.' : 'نظام الكلية لا يستجيب الآن، حاول بعد قليل.');
      return false;
    }
    // The server returns raw pages; they are parsed here, on the device.
    const parsed = parsePages(body.pages);
    const errors = { ...(body.errors || {}), ...parsed.errors };
    // Keep the previous copy of any section PeopleSoft failed to return.
    const merged = { ...(data || {}), ...parsed.data, errors, fetchedAt: body.fetchedAt };
    for (const k of Object.keys(SECTIONS)) if (!parsed.data[k] && data?.[k]) merged[k] = data[k];
    data = merged;
    store.set('localStorage', 'bmc:data', data);
    const failed = Object.keys(errors).map(k => SECTIONS[k]).filter(Boolean);
    banner(failed.length ? `تعذّر تحديث: ${failed.join('، ')}. نعرض آخر نسخة محفوظة.` : '');
    return true;
  } catch {
    banner(data ? 'لا يوجد اتصال، نعرض آخر بيانات محفوظة.' : 'لا يوجد اتصال بالإنترنت.');
    return false;
  } finally {
    refreshing = false;
    $('#refresh').classList.remove('spinning');
    if (data) render();
  }
}

// ---------- screens ----------
function showLogin(error) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  const e = $('#login-error');
  e.textContent = error || '';
  e.hidden = !error;
}
function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  render();
}
function switchView(name) {
  view = name;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.view === name);
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${name}`;
  render();
  window.scrollTo(0, 0);
}
function logout() {
  store.del('bmc:cred'); store.del('bmc:data');
  memoryCred = null; data = null;
  showLogin();
}

$('#login-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target;
  const cred = { userid: f.userid.value.trim(), pwd: f.pwd.value };
  const btn = f.querySelector('button');
  btn.disabled = true; btn.classList.add('loading');
  $('#login-error').hidden = true;
  data = null;
  const ok = await refresh(cred);
  btn.disabled = false; btn.classList.remove('loading');
  if (ok) {
    saveCred(cred, f.remember.checked);
    f.pwd.value = '';
    showApp();
  } else if (!$('#login').hidden && $('#login-error').hidden) {
    showLogin($('#banner').textContent || 'تعذّر الدخول، حاول مجدداً.');
  }
});
$('#refresh').addEventListener('click', () => refresh());
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => switchView(b.dataset.view));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && data && Date.now() - Date.parse(data.fetchedAt) > STALE_MS) refresh();
});
setInterval(() => { if (data && !document.hidden) render(); }, 60000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Cached data shows instantly; the network refresh follows.
if (data && getCred()) { showApp(); refresh(); }
else if (getCred()) { showLogin(); refresh().then(ok => ok && showApp()); }
else showLogin();
