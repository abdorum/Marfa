# Security

TIES (قاعدة الطالب) handles student credentials, so security reports are taken seriously.

## Reporting a vulnerability

Contact the maintainer privately on Telegram: https://t.me/ItsProf11

Please include steps to reproduce. You will get a reply within 7 days. Do not open a public issue for security problems.

## What the app does with data

- The edge function (`/api/v1/sync`) signs in to the college system on the student's behalf, reads a fixed allowlist of pages, signs out, and returns them. It stores nothing and logs no request content.
- Pages are parsed in the student's browser. Data is kept in IndexedDB on the device only.
- Credentials are kept on the device only when the student chooses "remember me", encrypted with a non-extractable AES-GCM key.
- Optional anonymous statistics contain no student ID, name or IP address.

Details: [Docs/09-security-privacy.md](Docs/09-security-privacy.md).
