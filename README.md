# قاعدة الطالب · TIES

**TIES**: *Taleeb Information Enhanced System*، طرف ثالث لأنظمة معلومات الطلاب (3rd party for SISs).

واجهة سريعة للجوال لنظام الطلاب في كلية البترجي الطبية (PeopleSoft): الجدول، الغياب، الدرجات، الاختبارات.
مشروع طلابي غير رسمي، يقرأ البيانات فقط ولا يعدّل شيئاً في حساب الطالب.

## كيف يعمل

```
متصفح الطالب ──POST /api/refresh──▶ Cloudflare Pages Function ──▶ sis.bmc.edu.sa
   ▲  (يحلل الصفحات ويعرضها)            (يسجّل الدخول، يجلب 4 صفحات، يسجّل الخروج)
   └──────────── HTML خام للصفحات ◀───────────┘
```

- `public/`: الواجهة (موقع ثابت). `parse.js` يحلل صفحات PeopleSoft داخل المتصفح.
- `functions/api/refresh.js`: الدالة الوحيدة على Cloudflare.
- `src/peoplesoft.js`: تسجيل الدخول وجلب الصفحات والتعافي من انتهاء الجلسة.
- لا شيء يُحفظ على السيرفر. كلمة المرور تبقى على جهاز الطالب إذا اختار «تذكّرني».

**تحذير مهم:** طلب أي صفحة غير مسموحة للطالب يُنهي جلسة PeopleSoft بالكامل.
لا تضف صفحة إلى `PAGES` في `src/peoplesoft.js` قبل التأكد أنها تفتح لحساب طالب.

## التشغيل محلياً

```bash
npm install
```

```bash
npm run dev:cf
```

يفتح على http://localhost:8788 ببيئة Cloudflare نفسها. (`npm run dev` بديل أخف على Node، المنفذ 3000.)

```bash
npm test
```

## النشر على Cloudflare Pages (مجاني)

```bash
npx wrangler login
```

```bash
npm run deploy
```

أول نشر ينشئ المشروع `qaedat-altalib` ويعطيك رابطاً مثل `https://qaedat-altalib.pages.dev`.

## إعدادات

- حد الغياب في الأشرطة: `ABSENCE_LIMIT` في `public/app.js` (حالياً 25٪، عدّله حسب لائحة الكلية).
- الأيقونات: عدّل الألوان في `tools/make-icons.cjs` ثم `npm run icons`.
