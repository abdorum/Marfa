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
