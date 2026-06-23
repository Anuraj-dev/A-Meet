#!/usr/bin/env bash
#
# Provision and verify the production EC2 "stable identity + auto-recovery" contract:
#   1. Associate a stable Elastic IP (EIP) with the A-Meet instance. The EIP is the
#      one fixed address used for DNS (api.<domain>), MEDIASOUP_ANNOUNCED_IP, and the
#      MongoDB Atlas network allowlist — it survives stop/start and auto-recovery.
#   2. Create a CloudWatch alarm on StatusCheckFailed_System whose action recovers
#      the SAME instance (same EIP, same EBS root volume) on host/hardware failure.
#
# This is idempotent: re-running `setup` re-associates the EIP and re-puts the alarm.
# It needs the AWS CLI v2 and credentials with EC2 + CloudWatch permissions.
#
# Usage:
#   AWS_REGION=ap-south-1 INSTANCE_ID=i-0abc... EIP_ALLOCATION_ID=eipalloc-0abc... \
#     deploy/aws-recovery.sh setup
#   AWS_REGION=ap-south-1 INSTANCE_ID=i-0abc... EIP_ALLOCATION_ID=eipalloc-0abc... \
#     deploy/aws-recovery.sh verify
#
set -euo pipefail

: "${AWS_REGION:?set AWS_REGION (e.g. ap-south-1)}"
: "${INSTANCE_ID:?set INSTANCE_ID (e.g. i-0abc123...)}"
: "${EIP_ALLOCATION_ID:?set EIP_ALLOCATION_ID (e.g. eipalloc-0abc123...)}"

ALARM_NAME="${ALARM_NAME:-a-meet-${INSTANCE_ID}-system-recover}"
# EC2 auto-recovery action ARN for this region.
RECOVER_ACTION="arn:aws:automate:${AWS_REGION}:ec2:recover"

setup() {
  echo "==> Associating EIP ${EIP_ALLOCATION_ID} with ${INSTANCE_ID}"
  # --allow-reassociation makes this safe to re-run and after a recovery event.
  aws ec2 associate-address \
    --region "$AWS_REGION" \
    --instance-id "$INSTANCE_ID" \
    --allocation-id "$EIP_ALLOCATION_ID" \
    --allow-reassociation

  echo "==> Creating/updating CloudWatch system-status recovery alarm ${ALARM_NAME}"
  # StatusCheckFailed_System flags underlying host/hardware faults (the recoverable
  # kind). 2 consecutive 60s breaches => recover the instance onto healthy hardware.
  aws cloudwatch put-metric-alarm \
    --region "$AWS_REGION" \
    --alarm-name "$ALARM_NAME" \
    --alarm-description "Recover A-Meet EC2 ${INSTANCE_ID} on system status check failure" \
    --namespace AWS/EC2 \
    --metric-name StatusCheckFailed_System \
    --statistic Maximum \
    --period 60 \
    --evaluation-periods 2 \
    --threshold 0 \
    --comparison-operator GreaterThanThreshold \
    --treat-missing-data missing \
    --dimensions "Name=InstanceId,Value=${INSTANCE_ID}" \
    --alarm-actions "$RECOVER_ACTION"

  echo "==> Done. Run 'verify' to confirm the recovery contract."
}

# Prints the evidence AND enforces the recovery contract: exits non-zero if the
# EIP is not associated to INSTANCE_ID, the alarm is missing / lacks the regional
# ec2:recover action, or the instance is not EBS-backed. The `|| true` on each
# capture stops a failed AWS call from aborting before the explicit check runs.
verify() {
  local failures=0

  echo "==> Elastic IP association (stable address)"
  aws ec2 describe-addresses \
    --region "$AWS_REGION" \
    --allocation-ids "$EIP_ALLOCATION_ID" \
    --query 'Addresses[0].{PublicIp:PublicIp,InstanceId:InstanceId,AssociationId:AssociationId}' \
    --output table || true
  local eip_instance
  eip_instance=$(aws ec2 describe-addresses --region "$AWS_REGION" \
    --allocation-ids "$EIP_ALLOCATION_ID" \
    --query 'Addresses[0].InstanceId' --output text 2>/dev/null || true)
  if [ "$eip_instance" != "$INSTANCE_ID" ]; then
    echo "FAIL: EIP ${EIP_ALLOCATION_ID} is associated to '${eip_instance:-<none>}', expected '${INSTANCE_ID}'" >&2
    failures=$((failures + 1))
  fi

  echo "==> Recovery alarm (action must be the ec2:recover ARN)"
  aws cloudwatch describe-alarms \
    --region "$AWS_REGION" \
    --alarm-names "$ALARM_NAME" \
    --query 'MetricAlarms[0].{Name:AlarmName,Metric:MetricName,State:StateValue,Comparison:ComparisonOperator,Actions:AlarmActions}' \
    --output table || true
  local alarm_actions
  alarm_actions=$(aws cloudwatch describe-alarms --region "$AWS_REGION" \
    --alarm-names "$ALARM_NAME" \
    --query 'MetricAlarms[0].AlarmActions' --output text 2>/dev/null || true)
  if ! printf '%s' "$alarm_actions" | grep -qF "$RECOVER_ACTION"; then
    echo "FAIL: alarm '${ALARM_NAME}' missing or lacks recover action '${RECOVER_ACTION}' (actions: '${alarm_actions:-<none>}')" >&2
    failures=$((failures + 1))
  fi

  echo "==> Instance root device (must be 'ebs' — recovery requires EBS-backed)"
  aws ec2 describe-instances \
    --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].{InstanceId:InstanceId,RootDeviceType:RootDeviceType,PublicIp:PublicIpAddress}' \
    --output table || true
  local root_type
  root_type=$(aws ec2 describe-instances --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].RootDeviceType' --output text 2>/dev/null || true)
  if [ "$root_type" != "ebs" ]; then
    echo "FAIL: instance ${INSTANCE_ID} RootDeviceType='${root_type:-<none>}', expected 'ebs'" >&2
    failures=$((failures + 1))
  fi

  if [ "$failures" -ne 0 ]; then
    echo "==> Recovery contract NOT satisfied (${failures} check(s) failed)" >&2
    return 1
  fi
  echo "==> Recovery contract verified."
}

case "${1:-}" in
  setup) setup ;;
  verify) verify ;;
  *) echo "usage: $0 {setup|verify}" >&2; exit 2 ;;
esac
