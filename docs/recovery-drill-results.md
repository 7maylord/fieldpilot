# Recovery drill results

Date: 2026-07-05  
Environment: local Docker isolation  
Command: `infrastructure/scripts/recovery-drill.sh`

## Result

Passed in 115 seconds.

- A physical PostgreSQL base backup was restored into a separate PostGIS
  container using archived WAL.
- Recovery stopped at the named restore point: the pre-target marker existed
  and the post-target marker did not.
- Observed recovery point was the requested restore point (under the 5-minute
  RPO); measured database recovery was 115 seconds (under the 60-minute RTO).
- MinIO bucket versioning recovered an object after both overwrite and delete;
  the recovered bytes matched the original.
- Drill databases, containers, buckets, and temporary backup material were
  removed after verification. Primary PostgreSQL and MinIO remained healthy.

The script is repeatable local evidence. Hosted RDS automated-backup/PITR and
S3 recovery must also be exercised after each environment is provisioned and
at least quarterly; a local pass cannot prove an AWS account's IAM, lifecycle,
or backup configuration.
