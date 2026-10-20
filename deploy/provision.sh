#!/usr/bin/env bash
# One-time AWS setup for the single-EC2 deployment (idempotent: re-running reuses what exists).
# Creates: S3 bundle bucket, IAM role/instance profile (SSM + read that bucket), security group
# (80/443 only — no SSH; access is via SSM), an Ubuntu 24.04 t3.small with Docker, and an
# Elastic IP. Prints the instance id and public IP at the end.
#   AWS_PROFILE=hvk AWS_REGION=ap-south-1 deploy/provision.sh
set -euo pipefail

: "${AWS_PROFILE:=hvk}" "${AWS_REGION:=ap-south-1}"
export AWS_PROFILE AWS_REGION AWS_PAGER=""
NAME=teamloom-api
TYPE="${INSTANCE_TYPE:-t3.small}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="teamloom-deploy-$ACCOUNT-$AWS_REGION"

# --- S3 bucket for release bundles (private, encrypted, old bundles expire)
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null
  aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
    '{"Rules":[{"ID":"expire-bundles","Status":"Enabled","Filter":{"Prefix":"releases/"},"Expiration":{"Days":30}}]}'
fi
echo "bucket: $BUCKET"

# --- IAM role + instance profile
if ! aws iam get-role --role-name "$NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$NAME" --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$NAME" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
fi
aws iam put-role-policy --role-name "$NAME" --policy-name read-deploy-bucket --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/releases/*\"}]}"
if ! aws iam get-instance-profile --instance-profile-name "$NAME" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$NAME" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$NAME" --role-name "$NAME"
  sleep 10 # instance profiles take a moment to become usable by RunInstances
fi

# --- Security group in the default VPC: HTTP/HTTPS only
VPC="$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)"
SG="$(aws ec2 describe-security-groups --filters Name=group-name,Values=$NAME Name=vpc-id,Values=$VPC --query 'SecurityGroups[0].GroupId' --output text)"
if [ "$SG" = "None" ]; then
  SG="$(aws ec2 create-security-group --group-name "$NAME" --description "TeamLoom API: HTTP/HTTPS only" --vpc-id "$VPC" --query GroupId --output text)"
  for port in 80 443; do
    aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port "$port" --cidr 0.0.0.0/0 >/dev/null
  done
fi
echo "security group: $SG"

# --- Instance
INSTANCE="$(aws ec2 describe-instances --filters Name=tag:Name,Values=$NAME Name=instance-state-name,Values=pending,running,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
if [ "$INSTANCE" = "None" ]; then
  AMI="$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)"
  USER_DATA="$(cat <<'EOF'
#!/bin/bash
set -eux
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2 unzip
systemctl enable --now docker
snap install aws-cli --classic
mkdir -p /opt/teamloom/backups
cat > /etc/systemd/system/teamloom-backup.service <<'UNIT'
[Unit]
Description=TeamLoom nightly Postgres dump
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/teamloom/app/deploy/backup.sh
UNIT
cat > /etc/systemd/system/teamloom-backup.timer <<'UNIT'
[Unit]
Description=Run TeamLoom backup nightly
[Timer]
OnCalendar=*-*-* 20:30:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now teamloom-backup.timer
touch /opt/teamloom/.provisioned
EOF
)"
  INSTANCE="$(aws ec2 run-instances --image-id "$AMI" --instance-type "$TYPE" \
    --iam-instance-profile "Name=$NAME" --security-group-ids "$SG" \
    --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3,Encrypted=true,DeleteOnTermination=false}' \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" "ResourceType=volume,Tags=[{Key=Name,Value=$NAME}]" \
    --user-data "$USER_DATA" --query 'Instances[0].InstanceId' --output text)"
  echo "launched $INSTANCE, waiting for it to run..."
  aws ec2 wait instance-running --instance-ids "$INSTANCE"
fi
echo "instance: $INSTANCE"

# --- Elastic IP
EIP_ALLOC="$(aws ec2 describe-addresses --filters Name=tag:Name,Values=$NAME --query 'Addresses[0].AllocationId' --output text)"
if [ "$EIP_ALLOC" = "None" ]; then
  EIP_ALLOC="$(aws ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" --query AllocationId --output text)"
fi
aws ec2 associate-address --instance-id "$INSTANCE" --allocation-id "$EIP_ALLOC" >/dev/null
IP="$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" --query 'Addresses[0].PublicIp' --output text)"
echo "public ip: $IP"
