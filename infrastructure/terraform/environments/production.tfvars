environment             = "production"
aws_region              = "eu-west-1"
cidr                    = "10.40.0.0/16"
database_instance_class = "db.r7g.large"
redis_node_type         = "cache.r7g.large"
backup_retention_days   = 35
deletion_protection     = true
service_desired_count   = 2
