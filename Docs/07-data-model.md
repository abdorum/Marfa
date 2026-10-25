# 07 · نموذج البيانات الموحّد

هذا النموذج هو **العقد بين المصدر والواجهة**. كل محوّل، أيًّا كان مصدره، يُنتج هذا الشكل نفسه ([20-adapters.md](20-adapters.md)). ويُربط بمعياري OneRoster وiCalendar، فما يغطيانه نسمّيه بأسمائهما قدر الإمكان، وما لا يغطيانه (الحضور، والحرمان، والقيود) امتداد خاص بنا.

## اللقطة (Snapshot)

الكود في `src/core/model.ts`، وهو المرجع عند أي خلاف مع هذه الوثيقة.

```ts
interface Snapshot {
  schemaVersion: 2;
  source: SourceId;                // 'peoplesoft' | 'official' | 'demo'، ولاحقًا 'file' و'ics'…
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
  provenance: Record<DataArea, Provenance>;
  archive: TermRecord[];           // الفصول السابقة، الأحدث أولًا
  changes: Change[];               // ما غيّرته التحديثات في أسبوعين، الأحدث أولًا
}

// مجال البيانات: جزءٌ من اللقطة يُحدَّث وحده (Docs/17)
type DataArea = 'student' | 'schedule' | 'attendance' | 'grades' | 'exams' | 'notices' | 'extras';

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
  end?: string;                    // إن عرفه المصدر. في PeopleSoft لا يُعرف، فيُستعمل طول الفصل المعتاد من ملف المؤسسة
  current: boolean;
}

interface Course {
  key: string;                     // "PYBIO 101": الرمز كاملًا (normalizeCourseKey)
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
- إذا انتقل المصدر إلى فصلٍ جديد، حُفظ الفصل السابق كاملًا في `archive` قبل أن يُستبدل.
- وإن بقي الفصل نفسه قُوبلت اللقطة الجديدة بالسابقة، وأُضيف ما تغيّر إلى `changes`، ويبقى أسبوعين.
- عند تغيير `schemaVersion` تُطبَّق دالة ترحيل (`migrateSnapshot`)، فلا يفقد أحد بياناته. والإصدار 1 يُرحَّل إلى 2.

## الأرشيف والتغيّرات

```ts
interface TermRecord {             // فصلٌ انتقل عنه المصدر
  term: Term;
  courses: Course[]; sections: Section[]; attendance: AttendanceRecord[];
  grades: GradeRecord[]; termStats: TermStats[]; exams: Exam[];
  archivedAt: string;
}

type Change = { id: string; at: string } & (
  | { kind: 'grade'; courseKey: string; from?: string; to: string }
  | { kind: 'absence'; courseKey: string; from: number; to: number }
  | { kind: 'room' | 'time' | 'class-added' | 'class-removed'; courseKey: string; component: string }
  | { kind: 'exam-added' | 'exam-changed' | 'exam-removed'; courseKey: string; date?: string }
  | { kind: 'hold-added' | 'hold-removed' | 'todo-added' | 'todo-removed'; title: string }
  | { kind: 'gpa'; from?: number; to: number }
);
```

## الاشتقاقات (`src/core/derive/`)

| الدالة | الناتج |
|---|---|
| `academicWeek` / `termProgress` | رقم الأسبوع، وموضع الطالب من الفصل للمسطرة |
| `meetingsOn` / `withStates` | محاضرات يومٍ بحالاتها: انتهت، الآن، التالية |
| `nowAndNext` | الجارية وما بقي منها، والتالية وما بقي إليها، وهل انتهى اليوم |
| `weekGrid` | الأسبوع أيامًا وساعات، والمتداخل جنبًا إلى جنب ومعلَّمًا |
| `clashes` | محاضرتان أو اختباران في وقتٍ واحد |
| `attendanceLevel` | `ok` أو `warn` أو `risk` |
| `absenceBudget` | كم محاضرةً يستطيع الطالب أن يغيبها بعدُ، تقديرًا لا سجلًّا |
| `alerts` | الحرمان، والقيود، والغياب، والتعارض، والاختبارات القريبة، والمطلوب |
| `courseList` / `courseView` | المواد بمكوّناتها (نظري، عملي…)، وكل ما يخصّ المادة |
| `courseColors` | لونٌ ثابتٌ لكل مادة، لا يتكرر ما اتسعت اللوحة |
| `diffSnapshots` | ما تغيّر بين لقطتين من الفصل نفسه |

وملف التقويم (`src/core/ics.ts`) يحوّل الجدول والاختبارات إلى iCalendar، بتنبيهٍ قبل كل محاضرةٍ بربع ساعة، وقبل كل اختبارٍ بيوم.
