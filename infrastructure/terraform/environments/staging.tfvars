environment             = "staging"
aws_region              = "eu-west-1"
cidr                    = "10.30.0.0/16"
database_instance_class = "db.t4g.small"
redis_node_type         = "cache.t4g.small"
backup_retention_days   = 7
deletion_protection     = true
service_desired_count   = 1
