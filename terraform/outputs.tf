output "msk_bootstrap_brokers_iam" {
  description = "MSK bootstrap brokers for IAM auth (port 9098) — use as MSK_BROKERS"
  value       = aws_msk_cluster.main.bootstrap_brokers_sasl_iam
}

output "msk_cluster_arn" {
  description = "MSK cluster ARN"
  value       = aws_msk_cluster.main.arn
}

output "irsa_role_arn" {
  description = "IRSA role ARN — add to k8s/serviceaccount.yaml annotation"
  value       = aws_iam_role.irsa.arn
}

output "ecr_api_url" {
  description = "ECR repository URL for the API image"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_consumer_url" {
  description = "ECR repository URL for the consumer image"
  value       = aws_ecr_repository.consumer.repository_url
}
