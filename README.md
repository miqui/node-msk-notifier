# node-msk-notifier

Real-time notification service built on Node.js, AWS MSK (Kafka), and SNS. A Fastify API receives notification requests and publishes them to a Kafka topic on MSK. A KafkaJS consumer reads from that topic and delivers messages via AWS SNS. Both components run as separate deployments on EKS.

---

## Architecture

```
Client
  │  POST /notifications   X-API-Key: <key>
  ▼
API (Fastify, EKS)  ──────────────►  MSK (Kafka, IAM auth, port 9098)
  │  POST /subscriptions             │
  ▼                                  ▼
SNS (subscribe)             Consumer (KafkaJS, EKS)
                                     │
                                     ▼
                                   SNS (publish)
                                     │
                            email / SMS / SQS / Lambda / HTTP
```

---

## Prerequisites

- Node.js 22 LTS
- pnpm 9.12.0 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Docker 24+
- AWS CLI v2 configured with credentials
- kubectl + eksctl (for EKS access)
- Terraform >= 1.7.0
- An existing EKS cluster (`notif-system`) in us-east-1

---

## Installation

```bash
pnpm install
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in real values.

| Variable        | Description                                              | Required | Example                                                   |
|-----------------|----------------------------------------------------------|----------|-----------------------------------------------------------|
| `MSK_BROKERS`   | Comma-separated MSK IAM broker endpoints (port 9098)     | yes      | `b-1.xxx:9098,b-2.xxx:9098`                               |
| `KAFKA_TOPIC`   | Kafka topic name                                         | yes      | `notifications`                                           |
| `KAFKA_GROUP_ID`| Consumer group ID                                        | yes      | `node-msk-notifier-consumer`                              |
| `AWS_REGION`    | AWS region                                               | yes      | `us-east-1`                                               |
| `SNS_TOPIC_ARN` | Default SNS topic ARN for publishing                     | yes      | `arn:aws:sns:us-east-1:123456789012:notifications`        |
| `API_KEY`       | Shared secret for `X-API-Key` header                     | yes      | `change-me-in-production`                                 |
| `PORT`          | HTTP port for the API server                             | no       | `8000`                                                    |
| `LOG_LEVEL`     | Pino log level                                           | no       | `info`                                                    |

---

## Running locally

Requires a reachable Kafka broker. For local dev you can run a local Kafka with Docker, or tunnel to MSK via an SSH bastion, then set `MSK_BROKERS` accordingly and use plain SASL (you would need to adjust the auth mechanism in `src/shared/config.js`).

```bash
# API
node --env-file=.env src/api/index.js

# Consumer (separate terminal)
node --env-file=.env src/consumer/index.js
```

---

## Docker

```bash
# Lint Dockerfiles
hadolint Dockerfile.api
hadolint Dockerfile.consumer

# Build API image
docker build -f Dockerfile.api -t node-msk-notifier-api:latest .
docker buildx build -f Dockerfile.api -t node-msk-notifier-api:latest .

# Build consumer image
docker build -f Dockerfile.consumer -t node-msk-notifier-consumer:latest .
docker buildx build -f Dockerfile.consumer -t node-msk-notifier-consumer:latest .

# Run API (replace env values)
docker run -p 8000:8000 --env-file .env node-msk-notifier-api:latest

# Run consumer
docker run --env-file .env node-msk-notifier-consumer:latest
```

---

## API reference

All requests to protected routes require the `X-API-Key` header.

### Health

`GET /health`

No auth required. Returns 200 when the service is up.

```json
{ "status": "ok" }
```

---

### POST /notifications

Publish a notification to the Kafka topic. Returns 202 immediately; delivery is async via the consumer.

Request headers:
```
X-API-Key: <key>
Content-Type: application/json
```

Request body:
```json
{
  "type": "email",
  "recipient": "user@example.com",
  "subject": "Welcome",
  "message": "Hello from node-msk-notifier",
  "metadata": { "campaignId": "abc123" }
}
```

`type` — one of `email | sms | push | webhook`
`recipient` — non-empty string
`subject` — optional string
`message` — non-empty string
`metadata` — optional object

Response `202 Accepted`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

---

### GET /notifications/:id

Returns the queued status for a notification ID. The API tier does not persist state; this endpoint confirms the ID was accepted.

Response `200`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "note": "This API only produces messages. Query your SNS subscription or downstream system for delivery status."
}
```

---

### POST /subscriptions

Subscribe an endpoint to the SNS topic so it receives delivered notifications.

Request body:
```json
{
  "protocol": "email",
  "endpoint": "user@example.com",
  "topicArn": "arn:aws:sns:us-east-1:123456789012:notifications"
}
```

`protocol` — one of `email | sms | sqs | lambda | http | https | firehose`
`endpoint` — the destination (email address, phone number, SQS ARN, etc.)
`topicArn` — optional; defaults to `SNS_TOPIC_ARN` env var

Response `201`:
```json
{
  "subscriptionArn": "arn:aws:sns:us-east-1:123456789012:notifications:uuid"
}
```

---

## Project structure

```
node-msk-notifier/
  src/
    shared/
      config.js          # Zod env parsing shared by API and consumer
      logger.js          # Pino logger
    api/
      middleware/
        apiKey.js        # X-API-Key auth hook
      routes/
        health.js
        notifications.js # POST /notifications, GET /notifications/:id
        subscriptions.js # POST /subscriptions
      schemas.js         # Zod schemas
      services/
        kafka.js         # KafkaJS producer with MSK IAM auth
      index.js           # Fastify server entry point
    consumer/
      services/
        sns.js           # SNS publish helper
      index.js           # KafkaJS consumer entry point
  k8s/
    namespace.yaml
    serviceaccount.yaml  # Annotated with IRSA role ARN
    configmap.yaml
    secret.yaml.example
    api-deployment.yaml
    api-service.yaml
    api-ingress.yaml     # ALB ingress
    consumer-deployment.yaml
  terraform/
    providers.tf         # AWS provider, S3 backend (sate_bucket)
    variables.tf
    main.tf              # ECR, MSK, IRSA, IAM policy
    outputs.tf
  .github/
    workflows/
      deploy.yml         # Build & push ECR images, deploy to EKS
  Dockerfile.api
  Dockerfile.consumer
  .dockerignore
  .env.example
  package.json
  pnpm-lock.yaml
```

---

## Terraform

Provisions: ECR repositories (api + consumer), MSK cluster with IAM auth, IRSA IAM role and policy (MSK + SNS permissions), MSK security group.

```bash
cd terraform

# First time
terraform init

# Review changes
terraform plan \
  -var="vpc_id=vpc-xxxxxxxxxxxxxxxxx" \
  -var="private_subnet_ids=[\"subnet-aaa\",\"subnet-bbb\"]" \
  -var="eks_node_security_group_id=sg-xxxxxxxxxxxxxxxxx"

# Apply
terraform apply \
  -var="vpc_id=vpc-xxxxxxxxxxxxxxxxx" \
  -var="private_subnet_ids=[\"subnet-aaa\",\"subnet-bbb\"]" \
  -var="eks_node_security_group_id=sg-xxxxxxxxxxxxxxxxx"
```

After apply, copy the outputs:

```bash
terraform output msk_bootstrap_brokers_iam   # → MSK_BROKERS secret
terraform output irsa_role_arn               # → k8s/serviceaccount.yaml annotation
terraform output ecr_api_url                 # → ECR registry in deploy.yml
terraform output ecr_consumer_url
```

Update `k8s/serviceaccount.yaml` with the IRSA role ARN output, then commit and push.

---

## Deployment

CI/CD is handled by `.github/workflows/deploy.yml`. On push to `main`:

1. Builds and pushes both Docker images to ECR (tagged with git SHA + `latest`)
2. Applies Kubernetes manifests (namespace, serviceaccount, configmap)
3. Creates / updates the `node-msk-notifier-secrets` Kubernetes secret from GitHub secrets
4. Rolls out new images to both EKS deployments
5. Waits for rollout to complete (300s timeout)

Required GitHub repository secrets:

| Secret                    | Value                                     |
|---------------------------|-------------------------------------------|
| `AWS_ACCESS_KEY_ID`       | IAM user access key with ECR + EKS access |
| `AWS_SECRET_ACCESS_KEY`   | IAM user secret key                       |
| `MSK_BROKERS`             | From `terraform output msk_bootstrap_brokers_iam` |
| `SNS_TOPIC_ARN`           | Default SNS topic ARN                     |
| `API_KEY`                 | API key for `X-API-Key` auth              |

---

## Running tests

```bash
pnpm dlx vitest
```

---

## Notes

- MSK uses IAM authentication on port 9098 with TLS. The `aws-msk-iam-sasl-signer-js` package generates short-lived OAUTH tokens automatically using the pod's IRSA credentials — no static keys needed in the pods.
- The consumer runs with 2 replicas in a consumer group. Kafka distributes the 3 topic partitions across both replicas.
- `auto.create.topics.enable=false` on MSK — create the `notifications` topic manually or via an init job before deploying.
- The consumer catches per-message errors without crashing the process; failed messages are logged and skipped (add a DLQ to your SNS topic for production use).
