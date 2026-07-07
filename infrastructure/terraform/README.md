# Terraform environments

The stack provisions an isolated VPC, PostgreSQL database, Redis replication
group, versioned private media bucket, ECS/Fargate cluster and services, ECR
repositories, load balancer, logs, and secrets for each environment.

Each environment uses a distinct CIDR, resource prefix, database, cache,
bucket, secret, and remote state key. Prefer a separate AWS account for
production. Never place credentials or secret values in tfvars or state.

Copy `environments/backend.hcl.example` outside the repository, replace its
state bucket and key, then run from this directory:

```sh
terraform -chdir=stack init -backend-config=/secure/development.backend.hcl
terraform -chdir=stack plan -var-file=../environments/development.tfvars
terraform -chdir=stack apply -var-file=../environments/development.tfvars
```

Use the matching tfvars and a unique state key for `test`, `staging`, and
`production`. Development and test start services at zero tasks so images can
be pushed before enabling them. Staging and production require immutable
`latest` images to exist before first apply; release automation should replace
the task-definition image digest for subsequent releases.

Production enables Multi-AZ PostgreSQL, Redis failover, 35-day database
backups, two application tasks, and deletion protection. TLS, DNS, SES domain
verification, paging receivers, and secret values remain account-specific and
must be supplied during environment bootstrap.
