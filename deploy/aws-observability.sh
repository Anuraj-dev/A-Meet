#!/usr/bin/env bash
#
# Idempotently provisions the production log/alert path:
# Docker stdout -> CloudWatch Logs -> metric filters/alarms -> SNS -> Telegram Lambda.
# Credentials come from the operator/deploy role; runtime secrets stay in SSM.
set -euo pipefail

: "${AWS_REGION:?set AWS_REGION}"
: "${LAMBDA_ROLE_ARN:?set LAMBDA_ROLE_ARN}"

ENVIRONMENT="${ENVIRONMENT:-prod}"
LOG_GROUP="${CLOUDWATCH_LOG_GROUP:-/a-meet/${ENVIRONMENT}/server}"
SNS_TOPIC_NAME="${SNS_TOPIC_NAME:-a-meet-${ENVIRONMENT}-alerts}"
PROCESS_SNS_TOPIC_NAME="${PROCESS_SNS_TOPIC_NAME:-a-meet-${ENVIRONMENT}-process-alerts}"
FUNCTION_NAME="${FUNCTION_NAME:-a-meet-${ENVIRONMENT}-telegram-alert}"
PROCESS_FUNCTION_NAME="${PROCESS_FUNCTION_NAME:-a-meet-${ENVIRONMENT}-telegram-alert-route53}"
TELEGRAM_TOKEN_PARAMETER="${TELEGRAM_TOKEN_PARAMETER:-/a-meet/${ENVIRONMENT}/telegram/token}"
TELEGRAM_CHAT_ID_PARAMETER="${TELEGRAM_CHAT_ID_PARAMETER:-/a-meet/${ENVIRONMENT}/telegram/chat-id}"
NAMESPACE="${NAMESPACE:-A-Meet/${ENVIRONMENT}}"
ROUTE53_ALARM_REGION="${ROUTE53_ALARM_REGION:-us-east-1}"
READINESS_HOST="${READINESS_HOST:?set READINESS_HOST to the public API host, for example api.example.com}"
READINESS_PROTOCOL="${READINESS_PROTOCOL:-HTTPS}"
READINESS_PATH="${READINESS_PATH:-/api/health/ready}"
READINESS_PORT="${READINESS_PORT:-}"
READINESS_CALLER_REFERENCE="${READINESS_CALLER_REFERENCE:-a-meet-${ENVIRONMENT}-readiness}"

if [ -z "$READINESS_PORT" ]; then
  if [ "$READINESS_PROTOCOL" = "HTTP" ]; then
    READINESS_PORT=80
  else
    READINESS_PORT=443
  fi
fi

aws logs create-log-group \
  --region "$AWS_REGION" \
  --log-group-name "$LOG_GROUP" 2>/dev/null || true
aws logs put-retention-policy \
  --region "$AWS_REGION" \
  --log-group-name "$LOG_GROUP" \
  --retention-in-days 14

TOPIC_ARN=$(aws sns create-topic \
  --region "$AWS_REGION" \
  --name "$SNS_TOPIC_NAME" \
  --query TopicArn --output text)
PROCESS_TOPIC_ARN=$(aws sns create-topic \
  --region "$ROUTE53_ALARM_REGION" \
  --name "$PROCESS_SNS_TOPIC_NAME" \
  --query TopicArn --output text)

bundle=$(mktemp -d)
trap 'rm -rf "$bundle"' EXIT
cp deploy/telegram-notifier/index.mjs deploy/telegram-notifier/formatter.mjs "$bundle/"
(cd "$bundle" && zip -q notifier.zip index.mjs formatter.mjs)

deploy_notifier_lambda() {
  local region="$1"
  local function_name="$2"
  local topic_arn="$3"

  if aws lambda get-function --region "$region" --function-name "$function_name" >/dev/null 2>&1; then
    aws lambda update-function-code \
      --region "$region" \
      --function-name "$function_name" \
      --zip-file "fileb://${bundle}/notifier.zip" >/dev/null
    aws lambda wait function-updated \
      --region "$region" --function-name "$function_name"
    aws lambda update-function-configuration \
      --region "$region" \
      --function-name "$function_name" \
      --role "$LAMBDA_ROLE_ARN" \
      --runtime nodejs22.x \
      --handler index.handler \
      --environment "Variables={ENVIRONMENT=${ENVIRONMENT},SSM_REGION=${AWS_REGION},TELEGRAM_TOKEN_PARAMETER=${TELEGRAM_TOKEN_PARAMETER},TELEGRAM_CHAT_ID_PARAMETER=${TELEGRAM_CHAT_ID_PARAMETER}}" >/dev/null
  else
    aws lambda create-function \
      --region "$region" \
      --function-name "$function_name" \
      --role "$LAMBDA_ROLE_ARN" \
      --runtime nodejs22.x \
      --handler index.handler \
      --zip-file "fileb://${bundle}/notifier.zip" \
      --environment "Variables={ENVIRONMENT=${ENVIRONMENT},SSM_REGION=${AWS_REGION},TELEGRAM_TOKEN_PARAMETER=${TELEGRAM_TOKEN_PARAMETER},TELEGRAM_CHAT_ID_PARAMETER=${TELEGRAM_CHAT_ID_PARAMETER}}" >/dev/null
  fi

  local function_arn
  function_arn=$(aws lambda get-function \
    --region "$region" --function-name "$function_name" \
    --query Configuration.FunctionArn --output text)
  aws lambda add-permission \
    --region "$region" \
    --function-name "$function_name" \
    --statement-id AllowSnsInvoke \
    --action lambda:InvokeFunction \
    --principal sns.amazonaws.com \
    --source-arn "$topic_arn" >/dev/null 2>&1 || true

  if ! aws sns list-subscriptions-by-topic \
    --region "$region" --topic-arn "$topic_arn" \
    --query "Subscriptions[?Endpoint=='${function_arn}'] | [0].SubscriptionArn" \
    --output text | grep -q '^arn:'; then
    aws sns subscribe \
      --region "$region" \
      --topic-arn "$topic_arn" \
      --protocol lambda \
      --notification-endpoint "$function_arn" >/dev/null
  fi

  printf '%s' "$function_arn"
}

FUNCTION_ARN=$(deploy_notifier_lambda "$AWS_REGION" "$FUNCTION_NAME" "$TOPIC_ARN")
PROCESS_FUNCTION_ARN=$(deploy_notifier_lambda "$ROUTE53_ALARM_REGION" "$PROCESS_FUNCTION_NAME" "$PROCESS_TOPIC_ARN")

put_filter() {
  aws logs put-metric-filter \
    --region "$AWS_REGION" \
    --log-group-name "$LOG_GROUP" \
    --filter-name "$1" \
    --filter-pattern "$2" \
    --metric-transformations \
      "metricName=$3,metricNamespace=$NAMESPACE,metricValue=1,defaultValue=0"
}

put_alarm() {
  aws cloudwatch put-metric-alarm \
    --region "$AWS_REGION" \
    --alarm-name "a-meet-${ENVIRONMENT}-$1" \
    --namespace "$NAMESPACE" \
    --metric-name "$2" \
    --statistic Sum \
    --period "$3" \
    --evaluation-periods "$4" \
    --datapoints-to-alarm "$4" \
    --threshold "$5" \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --treat-missing-data notBreaching \
    --alarm-actions "$TOPIC_ARN"
}

put_filter fatal-log '{ $.level = 60 }' FatalCount
put_filter mongo-disconnect '{ $.msg = "MongoDB disconnected" }' MongoDisconnectCount
put_filter error-rate '{ $.level >= 50 }' ErrorCount
put_alarm fatal-log FatalCount 60 1 1
put_alarm mongo-disconnect MongoDisconnectCount 60 3 1
put_alarm error-rate-5m ErrorCount 300 1 5

# App process health checks the public readiness endpoint and alarms through
# the same SNS route. This catches process/container downtime while EC2 itself
# is still healthy.
HEALTH_CHECK_ID=$(aws route53 list-health-checks \
  --query "HealthChecks[?CallerReference=='${READINESS_CALLER_REFERENCE}'].Id | [0]" \
  --output text)
if [ "$HEALTH_CHECK_ID" = "None" ]; then
  HEALTH_CHECK_ID=$(aws route53 create-health-check \
    --caller-reference "$READINESS_CALLER_REFERENCE" \
    --health-check-config "FullyQualifiedDomainName=${READINESS_HOST},Port=${READINESS_PORT},Type=${READINESS_PROTOCOL},ResourcePath=${READINESS_PATH},RequestInterval=30,FailureThreshold=3,MeasureLatency=true" \
    --query HealthCheck.Id \
    --output text)
fi

aws cloudwatch put-metric-alarm \
  --region "$ROUTE53_ALARM_REGION" \
  --alarm-name "a-meet-${ENVIRONMENT}-process-down" \
  --namespace AWS/Route53 \
  --metric-name HealthCheckStatus \
  --dimensions "Name=HealthCheckId,Value=${HEALTH_CHECK_ID}" \
  --statistic Minimum \
  --period 60 \
  --evaluation-periods 3 \
  --datapoints-to-alarm 3 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --treat-missing-data breaching \
  --alarm-actions "$PROCESS_TOPIC_ARN"

# Instance health complements process health by detecting host-level failure.
if [ -n "${INSTANCE_ID:-}" ]; then
  aws cloudwatch put-metric-alarm \
    --region "$AWS_REGION" \
    --alarm-name "a-meet-${ENVIRONMENT}-instance-health" \
    --namespace AWS/EC2 \
    --metric-name StatusCheckFailed_Instance \
    --dimensions "Name=InstanceId,Value=${INSTANCE_ID}" \
    --statistic Maximum \
    --period 60 \
    --evaluation-periods 2 \
    --threshold 1 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --treat-missing-data missing \
    --alarm-actions "$TOPIC_ARN"
fi

printf 'Log group: %s (14 days)\nSNS topic: %s\nLambda: %s\nRoute53 alarm region: %s\nRoute53 SNS topic: %s\nRoute53 Lambda: %s\n' \
  "$LOG_GROUP" "$TOPIC_ARN" "$FUNCTION_ARN" "$ROUTE53_ALARM_REGION" "$PROCESS_TOPIC_ARN" "$PROCESS_FUNCTION_ARN"
