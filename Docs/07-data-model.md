# 07 · نموذج البيانات الموحّد

هذا النموذج هو **العقد بين المصدر والواجهة**. كل محوّل، سواء PeopleSoft أو الرسمي أو التجريبي، يُنتج هذا الشكل نفسه.

## اللقطة (Snapshot)

```ts
interface Snapshot {
  schemaVersion: 1;
  source: 'peoplesoft' | 'official' | 'demo';
  student: Student;
  terms: Term[];
  courses: Course[];               // مفتاح المادة: "PYBIO 101"
  sections: Section[];             // شعبة مسجّلة: محاضرة أو عملي
  attendance: AttendanceRecord[];
  grades: GradeRecord[];
  termStats: TermStats[];
  exams: Exam[];
  holds: Notice[];
  todos: Notice[];
  extras: ExtraBlock[];            // كل ما اكتُشف ولا مكان له بعد
  provenance: Record<SectionKey, Provenance>;
}

type SectionKey = 'student' | 'schedule' | 'attendance' | 'grades' | 'exams' | 'notices' | 'extras';

interface Provenance {
  status: 'fresh' | 'stale' | 'error' | 'missing';
  fetchedAt?: string;              // ISO
  error?: 'SESSION' | 'TIMEOUT' | 'PARSE' | 'UPSTREAM' | 'UNAVAILABLE';
}
```

## الكيانات

```ts
interface Student {
  id: string;                      // الرقم الجامعي
  name: { ar?: string; en?: string };
  firstName: { ar?: string; en?: string };
  program?: string;                // FAST
  institution: string;             // Batterjee Medical College
  email?: string;
  phone?: string;
  advisor?: string;
  photoUrl?: string;               // لاحقاً، إن توفر
}

interface Term {
  code: string;                    // "2701"
  name: string;                    // "First Semester 2026-2027"
  start?: string;                  // ISO date — يُستخدم لحساب رقم الأسبوع
  end?: string;
  current: boolean;
}

interface Course {
  key: string;                     // "PYBIO 101"
  subject: string;                 // "PYBIO"
  catalog: string;                 // "101"
  title: string;                   // "Human Biology" — كما في المصدر، بلا ترجمة آلية
  units?: number;
  lmsId?: string;                  // معرّف البلاك بورد إن وُجد
}

interface Section {
  courseKey: string;
  termCode: string;
  section: string;                 // "PBAB"
  component: 'LEC' | 'LAB' | 'TUT' | 'SEM' | 'CLN' | string;
  classNbr: string;                // "3456"
  meetings: Meeting[];
}

interface Meeting {
  days: number[];                  // 0 = الأحد … 6 = السبت
  start: number;                   // دقائق منذ منتصف الليل
  end: number;
  room?: string;                   // undefined بدلاً من "TBA"
  from?: string; to?: string;      // نطاق تواريخ إن وُجد
}

interface AttendanceRecord {
  courseKey: string;
  termCode: string;
  scope: 'semester' | 'year';
  absencePct: number;
  examStatus?: string;             // كما في المصدر
  period?: { from: string; to: string };
}

interface GradeRecord {
  courseKey: string;
  termCode: string;
  grade?: string;                  // undefined = لم تُرصد
  points?: number;
  units?: number;
}

interface TermStats {
  termCode: string;
  gpa?: number;
  unitsTaken?: number;
  unitsPassed?: number;
  unitsInProgress?: number;
  raw: Record<string, string>;     // كل الإحصاءات كما هي
}

interface Exam {
  courseKey: string;
  termCode: string;
  date: string;                    // ISO
  start?: number; end?: number;
  room?: string;
}

interface Notice {                 // للإيقافات والمهام المطلوبة
  kind: 'hold' | 'todo';
  title: string;
  detail?: string;
  due?: string;
}
```

## الكتل المرنة (Extras)

```ts
interface ExtraBlock {
  id: string;                      // بصمة ثابتة: "center:DERIVED_X" أو "events:EVT_GRID"
  title: string;                   // العنوان الأصلي من المصدر
  kind: 'table' | 'fields' | 'list' | 'link';
  columns?: string[];
  rows?: string[][];
  fields?: { label: string; value: string }[];
  href?: string;
  firstSeen: string;               // متى ظهرت أول مرة
  lastSeen: string;
}
```

### سجل الترقية (`registry.json`)

```json
{
  "events:BMC_EVENTS_GRID": {
    "section": "events",
    "title": { "ar": "فعاليات الكلية", "en": "College events" },
    "template": "calendar",
    "columns": { "date": "Event Date", "title": "Event", "place": "Location" }
  }
}
```

إذا كانت بصمة الكتلة في السجل، تُعرض بالقالب والعنوان المترجم في قسم خاص بها. وإلا تبقى في "المزيد" كما هي.

## الدمج

- كل `sync` يُنتج `Partial<Snapshot>` ومعه `provenance` للأقسام التي حاولها.
- القسم الناجح **يستبدل** القديم بالكامل، فلا دمج على مستوى الصفوف. هذا يمنع بقاء صفوف حُذفت من المصدر.
- القسم الفاشل **يبقى كما هو** وتتغير حالته إلى `stale` مع ذكر الخطأ.
- `extras`: تُحدَّث `lastSeen` للموجود. الكتلة التي غابت في تحديثين ناجحين متتاليين تُحذف.
- عند تغيير `schemaVersion` تُطبَّق دالة ترحيل (migration)، وإن لم توجد تُمسح اللقطة ويُعاد الجلب.

## الاشتقاقات (core/derive)

| الدالة | الناتج |
|---|---|
| `academicWeek(term, now)` | رقم الأسبوع منذ `term.start`، وهو الرقم الضخم في الملف |
| `todayMeetings(snapshot, now)` | محاضرات اليوم مع حالاتها: انتهت، الآن، التالية |
| `nextMeeting(snapshot, now)` | المحاضرة القادمة ولو في يوم آخر |
| `alerts(snapshot, prefs, now)` | إيقافات، وغياب ≥ 50% من الحد، واختبار خلال 7 أيام |
| `courseView(snapshot, key)` | كل ما يخص مادة واحدة، لصفحة المادة |
| `attendanceLevel(pct, limit)` | `ok` أو `warn` أو `risk` |
