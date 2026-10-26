// The privacy policy and terms of use (Docs/18-legal-review.md). Every
// sentence must stay true to what the code does: a wrong privacy statement is
// worse than none. Update UPDATED with any change.
import type { Lang } from './index';

export const UPDATED = '2026-10-26';

export interface LegalDoc {
  title: string;
  sections: { h: string; p: string[] }[];
}

const privacyAr: LegalDoc = {
  title: 'سياسة الخصوصية',
  sections: [
    { h: 'من نحن', p: ['بوابة معلومات الطالب مشروعٌ طلابيٌّ فرديٌّ مجاني، ليس تابعًا لكلية البترجي الطبية ولا معتمدًا منها. والتواصل عبر قناة تيليجرام: t.me/ItsProf11'] },
    {
      h: 'البيانات التي نعالجها',
      p: [
        'الرقم الجامعي وكلمة المرور، لتسجيل دخولك في نظام الكلية فحسب.',
        'بياناتك كما يعرضها لك نظام الكلية: الاسم، والبريد، والهاتف، والمرشد، والجدول، والحضور، والدرجات، والاختبارات، والتنبيهات.',
        'وتعرض صفحات الكلية اسم مرشدك، وهو بيان شخصٍ غيرك: يبقى على جهازك كسائر بياناتك، ويُخفى من البطاقات المشاركة، ولا نستعمله في شيء.',
      ],
    },
    {
      h: 'كيف تُعالج',
      p: [
        'عند التحديث يسجّل رعدٌ دخولك في نظام الكلية عبر خادمٍ على Cloudflare في أمستردام بهولندا، بجوار خوادم نظام الكلية نفسه، ثم يعيد الصفحات إلى جهازك عبر اتصالٍ مشفّر، ويخرج من النظام.',
        'تُقرأ الصفحات وتُستخرج منها بياناتك على جهازك وحده.',
        'والأداة للعرض فقط: لا تكتب في نظام الكلية شيئًا، ولا تنفّذ عنك إجراءً.',
      ],
    },
    {
      h: 'ما يُحفظ على الخادم',
      p: [
        'لا تُحفظ كلمة مرورك ولا بياناتك على أي خادم، ولا تُكتب في أي سجلّ.',
        'عند إدخال كلمة مرورٍ خاطئة فقط: يُحفظ عدد المحاولات تحت معرّفٍ مستعارٍ لرقمك الجامعي، يُصنع بمفتاحٍ سرّيٍّ لا يملكه إلا خادم رعد، فلا يُستخرج منه رقمك. وذلك لإيقاف التخمين وحماية حسابك من القفل، ويُحذف تلقائيًا بعد 15 دقيقة، أو عند أول دخولٍ صحيح.',
        'ولكل تحديثٍ يُحصي الخادم نتيجته بلا هوية: رمز النتيجة، ورموز ما تعذّر من الأجزاء، ومدته مقرّبة. لا رقم جامعيًّا فيه، ولا عنوان IP، ولا معرّفًا مستعارًا؛ وغايته أن نعلم بعطل رعد قبل أن تخبرنا به. ويُحذف بعد 3 أشهر.',
        'ولا يحفظ الخادم سجلًّا لما يمرّ به: لا الطلبات، ولا الردود، ولا رسائل الأخطاء.',
        'وعند فتح التطبيق يسأل خادمَ رعد: هل هو موقوف؟ وهل من إعلان؟ ولا يحمل هذا السؤال شيئًا من بياناتك.',
        'وقد يعالج مزوّد الاستضافة Cloudflare عنوان IP لأغراضٍ تشغيلية وأمنية، ومنها تحديد عدد الطلبات من كل عنوان.',
      ],
    },
    {
      h: 'ما يُحفظ على جهازك',
      p: [
        'بياناتك الأكاديمية مشفّرةً، ومعها ما تغيّر منها في الأسبوعين الأخيرين، والفصول السابقة، حتى تسجيل الخروج.',
        'كلمة المرور مشفّرةً، فقط إذا اخترت «تذكّرني».',
        'تفضيلاتك، وسجلّ عمل رعد بخطواته وأوقاته، ولا بيانات شخصية فيه.',
        'والتشفير بمفتاحٍ لا يُستخرج من المتصفح. يحميها ممن يقرأ ملفات المتصفح، لا ممن يحمل جهازك مفتوحًا.',
      ],
    },
    {
      h: 'المشاركة',
      p: [
        'لا نبيع بياناتك ولا نشاركها مع أي جهة. لا إعلانات، ولا ملفات تتبّع، ولا أدوات تحليل من أطراف ثالثة.',
        'إذا شاركتَ بطاقةً صُنعت صورتها على جهازك، وتذهب حيث ترسلها أنت، وتستطيع أن تُخفي منها رقمك الجامعي وبريدك وجوالك.',
        'وملف التقويم الذي تصدّره يُصنع على جهازك كذلك، ولا يمرّ بخادم.',
      ],
    },
    {
      h: 'إحصاءات جهازك',
      p: ['معطّلةٌ افتراضيًا. إن فعّلتها من الإعدادات أرسل جهازك عن كل تحديث: نتيجته، وعدد محاولاته، ومدته، ورقم الإصدار. بلا رقمٍ جامعيٍّ ولا عنوان IP، وتُحذف بعد 3 أشهر.'],
    },
    { h: 'النقل خارج المملكة', p: ['المعالجة اللحظية تجري في هولندا، حيث تستضيف الكلية نظامها، تنفيذًا لطلبك بعرض بياناتك.'] },
    {
      h: 'الأساس والموافقة',
      p: [
        'لا تدخل حتى تعلّم بنفسك خانة الموافقة على هذه السياسة، ولك سحبها متى شئت بتسجيل الخروج.',
        'وإن كنت دون الثامنة عشرة فلا تدخل إلا بإذن وليّك.',
      ],
    },
    {
      h: 'حقوقك',
      p: [
        'الاطلاع: كل ما نعالجه عنك معروضٌ لك في التطبيق.',
        'الحذف: تسجيل الخروج يمحو كل شيءٍ من جهازك، ولا يبقى على الخادم شيءٌ يخصّك.',
        'ولأي طلبٍ أو شكوى: قناة التواصل أعلاه، ولك أن ترفع شكواك إلى الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا).',
      ],
    },
    { h: 'الحوادث', p: ['إن وقع تسريبٌ أو اختراق أبلغناك عبر قناة التواصل، وأبلغنا الجهات المختصة وفق نظام حماية البيانات الشخصية.'] },
    { h: 'التعديل', p: ['نعلن كل تعديلٍ في قناة التواصل، ويظهر تاريخ آخر تحديثٍ أسفل الصفحة.'] },
  ],
};

const privacyEn: LegalDoc = {
  title: 'Privacy policy',
  sections: [
    { h: 'Who we are', p: ['Taleeb Portal is a free, individual student project. It is not affiliated with or endorsed by Batterjee Medical College. Contact: Telegram t.me/ItsProf11'] },
    {
      h: 'What we process',
      p: [
        'Your student ID and password, only to sign you in to the college system.',
        'Your data as the college system shows it to you: name, email, phone, advisor, schedule, attendance, grades, exams and notices.',
        'The college pages show your advisor\'s name, which is someone else\'s data: it stays on your device like the rest, is hidden from shared cards, and is used for nothing.',
      ],
    },
    {
      h: 'How',
      p: [
        'When you refresh, Raad signs you in to the college system from a Cloudflare server in Amsterdam, the Netherlands, next to the college system\'s own servers, returns the pages to your device over an encrypted connection, and signs out.',
        'The pages are read and your data extracted on your device only.',
        'The tool only shows: it writes nothing to the college system and performs no action for you.',
      ],
    },
    {
      h: 'What is kept on the server',
      p: [
        'Your password and your data are never stored on any server or written to any log.',
        'Only after a wrong password: the number of attempts, under a pseudonym of your student ID made with a secret key only Raad\'s server holds, so your ID cannot be recovered from it. It stops guessing and protects your account from lockout, and is deleted automatically after 15 minutes, or at the first correct sign-in.',
        'For each refresh, the server counts its outcome with no identity: a result code, the codes of the parts that failed, and a rounded duration. No student ID, no IP address, no pseudonym; it is how we learn Raad is broken before you tell us. Deleted after 3 months.',
        'The server keeps no log of what passes through it: no requests, no replies, no error messages.',
        'When the app opens, it asks Raad\'s server whether it is paused and whether there is an announcement. That question carries none of your data.',
        'Our host, Cloudflare, may process IP addresses for operations and security, including limiting requests per address.',
      ],
    },
    {
      h: 'What is kept on your device',
      p: [
        'Your academic data, encrypted, with what changed in it over the last two weeks and your earlier terms, until you sign out.',
        'Your password, encrypted, only if you chose "Remember me".',
        'Your preferences, and Raad\'s log of steps and times, which holds no personal data.',
        'The encryption key cannot be exported from the browser. It protects against someone reading the browser\'s files, not against someone holding your unlocked device.',
      ],
    },
    {
      h: 'Sharing',
      p: [
        'We do not sell or share your data with anyone. No ads, no tracking cookies, no third-party analytics.',
        'When you share a card, its picture is made on your device and goes where you send it. You can hide your student ID, email and mobile from it.',
        'The calendar file you export is also made on your device and never passes through a server.',
      ],
    },
    {
      h: 'Your device\'s statistics',
      p: ['Off by default. If you turn them on in Settings, your device sends for each refresh: its outcome, attempts, duration and the app version. No student ID and no IP address. Deleted after 3 months.'],
    },
    { h: 'Transfer outside the Kingdom', p: ['The momentary processing happens in the Netherlands, where the college hosts its system, to carry out your request to see your data.'] },
    {
      h: 'Basis and consent',
      p: [
        'You cannot sign in until you tick the box agreeing to this policy yourself. You can withdraw it at any time by signing out.',
        'If you are under eighteen, sign in only with your guardian\'s permission.',
      ],
    },
    {
      h: 'Your rights',
      p: [
        'Access: everything we process about you is shown to you in the app.',
        'Deletion: signing out deletes everything from your device, and nothing about you remains on the server.',
        'For any request or complaint: the contact channel above. You may also complain to the Saudi Data and AI Authority (SDAIA).',
      ],
    },
    { h: 'Incidents', p: ['If a leak or breach happens, we will tell you through the contact channel and notify the competent authorities under the Personal Data Protection Law.'] },
    { h: 'Changes', p: ['Any change is announced in the contact channel, and the date of the last update appears at the end of this page.'] },
  ],
};

const termsAr: LegalDoc = {
  title: 'شروط الاستخدام',
  sections: [
    { h: 'ما هذه الأداة', p: ['أداةٌ مجانيةٌ غير رسمية تعرض بياناتك من نظام معلومات الطلاب في كلية البترجي الطبية عرضًا أوضح. ليست تابعةً للكلية ولا معتمدةً منها.'] },
    { h: 'للعرض فقط', p: ['لا تنفّذ الأداة أي إجراء: لا تسجيل مادة ولا حذفها، ولا دفع، ولا رفع طلب. ذلك كلّه في النظام الرسمي.'] },
    { h: 'المرجع الرسمي', p: ['نظام الكلية هو المرجع وحده. قد تتأخر الأداة أو تخطئ في قراءة البيانات، وما تقدّره من رصيد الغياب تقديرٌ لا سجلّ؛ فتحقّق من النظام الرسمي قبل أي قرارٍ مهم، كالغياب والدرجات ومواعيد الاختبارات.'] },
    {
      h: 'حسابك',
      p: [
        'استخدم حسابك أنت فقط، ولا تدخل بحساب غيرك ولو أذن لك.',
        'وأنت مسؤولٌ عن سرية كلمة مرورك، وعن التزامك بلوائح الكلية وأنظمتها.',
        'وقد تمنع لوائح الكلية إعطاء كلمة المرور لغير صاحبها، أو الدخول إلى نظامها من غير طريقه؛ فاقرأها، ولا تستعمل البوابة إن منعت ذلك. وتسجيل دخولك يظهر لنظام الكلية قادمًا من خادم رعد في هولندا.',
      ],
    },
    { h: 'الاستخدام المقبول', p: ['يُمنع تخمين كلمات المرور، أو محاولة الوصول إلى بيانات غيرك، أو إساءة استخدام الخدمة أو تعطيلها، أو نسخ الموقع لخداع الطلاب.'] },
    { h: 'بلا ضمان', p: ['تُقدَّم الأداة كما هي، دون أي ضمان، وقد تتوقف أو تتغير في أي وقت. ولا نتحمّل، في حدود ما تسمح به الأنظمة، ضررًا ينشأ عن الاعتماد عليها بدل النظام الرسمي.'] },
    { h: 'الإيقاف', p: ['قد نوقف الأداة أو نقيّد استخدامها في أي وقت، وتُوقف فورًا إذا طلبت الكلية ذلك.'] },
    { h: 'الأنظمة المطبّقة', p: ['تخضع هذه الشروط لأنظمة المملكة العربية السعودية.'] },
    { h: 'التواصل', p: ['قناة تيليجرام: t.me/ItsProf11'] },
  ],
};

const termsEn: LegalDoc = {
  title: 'Terms of use',
  sections: [
    { h: 'What this is', p: ['A free, unofficial tool that shows your data from the Batterjee Medical College student information system more clearly. It is not affiliated with or endorsed by the college.'] },
    { h: 'Read only', p: ['The tool performs no action: no enrolling or dropping a course, no payments, no requests. All of that stays in the official system.'] },
    { h: 'The official record', p: ['The college system is the only official record. The tool may lag or misread data, and its absence estimates are estimates, not records; check the official system before any important decision, such as absences, grades or exam times.'] },
    {
      h: 'Your account',
      p: [
        'Use only your own account. Do not sign in with anyone else\'s, even with their permission.',
        'You are responsible for keeping your password secret and for following the college\'s rules and regulations.',
        'The college\'s rules may forbid giving your password to anyone else, or reaching its system other than through it; read them, and do not use the portal if they forbid it. Your sign-in reaches the college system from Raad\'s server in the Netherlands.',
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
