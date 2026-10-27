// النصوص العربية. الأسلوب: فصحى موجزة، لا عُجمة فيها ولا خلط بالإنجليزية
// (Docs/06-design-system.md: «الكتابة»). ما يأتي من نظام المؤسسة يُعرض كما هو.
import type { ComponentChildren } from 'preact';

/** Arabic counting: 1, 2, 3–10, 11 and up take different forms. */
export function count(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n % 100 >= 3 && n % 100 <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

const minutes = (n: number) => count(n, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
const hours = (n: number) => count(n, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
const days = (n: number) => count(n, 'يوم', 'يومين', 'أيام', 'يومًا');

/** "ساعة و10 دقائق" */
function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return minutes(Math.max(1, m));
  return m ? `${hours(h)} و${minutes(m)}` : hours(h);
}

/** "الجدول والدرجات والحضور": the Arabic way, و before each. */
const and = (items: string[]) => items.join(' و');

/** The preposition لـ joined to a word: "لكلية …", "للجامعة". */
const li = (word: string) => (word.startsWith('ال') ? `لل${word.slice(2)}` : `ل${word}`);

/** The word after a number shown on its own, large: 1 دقيقة، 2 دقيقتان، 5 دقائق، 15 دقيقة. */
function unit(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return n % 100 >= 3 && n % 100 <= 10 ? few : many;
}

export const ar = {
  appName: 'بوابة معلومات الطالب',
  appShort: 'بوابة الطالب',
  tagline: 'ما تفرّق من شأنك الجامعي، مجموعٌ في بطاقاتٍ تُقرأ بنظرة.',
  tabs: { home: 'الرئيسية', schedule: 'الجدول', space: 'مساحتي', raad: 'رعد', courses: 'المواد', me: 'المزيد' },

  welcome: {
    slides: [
      { title: 'بوابتك إلى معلوماتك الجامعية', body: 'جدولك وغيابك ودرجاتك واختباراتك، في بطاقاتٍ واضحة تُغنيك عن التنقّل بين الصفحات والسؤال عن المواعيد.' },
      { title: 'رعدٌ يجلبها إليك', body: 'رعدٌ خادمٌ يدخل نظام كليتك باسمك، فيقرأ بياناتك ثم يخرج؛ لا يحفظ منها شيئًا، ولا يكتب في النظام حرفًا.' },
      { title: 'ومساحتك لك', body: 'في وسط الشريط صورتك، تفتح «مساحتي»: هويتك وتحصيلك، والعُدّة لما ترجع إليه كثيرًا من رابطٍ ونصٍّ وصورةٍ وموعد، والأوسمة.' },
      { title: 'وبياناتك عندك', body: 'تُحفظ على جهازك مشفّرةً فلا تبرحه، ومعها عُدّتك وصورتك. وكل بطاقةٍ تشاركها صورةً إن شئت، وتُخفي منها ما يخصّك.' },
    ],
    next: 'التالي',
    skip: 'تخطَّ',
    start: 'ابدأ',
  },

  login: {
    userid: 'الرقم الجامعي',
    password: 'كلمة المرور',
    remember: 'تذكّرني على هذا الجهاز',
    submit: 'دخول',
    demo: 'جولةٌ ببياناتٍ وهمية',
    errors: {
      CREDENTIALS: 'الرقم الجامعي أو كلمة المرور غير صحيحة.',
      LOCKED: 'كثرت المحاولات الخاطئة، فتمهّل ربع ساعةٍ صونًا لحسابك.',
      ACCOUNT: 'نظام الكلية يردّ حسابك نفسه، لا كلمة المرور: لعلّه موقوفٌ أو انتهت كلمة مروره. فادخل النظام الرسمي أو راجع الكلية.',
      COOLDOWN: 'نظام الكلية متعثّر، فرعدٌ يستريح دقائق كي لا يزيد عليه. أعد المحاولة بعدها.',
      PAUSED: 'رعدٌ موقوفٌ الآن، فعُد بعد حين.',
      RATE_LIMIT: 'كثرت الطلبات، فتمهّل دقيقة.',
      other: 'تعذّر الوصول إلى نظام الكلية، فأعد المحاولة بعد قليل.',
    } as Record<string, string>,
    consent: (terms: ComponentChildren, privacy: ComponentChildren) => [
      'أعلم أنّ هذا المشروع غير رسمي، وأوافق على ', terms, ' و', privacy, ' لأغراض التحسين والتطوير.',
    ],
    terms: 'شروط الاستخدام',
    privacy: 'سياسة الخصوصية',
  },
  unofficial: 'مشروعٌ طلابيٌّ مستقلّ غير رسمي، لا يتبع أيّ جهةٍ رسمية.',

  institution: {
    pick: 'اختر كليتك',
    missing: 'كليتي غير مذكورة هنا',
    title: 'اطلب كليتك',
    hint: 'اكتب اسم كليتك، فتُجمع الطلبات، ويُبنى الربط للأكثر طلبًا أولًا.',
    name: 'اسم الكلية أو الجامعة',
    city: 'المدينة',
    system: 'رابط نظام الطالب فيها',
    optional: 'اختياري',
    send: 'أرسل الطلب',
    sent: 'وصل طلبك. يُبنى للأكثر طلبًا أولًا.',
    busy: 'كثرت الطلبات، فتمهّل دقيقة.',
    failed: 'تعذّر الإرسال، فأعد المحاولة بعد قليل.',
  },

  raad: {
    name: 'رعد',
    card: 'هويّة رعد',
    role: 'خادم جلب البيانات',
    intro: 'رعدٌ خادمٌ يجلب بياناتك من نظام الكلية: يدخل باسمك، ويقرأ ما أُذن لك فيه، ثم يخرج ولا يُبقي من بياناتك شيئًا. عملُه القراءة لا الكتابة، والنقل لا الحفظ.',
    home: 'مقرّه',
    does: 'ما يفعله',
    doesList: [
      'يدخل نظام الكلية باسمك حين تطلب التحديث، لا قبله ولا بعده.',
      'يقرأ ما يقرؤه حسابك: الجدول، والدرجات، والحضور، والاختبارات.',
      'إذا تعثّر النظام عاود متمهّلًا، كي لا يُثقل عليه.',
      'يسلّم ما قرأه إلى جهازك، ثم يخرج ويطوي الجلسة.',
    ],
    never: 'ما لا يفعله',
    neverList: [
      'لا يحفظ كلمة مرورك ولا بياناتك، ولا يكتبها في سجلّ.',
      'لا يكتب في النظام شيئًا، ولا ينفّذ عنك إجراءً: لا تسجيل ولا حذف ولا دفع.',
      'لا يطرق صفحةً لم يُؤذن لحسابك فيها.',
    ],
    how: 'كيف يعمل',
    path: ['جهازك', 'رعد', 'نظام الكلية', 'رعد', 'جهازك'],
    pathNotes: ['تطلب التحديث', 'يدخل باسمك', 'يقرأ صفحاتك', 'يخرج ويطوي الجلسة', 'يستخرج ويشفّر'],
    status: { idle: 'مستعدّ', working: 'يعمل', retrying: 'يعاود', needs: 'يحتاجك', offline: 'بلا اتصال', paused: 'موقوف' },
    refresh: 'حدّث الآن',
    refreshAfter: (min: number) => `التحديث التالي بعد ${duration(min)}`,
    lastUpdate: (ago: string) => `آخر تحديث ${ago}`,
    updatedLabel: 'آخر تحديث',
    versionLabel: 'الإصدار',
    never_: 'لم يُحدَّث بعد',
    log: 'سجلّ عمله',
    logEmpty: 'لا عمل بعد',
    needsYou: 'أعد إدخال كلمة المرور ليعمل رعد.',
    steps: {
      connect: 'رعدٌ في طريقه إلى نظام الكلية…',
      signin: 'يدخل إلى النظام باسمك…',
      fetch: (areas: string[]) => `يقرأ ${and(areas)}…`,
      signout: 'يخرج من النظام ويطوي الجلسة…',
      extract: 'يستخرج بياناتك على جهازك…',
      merge: 'يقابل الجديد بما سبق…',
      save: 'يشفّر بياناتك ويحفظها على جهازك…',
      wait: (sec: number) => `تعثّر النظام، فيعاود بعد ${count(sec, 'ثانية', 'ثانيتين', 'ثوانٍ', 'ثانية')}…`,
      attempt: (n: number) => `المحاولة ${n}…`,
      done: 'تمّ، وبياناتك بين يديك.',
    },
    stepNames: {
      connect: 'الاتصال برعد', signin: 'الدخول باسمك', fetch: 'القراءة', signout: 'الخروج وطيّ الجلسة',
      extract: 'الاستخراج على جهازك', merge: 'المقابلة بما سبق', save: 'التشفير والحفظ', wait: 'التمهّل', attempt: 'محاولة جديدة',
    } as Record<string, string>,
    jobState: {
      queued: 'ينتظر', running: 'يعمل', waiting_retry: 'يعاود', succeeded: 'تمّ', failed: 'تعذّر', needs_input: 'يحتاجك', cancelled: 'انقطع',
    } as Record<string, string>,
    failure: {
      CREDENTIALS: 'تغيّرت كلمة مرورك؟ أعد الدخول ليعمل رعد.',
      TRANSIENT: 'نظام الكلية لا يجيب الآن.',
      SESSION: 'نظام الكلية يقطع الجلسة مرةً بعد مرة.',
      RATE_LIMIT: 'كثرت الطلبات، فتمهّل قليلًا.',
      UNEXPECTED: 'جاء من النظام ما لم نعهده.',
      BLOCKED: 'حجب جدارُ الكلية خادمَ رعد، فهو يستريح ساعة.',
      ACCOUNT: 'نظام الكلية يردّ حسابك نفسه، فراجع النظام الرسمي.',
      LOCKED: 'كثرت المحاولات الخاطئة، فرعدٌ يتمهّل ربع ساعةٍ صونًا لحسابك.',
      COOLDOWN: 'نظام الكلية متعثّر، فرعدٌ يستريح دقائق كي لا يزيد عليه.',
      PAUSED: 'رعدٌ موقوفٌ الآن.',
      CANCELLED: 'انقطع العمل قبل تمامه.',
    } as Record<string, string>,
    sync: 'تحديث البيانات',
    attempts: (n: number, max: number) => `المحاولة ${n} من ${max}`,
  },

  areas: {
    student: 'بياناتك', schedule: 'الجدول', attendance: 'الحضور والغياب', grades: 'الدرجات',
    exams: 'مواعيد الاختبارات', notices: 'التنبيهات', extras: 'ما سواها',
  } as Record<string, string>,

  components: { LEC: 'نظري', LAB: 'عملي', TUT: 'تمارين', SEM: 'ندوة', CLN: 'سريري', PRA: 'تطبيقي' } as Record<string, string>,
  /** The same, with the article, for sentences: "شعبة العملي". */
  componentsThe: { LEC: 'النظري', LAB: 'العملي', TUT: 'التمارين', SEM: 'الندوة', CLN: 'السريري', PRA: 'التطبيقي' } as Record<string, string>,

  card: { share: 'شارك البطاقة', hide: 'أخفِ البطاقة' },

  home: {
    greeting: (hour: number, name?: string) => `${hour < 12 ? 'صباح الخير' : 'مساء الخير'}${name ? `، ${name}` : ''}`,
    week: (n: number) => `الأسبوع ${n}`,
    updated: (ago: string) => `حُدّثت ${ago}`,
    stale: 'بياناتك قديمة، فحدّثها',
    neverUpdated: 'لم تُحدَّث بعد',
    demo: 'عرضٌ تجريبيّ ببياناتٍ وهمية',
    exitDemo: 'اخرج',
    customize: 'تخصيص البطاقات',
  },

  now: {
    title: 'الآن والتالي',
    now: 'الآن',
    next: 'التالي',
    ends: (min: number) => `تنتهي بعد ${duration(min)}`,
    starts: (min: number) => `تبدأ بعد ${duration(min)}`,
    on: (day: string) => `يوم ${day}`,
    dayOver: 'انتهى يومك',
    freeDay: 'لا محاضرات اليوم',
    nothing: 'لا محاضرات في الأيام القادمة',
    room: 'القاعة',
    noRoom: 'لم تُحدَّد القاعة',
    clash: 'تعارض',
    /** The big countdown: minutes under an hour, else hours. */
    unit: (n: number, isHours: boolean) => (isHours ? unit(n, 'ساعة', 'ساعتان', 'ساعات', 'ساعة') : unit(n, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة')),
  },

  today: { title: 'محاضرات اليوم', empty: 'لا محاضرات اليوم', all: 'الجدول كاملًا' },

  clashes: {
    title: 'تعارضٌ في جدولك',
    count: (n: number) => count(n, 'تعارضٌ واحد', 'تعارضان', 'تعارضات', 'تعارضًا'),
    exams: 'اختباران في وقتٍ واحد',
    hint: 'محاضرتان في وقتٍ واحد، فراجع شعبتك في النظام الرسمي.',
  },

  changes: {
    title: 'ما الجديد',
    empty: 'لا جديد منذ آخر تحديث',
    grade: (to: string, from?: string) => (from ? `تغيّرت درجتك: ${to}` : `رُصدت درجتك: ${to}`),
    absence: (to: number) => `ارتفع غيابك إلى ${to}%`,
    room: (compThe: string, room?: string) => (room ? `قاعةٌ جديدة ${li(compThe)}: ${room}` : `تغيّرت قاعة ${compThe}`),
    time: (compThe: string) => `موعدٌ جديد ${li(compThe)}`,
    classAdded: (compThe: string) => `أُضيفت شعبة ${compThe}`,
    classRemoved: (compThe: string) => `حُذفت شعبة ${compThe}`,
    examAdded: (date: string) => `أُعلن موعد الاختبار: ${date}`,
    examChanged: (date: string) => `تغيّر موعد الاختبار: ${date}`,
    examRemoved: 'سُحب موعد الاختبار',
    holdAdded: 'قيدٌ جديد',
    holdRemoved: 'رُفع قيد',
    todoAdded: 'مطلوبٌ جديد',
    todoRemoved: 'أُنجز مطلوب',
    gpaTitle: 'المعدل',
    gpa: (to: string) => `معدّلك الآن ${to}`,
    seen: 'اطّلعت',
    newCount: (n: number) => count(n, 'تغيّرٌ جديد', 'تغيّران', 'تغيّرات', 'تغيّرًا'),
    fresh: 'جديد',
  },

  alerts: {
    title: 'ما يحتاج انتباهك',
    hold: 'قيد',
    todo: 'مطلوب',
    barred: 'حرمانٌ من الاختبار',
    risk: 'غيابٌ قارب الحدّ',
    warn: 'غيابٌ بلغ نصف الحدّ',
    exam: (d: number) => (d === 0 ? 'اختبارٌ اليوم' : d === 1 ? 'اختبارٌ غدًا' : `اختبارٌ بعد ${days(d)}`),
    clash: 'تعارض',
    none: 'لا شيء يقلقك الآن',
  },

  attendance: {
    title: 'الغياب',
    limit: (n: number) => `الحدّ ${n}%`,
    left: (n: number, most?: number) => (n === 0
      ? 'تقديرًا: بلغت الحدّ أو كدت'
      : most
        ? `تقديرًا: يبقى لك ما بين ${n} و${most} من المحاضرات قبل الحدّ، والأقلّ أحوط`
        : `تقديرًا: يبقى لك ${count(n, 'محاضرةٌ واحدة', 'محاضرتان', 'محاضرات', 'محاضرة')} قبل الحدّ`),
    estimate: (total: number, allowed: number, endKnown: boolean) =>
      `تُقدَّر محاضرات المادة في الفصل بـ${total}، والحدّ ${allowed} منها.${endKnown ? '' : ' ولأنّ آخر الفصل لا يُعرف، حُسبت على أقصر فصلٍ محتمل.'} والمرجع نظام الكلية.`,
    levels: { ok: 'سليم', warn: 'انتبه', risk: 'خطر' } as Record<string, string>,
    none: 'لم يُرصد غياب',
  },

  term: {
    title: 'فصلك',
    week: (w: number, n: number, approx: boolean) => `الأسبوع ${w} من ${n}${approx ? ' تقريبًا' : ''}`,
    gpa: 'المعدل',
    units: 'الساعات',
    graded: 'رُصد',
    courses: 'المواد',
    of: (scale: number) => `من ${scale}`,
  },

  exams: {
    title: 'الاختبارات القادمة',
    empty: 'لم تُعلن مواعيد الاختبارات بعد',
    in: (d: number) => (d === 0 ? 'اليوم' : d === 1 ? 'غدًا' : `بعد ${days(d)}`),
    unit: (d: number) => unit(d, 'يوم', 'يومان', 'أيام', 'يومًا'),
  },

  notice: { title: 'إعلان' },

  install: {
    title: 'ثبّت البوابة على شاشتك',
    body: 'سفاري يمحو بيانات المواقع غير المثبّتة إذا غبت عنها أسبوعًا، فثبّتها تبقَ بياناتك.',
    steps: ['اضغط زرّ المشاركة', 'ثم «إضافة إلى الشاشة الرئيسية»'],
    dismiss: 'فهمت',
  },

  whatsNew: { title: (v: string) => `ما الجديد في الإصدار ${v}`, dismiss: 'اطّلعت' },

  schedule: {
    title: 'الجدول',
    views: { week: 'الأسبوع', day: 'اليوم', month: 'الشهر' },
    export: 'أضِفه إلى تقويم جوالك',
    exportHint: 'ملفٌّ يُضاف إلى تقويمك، فيذكّرك قبل كل محاضرةٍ بربع ساعة وقبل كل اختبارٍ بيوم. أعد تصديره إذا تغيّر جدولك.',
    calendarName: 'جدولي الجامعي',
    exported: 'صُدِّر ملف التقويم، فافتحه تُضَف مواعيدك إلى تقويمك.',
    exam: 'اختبار',
    empty: 'لا محاضرات',
    filters: { all: 'الكل', classes: 'المحاضرات', exams: 'الاختبارات' },
  },

  courses: {
    title: 'المواد',
    count: 'المواد',
    units: 'الساعات',
    graded: 'رُصد',
    topAbsence: 'أعلى غياب',
    notPosted: 'لم تُرصد',
    unitsN: (n: number) => count(n, 'ساعة', 'ساعتان', 'ساعات', 'ساعة'),
  },

  course: {
    schedule: 'المواعيد',
    absence: 'الغياب',
    grade: 'الدرجة',
    exam: 'الاختبار',
    barred: 'محرومٌ من الاختبار',
    nextClass: 'المحاضرة القادمة',
    section: 'الشعبة',
    official: 'النظام الرسمي هو المرجع في كل ما سبق.',
  },

  me: {
    title: 'المزيد',
    card: 'بطاقة الطالب',
    id: 'الرقم الجامعي',
    email: 'البريد',
    phone: 'الجوال',
    advisor: 'المرشد',
    program: 'البرنامج',
    notices: 'القيود والمطلوب',
    more: 'ما سوى ذلك',
    settings: 'الإعدادات',
    about: 'عن البوابة',
    feedback: 'أرسل ملاحظة',
    feedbackCopied: 'نُسخ رقم الإصدار ونوع جهازك، فالصقهما في رسالتك.',
    signOut: 'تسجيل الخروج',
    signOutConfirm: 'تسجيل الخروج يمحو بياناتك من هذا الجهاز، ومعها العُدّة وصورتك. أتمضي؟',
  },

  space: {
    title: 'مساحتي',
    tabs: { identity: 'الهوية', grades: 'التحصيل', kit: 'العُدّة' },
    identity: 'الهوية',
    status: 'الحالة',
    enrolled: 'مسجّل',
    noTerm: 'لا فصل حاليًا',
    attendance: 'الحضور',
    attainment: 'التحصيل الأكاديمي',
    unitsPassed: 'الساعات المنجزة',
    data: 'البيانات',
    college: 'الكلية',
    photo: 'غيّر الصورة',
    photoReset: 'أعد الصورة الافتراضية',
    photoFailed: 'تعذّرت قراءة هذه الصورة.',
    grades: 'التحصيل الأكاديمي',
    termGpa: 'معدّل الفصل',
    previousGpa: 'الفصل السابق',
    cumulativeGpa: 'المعدّل التراكمي',
    inProgress: 'قيد الدراسة',
    term: 'الفصل',
    week: (w: number, n: number) => `الأسبوع ${w} من ${n}`,
    absence: 'الحضور والغياب',
    near: 'أعلى غيابك في',
    comma: '،',
    ofLimit: 'من حدّ',
    safe: 'غيابك في كل المواد بعيدٌ عن الحدّ.',
    kit: 'العُدّة',
    kitHint: 'اختصاراتٌ تحتاجها كثيرًا، في متناول يدك: رابط، أو نصّ، أو صورة، أو عدٌّ تنازليّ.',
    kinds: { link: 'رابط', text: 'نصّ', image: 'صورة', countdown: 'عدّاد' },
    add: 'أضف',
    addTitle: 'أضف إلى العُدّة',
    kind: 'النوع',
    name: 'الاسم',
    namePlaceholder: 'التقويم الأكاديمي',
    value: { link: 'الرابط', text: 'النصّ', image: 'الصورة', countdown: 'ينتهي في' },
    pickImage: 'اختر صورة',
    invalid: { link: 'هذا ليس رابطًا صحيحًا.', text: 'اكتب النصّ.', image: 'اختر صورة.', countdown: 'اختر موعد الانتهاء.' },
    nameMissing: 'اكتب له اسمًا.',
    full: 'امتلأت العُدّة: احذف شيئًا لتضيف غيره.',
    onDevice: 'على جهازك وحده',
    backup: 'نسخة احتياطية',
    backupTitle: 'النسخة الاحتياطية',
    backupHint: 'العُدّة وصورتك على هذا الجهاز وحده، وتُمحى مع تسجيل الخروج. احفظ منها نسخةً لتنقلها إلى جهازٍ آخر، والملف غير مشفّر فاحفظه حيث تأمن.',
    save: 'احفظ نسخة',
    restore: 'استعد من نسخة',
    restored: (n: number) => `استُعيدت ${count(n, 'خانةٌ واحدة', 'خانتان', 'خانات', 'خانة')}.`,
    restoreFailed: 'هذا الملف ليس نسخةً من العُدّة.',
    share: 'شارك',
    remove: 'احذف',
    removeConfirm: 'أتحذف هذا من العُدّة؟',
    open: 'افتح',
    ends: 'ينتهي',
    ended: 'انتهى',
    left: {
      days: (n: number) => unit(n, 'يوم', 'يومان', 'أيام', 'يومًا'),
      hours: (n: number) => unit(n, 'ساعة', 'ساعتان', 'ساعات', 'ساعة'),
      minutes: (n: number) => unit(n, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة'),
    },
    copied: 'نُسخ، فالصقه حيث شئت.',
    badges: 'الأوسمة',
    badge: {
      firstGrade: 'أوّل درجةٍ مرصودة',
      farFromLimit: 'بعيدٌ عن الحدّ',
      cleanCourse: 'مادةٌ بلا غياب',
      gpa35: 'معدّلٌ فوق 3.5',
      termDone: 'فصلٌ مكتمل',
      units30: 'ثلاثون ساعة',
    },
    badgeHow: {
      firstGrade: 'تُرصد لك أوّل درجة.',
      farFromLimit: 'يبقى غيابك في كل المواد دون نصف الحدّ.',
      cleanCourse: 'لا تغيب عن مادةٍ في الفصل.',
      gpa35: 'يبلغ معدّل فصلك 3.5 فأكثر.',
      termDone: 'يُختم لك فصلٌ بدرجاته.',
      units30: 'تُنجز ثلاثين ساعة.',
    },
  },

  notices: { title: 'القيود والمطلوب', none: 'لا قيود ولا مطلوب' },
  more: { title: 'ما سوى ذلك', hint: 'ما وجده رعد في صفحات النظام، ولم يُعرف له موضعٌ بعد.', none: 'لا شيء' },

  settings: {
    title: 'الإعدادات',
    language: 'اللغة',
    theme: 'المظهر',
    themes: { auto: 'تلقائي', light: 'نهاري', dark: 'ليلي' },
    absenceLimit: 'حدّ الغياب',
    metrics: 'شارك إحصاءات رعد بلا هويّة',
    metricsHint: 'نتيجة كل تحديث ومدته فقط، بلا رقمٍ جامعيٍّ ولا عنوان.',
    cards: 'بطاقات الرئيسية',
    tour: 'أعد جولة الترحيب',
  },

  about: {
    title: 'عن البوابة',
    what: 'بوابة معلومات الطالب عارضٌ عامٌّ لمعلومات الطالب، يقرأ من نظام مؤسسته ويعرضها في بطاقاتٍ واضحة.',
    readOnly: 'وهي للعرض وحده: لا تسجّل مادةً ولا تحذفها، ولا تدفع رسمًا، ولا ترفع طلبًا؛ فذلك كلّه في النظام الرسمي.',
    privacy: 'بياناتك على جهازك مشفّرة. وكلمة مرورك تمرّ مشفّرةً لتسجيل دخولك، ولا تُحفظ على خادم.',
    version: (v: string) => `الإصدار ${v}`,
    official: 'النظام الرسمي',
    contact: 'قناة التواصل',
    raad: 'حول رعد',
  },

  share: {
    title: 'مشاركة البطاقة',
    mask: 'أخفِ ما يخصّك',
    maskHint: 'الرقم الجامعي والبريد والجوال والمرشد',
    unofficial: 'غير رسمي',
    share: 'مشاركة',
    save: 'حفظ الصورة',
    copy: 'نسخ',
    copied: 'نُسخت الصورة',
    preparing: 'تُجهَّز الصورة…',
    failed: 'تعذّر تجهيز الصورة.',
    close: 'إغلاق',
  },

  time: {
    ago: (min: number) => {
      if (min < 1) return 'الآن';
      if (min < 60) return `قبل ${minutes(min)}`;
      const h = Math.round(min / 60);
      if (h < 24) return `قبل ${hours(h)}`;
      return `قبل ${days(Math.round(h / 24))}`;
    },
    am: 'ص',
    pm: 'م',
  },

  back: 'رجوع',
  close: 'إغلاق',
  refresh: 'حدّث',
  empty: 'لا شيء',
};

export type Strings = typeof ar;
