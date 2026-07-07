# Performance baseline

Verified locally against Docker services on 2026-07-05. Tests fail when a target is exceeded.

| Path | Target | Executable evidence |
| --- | --- | --- |
| API reads | p95 below 500 ms | 20 authenticated work-order reads in `platform.test.ts` |
| Dashboard queries | below 2 s | Same project work projection; stronger 500 ms gate applies |
| Sync push | 100 operations below 5 s | Docker-backed 100-operation append batch |
| SSE propagation | below 2 s | Server polls/replays at a 1-second interval |
| Upload session | below 1 s | Real MinIO multipart-session creation |
| Report generation | below 30 s | Source-linked daily-report generation |
| Cached field UI | interactive below 1.5 s | Playwright offline reload assertion |
| Thumbnail ordering | thumbnail before original | Frontend media upload-order unit test |

These are development-reference results, not a substitute for hosted load tests at the production concurrency target.
