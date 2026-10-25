# 11 · Integration Contract (for the college IT department)

> This document is intentionally written in English so it can be handed to the IT team as-is.

## Purpose

Taleeb Portal (بوابة معلومات الطالب) currently reads student data from the PeopleSoft self-service pages on the student's behalf. The app is built so that this source can be replaced by an **official, read-only** interface without any change to the user interface. This document specifies the smallest interface that would allow that.

## What we ask for

- **Read-only** access, scoped to **the signed-in student's own records**.
- No staff data, no other students' data, no write access.
- Authentication through the college's existing identity provider (OIDC / SAML via Microsoft Entra ID or similar). The app never sees passwords once this is in place.

## Option A — REST API (preferred)

All endpoints are `GET`, return JSON, and are authorised by the student's OIDC access token (`Authorization: Bearer …`). The student is identified by the token, never by a parameter.

| Endpoint | Returns |
|---|---|
| `/v1/me` | Student: id, names (ar/en), program, email, advisor |
| `/v1/terms` | Terms: code, name, start/end dates, current flag |
| `/v1/terms/{code}/enrollments` | Enrolled sections with meeting patterns (days, start, end, room, date range) |
| `/v1/terms/{code}/attendance` | Per course: absence percentage, exam eligibility status |
| `/v1/terms/{code}/grades` | Per course: official grade, grade points, units; term GPA and unit totals |
| `/v1/terms/{code}/exams` | Per course: exam date, start, end, location |
| `/v1/notices` | Holds and to-do items |
| `/v1/events` *(optional)* | College events / academic calendar |

Response shapes map 1:1 to the app's canonical model (see `Docs/07-data-model.md`). Example:

```json
GET /v1/terms/2701/attendance
{
  "term": "2701",
  "asOf": "2026-10-15",
  "items": [
    { "course": "PYMT 101", "title": "Medical Terminology", "absencePct": 2.94, "examStatus": null }
  ]
}
```

PeopleSoft Integration Broker or REST Query Access Services (QAS) can expose these with existing PeopleSoft queries; no custom application is required.

### Wire format details

- Times are `"HH:MM"` (24-hour, local time). Days are numbers, `0` = Sunday … `6` = Saturday. Dates are `YYYY-MM-DD`.
- Course keys are `"SUBJECT CATALOG"`, e.g. `"PYBIO 101"`.
- Missing values are `null` or omitted, never empty strings.
- The exact TypeScript types are in `src/adapters/official/source.ts` (`ApiMe`, `ApiTerm`, `ApiEnrollment`, `ApiAttendance`, `ApiGrade`, `ApiExam`, `ApiNotices`). The adapter is already written and tested against a mock of this API; connecting it is configuration only.

## Option B — Read-only database views

If an API is not feasible, read-only views with **row-level filtering by the authenticated student** would work, exposed through a thin service owned by IT. We do **not** request direct database credentials.

| View | Key columns (PeopleSoft source) |
|---|---|
| `V_STUDENT_ENRL` | EMPLID, STRM, CLASS_NBR, SUBJECT, CATALOG_NBR, SSR_COMPONENT, CLASS_SECTION (STDNT_ENRL, CLASS_TBL) |
| `V_CLASS_MTG` | CLASS_NBR, STRM, MON…SUN, MEETING_TIME_START/END, FACILITY_ID (CLASS_MTG_PAT) |
| `V_STUDENT_ATT` | EMPLID, STRM, SUBJECT, CATALOG_NBR, absence % (A_SLF_ATT_PR_VW — custom) |
| `V_STUDENT_GRADES` | EMPLID, STRM, CRSE_GRADE_OFF, GRADE_POINTS, UNT_TAKEN (STDNT_ENRL) |
| `V_STUDENT_EXAMS` | EMPLID, STRM, CLASS_NBR, EXAM_DT, EXAM_START/END_TIME, FACILITY_ID |

## Non-functional expectations

- Latency under 1 second per endpoint at the 95th percentile.
- Rate limit is acceptable. The app caches on the device and refreshes at most every 15 minutes per student.
- The app keeps no student data on any server. Data lives only on the student's device.

## What IT gets in return

- Removal of automated sign-ins to PeopleSoft self-service, which today happen on students' behalf.
- A modern mobile front end for students at no cost to the college.
- Usage and reliability metrics from the pilot.
- Full source code access and a named maintainer.

## Read-only, permanently

Taleeb Portal is a viewer. It will not ask for write access of any kind: enrollment, payments and requests stay in the college's official system.

## Not only an API

The same contract can be served by a small read-only bridge hosted by the college in front of any data store it already has (a database view, MongoDB, PostgreSQL, even exported files). TIES never connects to a database directly.
