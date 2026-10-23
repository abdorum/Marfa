# 10 · ملاحظات PeopleSoft (من الفحص الفعلي)

> سجل معرفة تقنية عن `sis.bmc.edu.sa`. تاريخ الفحص: 2026-10-22/23. حساب طالب سنة تأسيسية، الفصل `2701`.

## البيئة

| البند | القيمة |
|---|---|
| المنتج | PeopleSoft Campus Solutions، PeopleTools 8.5x (عليها حقوق Oracle 2000–2022) |
| الموقع | `hp` |
| النطاق | `https://sis.bmc.edu.sa` |
| واجهة الطالب | Classic، وليست Fluid |
| الصفحة بعد الدخول | `BMC_TECTO_MENU.BMC_MAJOR_PROMOTED.GBL?PAGE=BMC_ENRL_ANCEMNT` (إعلان التسجيل، صفحة مخصصة) |
| مسار المحتوى | `/psc/hp/EMPLOYEE/SA/c/<MENU>.<COMPONENT>.GBL` |

## الدخول

- `GET /psp/hp/?cmd=login&languageCd=ENG&`
- النموذج: `POST` إلى `/psp/hp/?&cmd=login&languageCd=ENG`
- الحقول: `lcsrf_token` (مخفي، يتغير كل مرة)، و `timezoneOffset` (القيمة `-180` للسعودية)، و `ptmode=f`، و `ptlangcd`، و `ptinstalledlang=ARA,ENG`، و `userid`، و `pwd`، و `ptlangsel`، و `Submit`.
- **النجاح:** ظهور كوكي `PS_TOKEN`، وهو HttpOnly، مع إعادة توجيه. **الفشل:** العودة إلى صفحة الدخول.
- الخروج: `GET /psp/hp/EMPLOYEE/SA/?cmd=logout`
- عند انتهاء الجلسة يُعاد التوجيه إلى `?cmd=expire` بعنوان "PeopleSoft session expired".

## ⚠️ السلوكيات الحرجة

1. **طلب مكوّن غير مسموح يقتل الجلسة.** جرّبنا `SSS_MY_ACAD` فأخذ 6.5 ثانية ثم رجع "UnAuthorized Token has been detected"، وبعده ردّت **كل** الصفحات بـ "not authorized"، ومنها Student Center الذي كان يعمل قبل لحظات.
2. **الجلسة المنتهية ترد بـ "You are not authorized for this page."** وليس بصفحة الدخول. لذلك يجب معاملة هذه الرسالة كجلسة منتهية.
3. الجلسة تنتهي بعد خمول قصير يُقدّر بـ 20 دقيقة. القيمة الدقيقة لم تُقس.
4. حالة الصفحة محفوظة على السيرفر (`ICStateNum` و `ICSID`). الإجراءات داخل المكوّن تتم بـ `POST` مع `ICAction=<id>`.

## الصفحات المؤكدة (القائمة المسموحة)

| المفتاح | المكوّن | الزمن | المحتوى |
|---|---|---|---|
| `center` | `SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL` | ~1s | جدول الأسبوع، والإيقافات، والمهام، والمرشد، والبريد، وروابط |
| `grades` | `SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL` | ~0.7s | درجات الفصل الافتراضي وإحصاءاته |
| `attendance` | `A_AD_MENU.A_SLF_ATT.GBL` (مخصصة) | ~0.7s | نسبة الغياب لكل مادة، فصلياً وسنوياً |
| `exams` | `SA_LEARNER_SERVICES.SSR_SSENRL_EXAM_L.GBL` | ~0.6s | "An exam schedule is not available for this term" |
| `weekly` | `SA_LEARNER_SERVICES.SSR_SSENRL_SCHD_W.GBL` | ~0.7s | شبكة أسبوعية من 8 صباحاً. **لا نستخدمها،** لأن Student Center أدق |

## الصفحات المرفوضة أو غير المؤكدة (لا تُطلب أبداً في التحديث العادي)

| المكوّن | النتيجة |
|---|---|
| `SSR_SSENRL_LIST` (My Class Schedule) | ❌ "not authorized" **أثناء جلسة سليمة** |
| `SSS_MY_ACAD` | ❌ **قتل الجلسة** |
| `SSF_SS_ACCT_SUMRY`، `SSS_MY_CRSEHIST`، `SSR_SSADVR`، `SSS_SRVCIND_SUMM`، `SSR_SSENRL_APPT`، `SSS_TODO_LIST`، `SSS_TSRQST_UNOFF`، `SSR_SSENRL_GBK` | ❓ طُلبت بعد قتل الجلسة، فالنتيجة غير حاسمة |

## ما يعرضه Student Center للطالب (اكتشاف آمن)

- **القائمة المنسدلة `DERIVED_SSS_SCL_SSS_MORE_ACADEMICS`:** Assignments (1025)، و Enrollment: Add (1005)، و Exam Schedule (1020)، و Grades (1030)، و Transfer Credit: Report (2025).
- **روابط بأوامر `ICAction`:** Enroll (`DERIVED_SSS_SCR_SSS_LINK_ANCHOR1`)، و My Results (`…ANCHOR7`)، و My Academics (`…ANCHOR2`)، و Pending Dues (`…ANCHOR9`)، و Weekly Schedule.
- **روابط `LMS$n`:** معرّفات مقررات بالشكل `2701-ELLEC-ASR-FAST-1-LEC-ICPY100-3211-FST-S1`، وهي غالباً معرّفات البلاك بورد. **فرصة** لروابط مباشرة من صفحة المادة إلى البلاك بورد.
- "Attendance Report" رابط مباشر إلى `A_AD_MENU.A_SLF_ATT.GBL`.

## معرّفات الحقول المستخدمة

**Student Center**
- `CLASS_NAME$span$N`: نص بالشكل `ICPY 100-PB1A<br>LEC (3211)`.
- `DERIVED_SSS_SCL_SSR_MTG_SCHED_LONG$N`: أسطر مكررة من `MoTuWeThSu 4:00PM - 5:00PM<br>Room  TBA`.
- `DERIVED_SSS_SCL_TITLE1$78$`: `<الاسم>'s Student Center`.
- `DERIVED_SSS_SCL_EMAIL_ADDR`، و `DERIVED_SSS_SCL_NAME_DISPLAY$span$0` (المرشد، والقيمة "None Assigned" إن لم يوجد).
- الإيقافات والمهام: لا معرّفات صفوف عندما تكون فارغة، فتُقرأ من النص بين `Holds Description` و `To Do List` و `Advisor`.

**Grades**
- `DERIVED_SSTSNAV_PERSON_NAME` (الاسم بالعربية)، و `DERIVED_REGFRM1_SSR_STDNTKEY_DESCR$11$` (الفصل).
- `CLS_LINK$N`، و `CLASS_TBL_VW_DESCR$N`، و `STDNT_ENRL_SSV1_UNT_TAKEN$N`، و `STDNT_ENRL_SSV1_CRSE_GRADE_OFF$N`، و `STDNT_ENRL_SSV1_GRADE_POINTS$N`.
- الإحصاءات: أزواج `DERIVED_SSS_GRD_DESCR1$N` (العنوان) و `STATS_ENRL$N` (القيمة).

**Attendance**
- `LS_SS_PERS_SRCH_NAME_DISPLAY` (الاسم بالإنجليزية)، و `A_SF_ATT_DER_TERM_BEGIN_DT` و `A_SF_ATT_DER_END_DATE`.
- `A_SLF_ATT_PR_VW_{ACAD_PROG,STRM,CRSE_ID,SUBJECT,CATALOG_NBR,DESCR,PER_ORG_DESCRSHORT,DESCR10}$N` للفصل.
- `A_SLF_ATT_YR_VW_*$N` للسنة.

## ما يجب التقاطه لاحقاً

| ماذا | متى | لماذا |
|---|---|---|
| تدفق تسجيل المواد (`SSR_SSENRL_CART` وما بعده) | فترة التسجيل القادمة | لإجراء `enroll.add` |
| جدول اختبارات منشور | عند نشره | للتحقق من مستخرج الاختبارات |
| صفحة درجات فيها أكثر من فصل | الفصل الثاني | فيها صفحة اختيار الفصل أولاً |
| إيقاف أو مهمة حقيقية | عند ظهورها على أي حساب | للتحقق من المستخرج النصي |
| Assignments و My Results و Pending Dues | بجلسة معزولة | لتوسيع القائمة المسموحة |
| مدة الخمول قبل انتهاء الجلسة | أي وقت | لضبط سياسة الجلسات |
