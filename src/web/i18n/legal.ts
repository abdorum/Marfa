// The privacy policy and terms of use (Docs/18-legal-review.md). Every
// sentence must stay true to what the code does: a wrong privacy statement is
// worse than none. Update UPDATED with any change.
import type { Lang } from './index';

export const UPDATED = '2026-10-23';

export interface LegalDoc {
  title: string;
  sections: { h: string; p: string[] }[];
}

const privacyAr: LegalDoc = {
  title: 'سياسة الخصوصية',
  sections: [
    { h: 'من نحن', p: ['قاعدة الطالب (TIES) مشروع طلابي فردي مجاني، غير تابع لكلية البترجي الطبية ولا معتمد منها. التواصل عبر قناة تيليجرام: t.me/ItsProf11'] },
    {
      h: 'البيانات التي نعالجها',
      p: [
        'الرقم الجامعي وكلمة المرور، لتسجيل دخولك في نظام الكلية فقط.',
        'بياناتك كما يعرضها لك نظام الكلية: الاسم، والبريد، والهاتف، والمرشد، والجدول، والحضور، والدرجات، والاختبارات، والتنبيهات.',
      ],
    },
    {
      h: 'كيف تُعالج',
      p: [
        'عند التحديث يسجّل رعد دخولك في نظام الكلية عبر خادم على Cloudflare في أمستردام بهولندا، بجوار خوادم نظام الكلية نفسه، ثم يعيد الصفحات إلى جهازك عبر اتصال مشفّر.',
        'تُحلَّل الصفحات وتُحفظ على جهازك فقط.',
      ],
    },
    {
      h: 'ما يُحفظ على الخادم',
      p: [
        'لا تُحفظ كلمة مرورك ولا بياناتك على أي خادم، ولا تُسجَّل في أي سجل.',
        'عند إدخال كلمة مرور خاطئة فقط: تُحفظ بصمة مشفّرة (SHA-256) لرقمك الجامعي مع عدد المحاولات، لإيقاف التخمين وحماية حسابك من القفل. تُحذف تلقائياً بعد 15 دقيقة، أو عند أول دخول صحيح.',
        'قد يعالج مزوّد الاستضافة Cloudflare عنوان IP لأغراض تشغيلية وأمنية، ومنها تحديد عدد الطلبات من كل جهاز.',
      ],
    },
    {
      h: 'ما يُحفظ على جهازك',
      p: [
        'بياناتك الأكاديمية، حتى تسجيل الخروج.',
        'كلمة المرور، فقط إذا اخترت «تذكّرني»، مشفّرة بمفتاح لا يمكن استخراجه من المتصفح.',
      ],
    },
    {
      h: 'الإحصاءات المجهولة',
      p: ['معطّلة افتراضياً. إن فعّلتها من الإعدادات: نتيجة كل تحديث، وعدد محاولاته، ومدته، ورقم الإصدار. بلا رقم جامعي ولا عنوان IP، وتُحذف بعد 3 أشهر.'],
    },
    { h: 'المشاركة', p: ['لا نبيع بياناتك ولا نشاركها مع أي جهة. لا إعلانات، ولا ملفات تتبّع، ولا أدوات تحليل من أطراف ثالثة.'] },
    { h: 'النقل خارج المملكة', p: ['المعالجة اللحظية تجري في هولندا، حيث تستضيف الكلية نظامها، لتنفيذ طلبك بعرض بياناتك.'] },
    { h: 'الأساس والموافقة', p: ['تسجيل دخولك موافقة على هذه السياسة. يمكنك سحبها في أي وقت بتسجيل الخروج.'] },
    {
      h: 'حقوقك',
      p: [
        'الاطلاع: كل ما نعالجه عنك معروض لك في التطبيق.',
        'الحذف: تسجيل الخروج يحذف كل شيء من جهازك، ولا يبقى على الخادم شيء يخصّك.',
        'لأي طلب أو شكوى: قناة التواصل أعلاه.',
      ],
    },
    { h: 'الحوادث', p: ['إن وقع أي تسريب أو اختراق نبلغك عبر قناة التواصل، ونبلغ الجهات المختصة وفق نظام حماية البيانات الشخصية.'] },
    { h: 'التعديل', p: ['نعلن أي تعديل في قناة التواصل، ويظهر تاريخ آخر تحديث أسفل الصفحة.'] },
  ],
};

const privacyEn: LegalDoc = {
  title: 'Privacy policy',
  sections: [
    { h: 'Who we are', p: ['TIES is a free, individual student project. It is not affiliated with or endorsed by Batterjee Medical College. Contact: Telegram t.me/ItsProf11'] },
    {
      h: 'What we process',
      p: [
        'Your student ID and password, only to sign you in to the college system.',
        'Your data as the college system shows it to you: name, email, phone, advisor, schedule, attendance, grades, exams and notices.',
      ],
    },
    {
      h: 'How',
      p: [
        'When you refresh, Raad signs you in to the college system from a Cloudflare server in Amsterdam, the Netherlands, next to the college system\'s own servers, and returns the pages to your device over an encrypted connection.',
        'The pages are read and stored on your device only.',
      ],
    },
    {
      h: 'What is kept on the server',
      p: [
        'Your password and your data are never stored on any server or written to any log.',
        'Only after a wrong password: a hash (SHA-256) of your student ID with the number of attempts, to stop guessing and protect your account from lockout. It is deleted automatically after 15 minutes, or at the first correct sign-in.',
        'Our host, Cloudflare, may process IP addresses for operations and security, including limiting requests per device.',
      ],
    },
    {
      h: 'What is kept on your device',
      p: [
        'Your academic data, until you sign out.',
        'Your password, only if you chose "Remember me", encrypted with a key the browser cannot export.',
      ],
    },
    {
      h: 'Anonymous statistics',
      p: ['Off by default. If you turn them on in Settings: each refresh\'s outcome, attempts, duration and app version. No student ID and no IP address. Deleted after 3 months.'],
    },
    { h: 'Sharing', p: ['We do not sell or share your data with anyone. No ads, no tracking cookies, no third-party analytics.'] },
    { h: 'Transfer outside the Kingdom', p: ['The momentary processing happens in the Netherlands, where the college hosts its system, to carry out your request to see your data.'] },
    { h: 'Basis and consent', p: ['Signing in is consent to this policy. You can withdraw it at any time by signing out.'] },
    {
      h: 'Your rights',
      p: [
        'Access: everything we process about you is shown to you in the app.',
        'Deletion: signing out deletes everything from your device, and nothing about you remains on the server.',
        'For any request or complaint: the contact channel above.',
      ],
    },
    { h: 'Incidents', p: ['If a leak or breach happens, we will tell you through the contact channel and notify the competent authorities under the Personal Data Protection Law.'] },
    { h: 'Changes', p: ['Any change is announced in the contact channel, and the date of the last update appears at the end of this page.'] },
  ],
};

const termsAr: LegalDoc = {
  title: 'شروط الاستخدام',
  sections: [
    { h: 'ما هذه الأداة', p: ['أداة مجانية غير رسمية تعرض بياناتك من نظام معلومات الطلاب في كلية البترجي الطبية بطريقة أوضح. ليست تابعة للكلية ولا معتمدة منها.'] },
    { h: 'المرجع الرسمي', p: ['نظام الكلية هو المرجع الوحيد. قد تتأخر الأداة أو تخطئ في قراءة البيانات، فتحقق من النظام الرسمي قبل أي قرار مهم، كالغياب والدرجات ومواعيد الاختبارات.'] },
    {
      h: 'حسابك',
      p: [
        'استخدم حسابك أنت فقط. لا تدخل بحساب غيرك ولو بإذنه.',
        'أنت مسؤول عن سرية كلمة مرورك، وعن التزامك بلوائح الكلية وأنظمتها.',
      ],
    },
    { h: 'الاستخدام المقبول', p: ['يُمنع تخمين كلمات المرور، أو محاولة الوصول إلى بيانات غيرك، أو إساءة استخدام الخدمة أو تعطيلها، أو نسخ الموقع لخداع الطلاب.'] },
    { h: 'بلا ضمان', p: ['تُقدَّم الأداة كما هي، دون أي ضمان. قد تتوقف أو تتغير في أي وقت. لا نتحمّل، في حدود ما تسمح به الأنظمة، أي ضرر ينتج عن الاعتماد عليها بدل النظام الرسمي.'] },
    { h: 'الإيقاف', p: ['قد نوقف الأداة أو نقيّد استخدامها في أي وقت، وتُوقف فوراً إذا طلبت الكلية ذلك.'] },
    { h: 'الأنظمة المطبّقة', p: ['تخضع هذه الشروط لأنظمة المملكة العربية السعودية.'] },
    { h: 'التواصل', p: ['قناة تيليجرام: t.me/ItsProf11'] },
  ],
};

const termsEn: LegalDoc = {
  title: 'Terms of use',
  sections: [
    { h: 'What this is', p: ['A free, unofficial tool that shows your data from the Batterjee Medical College student information system more clearly. It is not affiliated with or endorsed by the college.'] },
    { h: 'The official record', p: ['The college system is the only official record. The tool may lag or misread data, so check the official system before any important decision, such as absences, grades or exam times.'] },
    {
      h: 'Your account',
      p: [
        'Use only your own account. Do not sign in with anyone else\'s, even with their permission.',
        'You are responsible for keeping your password secret and for following the college\'s rules and regulations.',
      ],
    },
    { h: 'Acceptable use', p: ['Do not guess passwords, try to reach anyone else\'s data, misuse or disrupt the service, or copy the site to deceive students.'] },
    { h: 'No warranty', p: ['The tool is provided as is, without any warranty. It may stop or change at any time. To the extent the law allows, we are not liable for any harm from relying on it instead of the official system.'] },
    { h: 'Suspension', p: ['We may stop or limit the tool at any time, and it will be stopped at once if the college asks.'] },
    { h: 'Governing law', p: ['These terms are governed by the laws of the Kingdom of Saudi Arabia.'] },
    { h: 'Contact', p: ['Telegram: t.me/ItsProf11'] },
  ],
};

export const LEGAL: Record<'privacy' | 'terms', Record<Lang, LegalDoc>> = {
  privacy: { ar: privacyAr, en: privacyEn },
  terms: { ar: termsAr, en: termsEn },
};
