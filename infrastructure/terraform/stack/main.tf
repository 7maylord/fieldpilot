provider "aws" {
  region = var.aws_region
  default_tags { tags = { Application = "fieldpilot", Environment = var.environment } }
}

module "environment" {
  source                  = "../modules/environment"
  environment             = var.environment
  aws_region              = var.aws_region
  cidr                    = var.cidr
  database_instance_class = var.database_instance_class
  redis_node_type         = var.redis_node_type
  backup_retention_days   = var.backup_retention_days
  deletion_protection     = var.deletion_protection
  service_desired_count   = var.service_desired_count
}

output "environment" { value = var.environment }
output "load_balancer_url" { value = module.environment.load_balancer_url }
output "database_endpoint" { value = module.environment.database_endpoint }
output "database_master_secret_arn" { value = module.environment.database_master_secret_arn }
output "redis_endpoint" { value = module.environment.redis_endpoint }
output "media_bucket" { value = module.environment.media_bucket }
output "application_secret_arn" { value = module.environment.application_secret_arn }
output "repositories" { value = module.environment.repositories }
