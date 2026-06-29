# Multipart evidence upload spike

This proof interrupts an S3-compatible multipart upload after its first part, resumes it with a new client, completes it, verifies the SHA-256 content, confirms only one object exists, and refuses to overwrite the immutable evidence key.

```bash
docker compose up -d
pnpm install
pnpm check
docker compose down -v
```
