variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

variable "eks_cluster_name" {
  description = "Name of the existing EKS cluster"
  type        = string
  default     = "notif-system"
}

variable "k8s_namespace" {
  description = "Kubernetes namespace where the service runs"
  type        = string
  default     = "notifications"
}

variable "k8s_service_account" {
  description = "Kubernetes service account name for IRSA"
  type        = string
  default     = "node-msk-notifier"
}

variable "vpc_id" {
  description = "VPC ID where MSK will be deployed (same VPC as EKS)"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for MSK brokers (minimum 2, different AZs)"
  type        = list(string)
}

variable "eks_node_security_group_id" {
  description = "Security group ID of the EKS node group (allows MSK access)"
  type        = string
}

variable "kafka_version" {
  description = "Apache Kafka version for MSK"
  type        = string
  default     = "3.6.0"
}

variable "msk_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.m5.large"
}

variable "msk_broker_volume_size" {
  description = "EBS volume size per MSK broker (GB)"
  type        = number
  default     = 100
}

variable "kafka_topic_name" {
  description = "Kafka topic name for notifications"
  type        = string
  default     = "notifications"
}
