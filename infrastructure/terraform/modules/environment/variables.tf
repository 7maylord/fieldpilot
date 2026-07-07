variable "environment" {
  type = string
  validation {
    condition     = contains(["development", "test", "staging", "production"], var.environment)
    error_message = "environment must be development, test, staging, or production"
  }
}

variable "aws_region" { type = string }
variable "cidr" { type = string }
variable "database_instance_class" { type = string }
variable "redis_node_type" { type = string }
variable "backup_retention_days" { type = number }
variable "deletion_protection" { type = bool }
variable "service_desired_count" { type = number }
