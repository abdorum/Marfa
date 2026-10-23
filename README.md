# قاعدة الطالب · TIES

**TIES**: *Taleeb Information Enhanced System*، طرف ثالث لأنظمة معلومات الطلاب (3rd party for SISs).

واجهة سريعة للجوال لنظام الطلاب في كلية البترجي الطبية (PeopleSoft)، يعمل فيها **رعد**: بوت يتعامل مع النظام الأصلي ويتحمّل أعطاله نيابةً عن الطالب.
مشروع طلابي غير رسمي. الخطة الكاملة في [Docs/](Docs/README.md).

## كيف يعمل

```
المتصفح (PWA)                                    Cloudflare Pages Function
 الواجهة ◀─ النواة (core) ◀─ رعد ─▶ المحوّل ──POST /api/v1/sync──▶ edge ──▶ sis.bmc.edu.sa
           نموذج موحّد        مهام   (استخراج HTML               (دخول، صفحات مسموحة،
           واشتقاقات          ومحاولات  في المتصفح)                 خروج. بلا تخزين)
```

| المجلد | المحتوى |
|---|---|
| `src/core/` | نموذج البيانات الموحّد، والدمج، والاشتقاقات، ومحرك رعد. لا يعرف شيئاً عن PeopleSoft |
| `src/adapters/peoplesoft/` | `edge/` يعمل على Cloudflare، و `extract/` و `map.ts` و `client.ts` تعمل في المتصفح، و `pages.ts` القائمة المسموحة |
| `src/adapters/demo/` | طالب وهمي كامل للعرض والاختبارات (`/?demo`) |
| `src/adapters/official/` | المصدر الرسمي حسب وثيقة التكامل، جاهز ليوم توفّر واجهة من الكلية |
| `src/web/` | الواجهة |
| `functions/api/v1/` | دالة Cloudflare الوحيدة |
| `test/` | اختبارات الوحدات والعقود والحافة، وصفحات حقيقية مُجهّلة |

**تحذير مهم:** طلب أي صفحة غير مسموحة للطالب يُنهي جلسة PeopleSoft بالكامل.
لا تضف صفحة إلى `src/adapters/peoplesoft/pages.ts` قبل التأكد أنها تفتح لحساب طالب.

## التشغيل محلياً

```bash
npm install
```

```bash
npm run dev
```

يفتح على http://localhost:5173 ومعه `/api/v1` نفسها التي تعمل على Cloudflare. وللعرض بلا حساب: `/?demo`.

```bash
npm test
```

### التقاط صفحات حقيقية للاختبارات

افتح `http://localhost:5173/?capture` وسجّل الدخول. تُحفظ الصفحات في `test/fixtures/peoplesoft/` بعد استبدال الاسم والرقم الجامعي والبريد بقيم وهمية، وترفض الأداة حفظ أي صفحة بقي فيها شيء منها. راجع الملفات قبل أي commit.

## النشر على Cloudflare (مجاني)

الموقع مربوط بـ GitHub: كل `push` إلى `main` يبنيه Cloudflare Pages وينشره تلقائياً على https://ties-bmc.pages.dev (الإعدادات في `wrangler.toml`).

الجزء الذي يتصل بنظام الكلية (`/api/v1/*`) يعمل في Worker مستقل اسمه `ties-raad` (`raad/`)، مثبّت في أمستردام بجوار نظام الكلية لأن جدار الكلية يرفض بعض الدول (انظر `Docs/10-peoplesoft-notes.md`). الموقع يصل إليه داخلياً عبر service binding، وليس له رابط عام. لنشره يدوياً:

```bash
npm run deploy:raad
```

## إعدادات

- الصور الرمزية: ضع الصور في `public/avatars/`، وتُدرج تلقائياً عند التشغيل والبناء.
- الأيقونات: عدّل الألوان في `tools/make-icons.cjs` ثم `npm run icons`.
