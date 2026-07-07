output "load_balancer_url" { value = "http://${aws_lb.this.dns_name}" }
output "database_endpoint" { value = aws_db_instance.this.endpoint }
output "database_master_secret_arn" { value = aws_db_instance.this.master_user_secret[0].secret_arn }
output "redis_endpoint" { value = aws_elasticache_replication_group.this.primary_endpoint_address }
output "media_bucket" { value = aws_s3_bucket.media.id }
output "application_secret_arn" { value = aws_secretsmanager_secret.application.arn }
output "repositories" { value = { for key, repository in aws_ecr_repository.application : key => repository.repository_url } }
