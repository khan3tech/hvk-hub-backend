#!/usr/bin/env bash
# Ships the current git HEAD to the EC2 host: git archive -> S3 -> SSM Run Command, which runs
# deploy/remote-deploy.sh on the instance. Pass --seed on the very first deploy only.
#   AWS_PROFILE=hvk AWS_REGION=ap-south-1 deploy/deploy.sh [--seed]
set -euo pipefail

: "${AWS_PROFILE:=hvk}" "${AWS_REGION:=ap-south-1}"
export AWS_PROFILE AWS_REGION AWS_PAGER=""
NAME=teamloom-api
SEED="${1:-}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="teamloom-deploy-$ACCOUNT-$AWS_REGION"
SHA="$(git rev-parse --short HEAD)"
KEY="releases/teamloom-$SHA-$(date -u +%Y%m%dT%H%M%SZ).tgz"

INSTANCE="$(aws ec2 describe-instances --filters Name=tag:Name,Values=$NAME Name=instance-state-name,Values=running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
[ "$INSTANCE" != "None" ] || { echo "no running $NAME instance — run deploy/provision.sh first"; exit 1; }

TMP="$(mktemp -d)"
git archive --format=tar.gz -o "$TMP/bundle.tgz" HEAD
aws s3 cp --only-show-errors "$TMP/bundle.tgz" "s3://$BUCKET/$KEY"
rm -rf "$TMP"
echo "uploaded $KEY ($SHA)"

PARAMS="$(node -e '
const [bucket, key, seed] = process.argv.slice(1);
const cmds = [
  "set -e",
  "export PATH=$PATH:/snap/bin",
  "test -f /opt/teamloom/.provisioned || { echo \"instance still provisioning\"; exit 1; }",
  "rm -rf /tmp/teamloom-src && mkdir -p /tmp/teamloom-src",
  `aws s3 cp --only-show-errors s3://${bucket}/${key} /tmp/teamloom-src.tgz`,
  "tar -xzf /tmp/teamloom-src.tgz -C /tmp/teamloom-src",
  `bash /tmp/teamloom-src/deploy/remote-deploy.sh /tmp/teamloom-src ${seed}`,
];
process.stdout.write(JSON.stringify({ commands: cmds, executionTimeout: ["1800"] }));
' "$BUCKET" "$KEY" "$SEED")"

CMD_ID="$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --comment "teamloom deploy $SHA" --timeout-seconds 600 --parameters "$PARAMS" --query Command.CommandId --output text)"
echo "ssm command $CMD_ID running on $INSTANCE..."

while true; do
  STATUS="$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)"
  case "$STATUS" in Pending|InProgress|Delayed) sleep 10 ;; *) break ;; esac
done
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text | tail -n 40
echo "status: $STATUS"
[ "$STATUS" = "Success" ]
