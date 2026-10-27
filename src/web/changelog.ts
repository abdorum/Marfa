// What each version brought, in the student's words (CHANGELOG.md has the
// details). The newest version's entry shows once on the home board.
import type { Lang } from './i18n';

export interface ChangelogEntry {
  version: string;
  date: string;
  items: Record<Lang, string[]>;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.4.0',
    date: '2026-10-27',
    items: {
      ar: [
        'إن لم تجد كليتك في القائمة فاطلبها من صفحة الدخول، ويُبنى للأكثر طلبًا أولًا.',
        'تبويب رعد صار أخفّ: حاله وسجلّه. وتعريفه وطريقة عمله في «عن البوابة».',
        'صفحة الدخول أوجز، والموافقة في سطرٍ واحد.',
      ],
      en: [
        'If your college is not in the list, ask for it from the sign-in page; the most asked-for come first.',
        'The Raad tab is lighter: his state and log. Who he is and how he works are in About.',
        'A shorter sign-in page, with consent in one line.',
      ],
    },
  },
  {
    version: '1.3.0',
    date: '2026-10-27',
    items: {
      ar: [
        'لصاحب المشروع لوحةٌ يوقف منها رعدًا وينشر الإعلانات، ويرى كم طالبًا يستعمل البوابة كل يوم.',
        'ولذلك يُعدّ كل طالبٍ بمعرّفٍ مستعارٍ لا يُستخرج منه رقمه، ويُحذف إذا سجّل الخروج. والتفاصيل في سياسة الخصوصية.',
        'الإعلان يظهر بأسطره كما كُتبت.',
      ],
      en: [
        'The project’s owner has a page to pause Raad, post announcements, and see how many students use the portal each day.',
        'For that, each student is counted by a pseudonym that does not reveal the ID, deleted when they sign out. The privacy policy has the details.',
        'Announcements keep their lines as written.',
      ],
    },
  },
  {
    version: '1.2.1',
    date: '2026-10-26',
    items: {
      ar: [
        'نصوصٌ أوضح قراءةً في المظهرين: التسميات، والحالات، والروابط.',
        'المحاضرة المنتهية تبقى مقروءة، بحبرٍ أخفّ بدل أن تبهت كلها.',
        'رابط البوابة يظهر ببطاقةٍ وصورة حين تشاركه في المحادثات.',
      ],
      en: [
        'Clearer text in both themes: labels, states and links.',
        'A finished class stays readable, in a lighter ink instead of fading out.',
        'The portal link shows a card with a picture when you share it in chats.',
      ],
    },
  },
  {
    version: '1.2.0',
    date: '2026-10-26',
    items: {
      ar: [
        'هويةٌ جديدة: الطرفية الرملية. ألواحٌ هادئة على الرمل، لا سواد فيها.',
        'لكل مادةٍ لونٌ واضح في الجدول والغياب والتنبيهات، فتعرفها بنظرة.',
        'المحاضرة الجارية منقلبةٌ داكنة بسهمٍ بجانبها، والعدّ التنازلي على قرص ساعة.',
        'وضعٌ ليليٌّ جديد من الإعدادات: فحمٌ زيتونيٌّ مريح.',
      ],
      en: [
        'A new look: the sand terminal. Quiet panels on sand, nothing black.',
        'Each course has a clear color in the schedule, absences and alerts, so you know it at a glance.',
        'The class in progress is inverted with a pointer beside it, and the countdown sits on a dial.',
        'A new night theme in Settings: a restful charcoal olive.',
      ],
    },
  },
  {
    version: '1.1.0',
    date: '2026-10-26',
    items: {
      ar: [
        'إن غيّرت كلمة مرورك نسيها رعدٌ فورًا، فلا يُقفل حسابك بكلمةٍ قديمة.',
        'لا يُقال لك إن محاضراتك حُذفت إن غيّرت الكلية صفحاتها: تبقى بياناتك.',
        'رصيد الغياب أحذر: على أقصر فصلٍ محتمل، والأقلّ أحوط.',
        'رعدٌ أخفّ على نظام الكلية: يقرأ ما حان وقته، ويستريح إن تعثّر النظام.',
      ],
      en: [
        'If you change your password, Raad forgets the old one at once, so it cannot lock your account.',
        'If the college changes its pages, you are not told your classes were removed: your data stays.',
        'A more cautious absence budget: counted on the shortest likely term.',
        'Raad is lighter on the college system: he reads what is due, and rests when it struggles.',
      ],
    },
  },
  {
    version: '1.0.0',
    date: '2026-10-25',
    items: {
      ar: [
        'اسمٌ جديد وهويةٌ جديدة: بوابة معلومات الطالب.',
        'كل قسمٍ بطاقة، وكل بطاقةٍ تشاركها صورةً وتُخفي منها ما يخصّك.',
        'رعدٌ يُطلعك على كل خطوةٍ يخطوها، وله صفحةٌ تعرّفك به.',
        'الآن والتالي، وجدولٌ أسبوعيٌّ يكشف التعارض.',
        'رصيد الغياب تقديرًا، وما تغيّر منذ آخر تحديث.',
        'جدولك واختباراتك في تقويم جوالك بتنبيهاتها.',
        'بياناتك مشفّرةٌ على جهازك.',
      ],
      en: [
        'A new name and identity: Taleeb Portal.',
        'Every section is a card, and every card can be shared as a picture, personal details hidden.',
        'Raad tells you every step he takes, and has a page of his own.',
        'Now and next, and a weekly grid that shows clashes.',
        'An absence budget estimate, and what changed since the last refresh.',
        'Your schedule and exams in your phone’s calendar, with reminders.',
        'Your data is encrypted on your device.',
      ],
    },
  },
];
