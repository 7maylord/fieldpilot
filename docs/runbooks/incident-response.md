# Incident-response runbook

1. **Declare and triage:** assign incident lead, communications owner, severity,
   affected organizations, and whether confidentiality or integrity is at risk.
2. **Contain:** revoke sessions/credentials, isolate an ECS service, pause a
   queue, or block public ingress as narrowly as possible. Preserve offline
   evidence and do not purge unsynced client work.
3. **Diagnose:** correlate request IDs, audit events, Prometheus metrics,
   CloudWatch logs, queue state, deployment history, and database activity.
   Export evidence before changing it; never paste secrets or form data into chat.
4. **Recover:** prefer rolling rollback or forward repair. Restore PostgreSQL
   within the 5-minute RPO/60-minute RTO, workers within 30 minutes, and API
   within 60 minutes. Recover object versions when media was deleted/overwritten.
5. **Validate:** test tenant isolation, counts, checkpoints, audit/outbox
   continuity, objects, queues, and representative user journeys.
6. **Close:** communicate impact, retain the timeline, rotate exposed secrets,
   create owned actions, and run a blameless review for material incidents.

Security/privacy incidents also require the organization's legal notification
process. Do not promise a breach scope until evidence supports it.
