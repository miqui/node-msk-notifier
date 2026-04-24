locals {
  name_prefix = "node-msk-notifier"
  common_tags = {
    Project     = "node-msk-notifier"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ── ECR Repositories ───────────────────────────────────────────────────────────

resource "aws_ecr_repository" "api" {
  name                 = "${local.name_prefix}-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_repository" "consumer" {
  name                 = "${local.name_prefix}-consumer"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "consumer" {
  repository = aws_ecr_repository.consumer.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ── MSK Security Group ─────────────────────────────────────────────────────────

resource "aws_security_group" "msk" {
  name        = "${local.name_prefix}-msk-sg"
  description = "Allow EKS nodes to reach MSK brokers on port 9098 (IAM/TLS)"
  vpc_id      = var.vpc_id

  ingress {
    description     = "MSK IAM+TLS from EKS nodes"
    from_port       = 9098
    to_port         = 9098
    protocol        = "tcp"
    security_groups = [var.eks_node_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-msk-sg" })
}

# ── MSK Cluster ────────────────────────────────────────────────────────────────

resource "aws_msk_cluster" "main" {
  cluster_name           = local.name_prefix
  kafka_version          = var.kafka_version
  number_of_broker_nodes = length(var.private_subnet_ids)

  broker_node_group_info {
    instance_type   = var.msk_instance_type
    client_subnets  = var.private_subnet_ids
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.msk_broker_volume_size
      }
    }
  }

  client_authentication {
    sasl {
      iam = true
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  tags = local.common_tags
}

resource "aws_msk_configuration" "main" {
  name              = "${local.name_prefix}-config"
  kafka_versions    = [var.kafka_version]
  description       = "MSK configuration for node-msk-notifier"

  server_properties = <<-EOT
    auto.create.topics.enable=false
    default.replication.factor=2
    min.insync.replicas=1
    num.partitions=3
    log.retention.hours=72
    log.retention.bytes=1073741824
  EOT
}

# ── IRSA — IAM Role for Service Account ───────────────────────────────────────

data "aws_eks_cluster" "main" {
  name = var.eks_cluster_name
}

data "aws_iam_openid_connect_provider" "eks" {
  url = data.aws_eks_cluster.main.identity[0].oidc[0].issuer
}

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "irsa" {
  name = "${local.name_prefix}-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.eks.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(data.aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub" = "system:serviceaccount:${var.k8s_namespace}:${var.k8s_service_account}"
          "${replace(data.aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_policy" "app_permissions" {
  name        = "${local.name_prefix}-policy"
  description = "MSK connect + SNS publish for node-msk-notifier"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "MSKConnect"
        Effect = "Allow"
        Action = [
          "kafka-cluster:Connect",
          "kafka-cluster:DescribeCluster",
        ]
        Resource = aws_msk_cluster.main.arn
      },
      {
        Sid    = "MSKTopicReadWrite"
        Effect = "Allow"
        Action = [
          "kafka-cluster:ReadData",
          "kafka-cluster:WriteData",
          "kafka-cluster:CreateTopic",
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:AlterGroup",
          "kafka-cluster:DescribeGroup",
        ]
        Resource = [
          "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${local.name_prefix}/*/${var.kafka_topic_name}",
          "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:group/${local.name_prefix}/*/*",
        ]
      },
      {
        Sid    = "SNSPublishAndSubscribe"
        Effect = "Allow"
        Action = [
          "sns:Publish",
          "sns:Subscribe",
          "sns:ListSubscriptionsByTopic",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "app_permissions" {
  role       = aws_iam_role.irsa.name
  policy_arn = aws_iam_policy.app_permissions.arn
}
