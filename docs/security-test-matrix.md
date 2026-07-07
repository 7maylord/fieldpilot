# Security test matrix

Phase 8 security gates are exercised by `backend/test/integration/platform.test.ts` unless noted otherwise.

| Control | Evidence |
| --- | --- |
| Cross-tenant isolation | Every tenant table is force-RLS enabled; Prisma and raw-SQL reads/writes are tested across two organizations. |
| IDOR | Unknown asset identifiers return 404; external members cannot access project media without explicit project access. |
| CSRF | Authenticated state-changing requests without the matching double-submit token return 403. |
| XSS | API responses use JSON, React renders text with escaping, and frontend CSP blocks foreign scripts plus object/frame embedding. Next.js inline bootstrap remains allowed. |
| Injection | UUID route/query parsing rejects SQL-shaped identifiers; raw SQL tenant tests use parameterized tagged templates. |
| Signed URLs | Signatures are short-lived and credential-free in `s3.service.test.ts`; unauthorized external users receive 403. |
| Malicious files | A ClamAV-compatible infected stream is quarantined and cannot receive a download URL. |
| Revoked session | A revoked session cookie receives 401. |
| Revoked membership | An authenticated user with revoked membership receives 403 for organization data. |
| Rate limiting | Repeated health requests eventually receive 429. |

The API also applies Helmet headers; the frontend applies CSP, referrer, permissions, and content-type policies.
