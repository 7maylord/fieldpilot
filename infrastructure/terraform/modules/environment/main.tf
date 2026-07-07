data "aws_availability_zones" "available" { state = "available" }

locals {
  name = "fieldpilot-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
  tags = { Application = "fieldpilot", Environment = var.environment, ManagedBy = "terraform" }
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_hostnames = true
  tags                 = merge(local.tags, { Name = local.name })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = local.tags
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.cidr, 4, count.index)
  map_public_ip_on_launch = true
  tags                    = merge(local.tags, { Name = "${local.name}-public-${count.index + 1}" })
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.cidr, 4, count.index + 2)
  tags              = merge(local.tags, { Name = "${local.name}-private-${count.index + 1}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = local.tags
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name   = "${local.name}-alb"
  vpc_id = aws_vpc.this.id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_security_group" "application" {
  name   = "${local.name}-application"
  vpc_id = aws_vpc.this.id
  ingress {
    from_port       = 3000
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_security_group" "data" {
  name   = "${local.name}-data"
  vpc_id = aws_vpc.this.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.application.id]
  }
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.application.id]
  }
  tags = local.tags
}

resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
  tags       = local.tags
}

resource "aws_db_instance" "this" {
  identifier                  = local.name
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = var.database_instance_class
  allocated_storage           = 20
  max_allocated_storage       = 100
  db_name                     = "fieldpilot"
  username                    = "fieldpilot_admin"
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [aws_security_group.data.id]
  backup_retention_period     = var.backup_retention_days
  deletion_protection         = var.deletion_protection
  skip_final_snapshot         = !var.deletion_protection
  final_snapshot_identifier   = var.deletion_protection ? "${local.name}-final" : null
  storage_encrypted           = true
  multi_az                    = var.environment == "production"
  tags                        = local.tags
}

resource "aws_elasticache_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = local.name
  description                = "FieldPilot ${var.environment} queue and cache"
  engine                     = "redis"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.environment == "production" ? 2 : 1
  automatic_failover_enabled = var.environment == "production"
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.data.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  tags                       = local.tags
}

resource "aws_s3_bucket" "media" {
  bucket_prefix = "${local.name}-media-"
  force_destroy = !var.deletion_protection
  tags          = local.tags
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_ecs_cluster" "this" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = local.tags
}

resource "aws_ecr_repository" "application" {
  for_each             = toset(["frontend", "backend"])
  name                 = "${local.name}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = local.tags
}

resource "aws_cloudwatch_log_group" "application" {
  for_each          = toset(["frontend", "api", "worker", "scheduler"])
  name              = "/fieldpilot/${var.environment}/${each.key}"
  retention_in_days = var.environment == "production" ? 90 : 14
  tags              = local.tags
}

resource "aws_secretsmanager_secret" "application" {
  name = "${local.name}/application"
  tags = local.tags
}

resource "aws_lb" "this" {
  name               = local.name
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  tags               = local.tags
}

resource "aws_lb_target_group" "application" {
  for_each    = { frontend = 3000, api = 3001 }
  name        = "${local.name}-${each.key}"
  port        = each.value
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.this.id
  health_check { path = each.key == "api" ? "/api/v1/health" : "/" }
  tags = local.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.application["frontend"].arn
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.application["api"].arn
  }
  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_task_definition" "application" {
  for_each                 = { frontend = 3000, api = 3001, worker = 0, scheduler = 0 }
  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  container_definitions = jsonencode([{
    name             = each.key
    image            = "${aws_ecr_repository.application[each.key == "frontend" ? "frontend" : "backend"].repository_url}:latest"
    essential        = true
    command          = each.key == "worker" ? ["node", "dist/entrypoints/worker.js"] : each.key == "scheduler" ? ["node", "dist/entrypoints/scheduler.js"] : null
    portMappings     = each.value == 0 ? [] : [{ containerPort = each.value, protocol = "tcp" }]
    environment      = [{ name = "NODE_ENV", value = var.environment == "production" ? "production" : "development" }]
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.application[each.key].name, awslogs-region = var.aws_region, awslogs-stream-prefix = each.key } }
  }])
  tags = local.tags
}

resource "aws_ecs_service" "application" {
  for_each        = aws_ecs_task_definition.application
  name            = each.key
  cluster         = aws_ecs_cluster.this.id
  task_definition = each.value.arn
  desired_count   = var.service_desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.application.id]
    assign_public_ip = true
  }
  dynamic "load_balancer" {
    for_each = contains(["frontend", "api"], each.key) ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.application[each.key].arn
      container_name   = each.key
      container_port   = each.key == "frontend" ? 3000 : 3001
    }
  }
  depends_on = [aws_lb_listener.http, aws_iam_role_policy_attachment.ecs_execution]
  tags       = local.tags
}
