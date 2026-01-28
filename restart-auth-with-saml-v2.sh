#!/bin/bash
# ⚠️  DEVELOPMENT/TESTING ONLY - Contains hardcoded credentials
# DO NOT use in production environments
set -e

# Stop and remove existing auth container
docker stop supabase_auth_capgo-app 2>/dev/null || true
docker rm supabase_auth_capgo-app 2>/dev/null || true

# Create base64 single-line encoded keys
cat /tmp/saml-key-pkcs1.pem | base64 | tr -d '\n' > /tmp/saml-key-b64.txt
cat /tmp/saml-cert.pem | base64 | tr -d '\n' > /tmp/saml-cert-b64.txt

# Read into variables
SAML_KEY_B64=$(cat /tmp/saml-key-b64.txt)
SAML_CERT_B64=$(cat /tmp/saml-cert-b64.txt)

# Clean up temporary base64 files immediately after reading
rm -f /tmp/saml-key-b64.txt /tmp/saml-cert-b64.txt

echo "Starting auth container with SAML..."
echo "Key length: ${#SAML_KEY_B64}"
echo "Cert length: ${#SAML_CERT_B64}"

# Start container with all environment variables
docker run -d \
  --name supabase_auth_capgo-app \
  --network supabase_network_capgo-app \
  -e API_EXTERNAL_URL=http://127.0.0.1:54321 \
  -e GOTRUE_API_HOST=0.0.0.0 \
  -e GOTRUE_API_PORT=9999 \
  -e GOTRUE_DB_DRIVER=postgres \
  -e "GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:postgres@supabase_db_capgo-app:5432/postgres" \
  -e GOTRUE_SITE_URL=http://127.0.0.1:3000 \
  -e GOTRUE_URI_ALLOW_LIST=https://127.0.0.1:3000 \
  -e GOTRUE_DISABLE_SIGNUP=false \
  -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
  -e GOTRUE_JWT_EXP=3600 \
  -e GOTRUE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long \
  -e GOTRUE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1 \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
  -e GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true \
  -e GOTRUE_MAILER_AUTOCONFIRM=true \
  -e GOTRUE_MAILER_OTP_LENGTH=6 \
  -e GOTRUE_MAILER_OTP_EXP=3600 \
  -e GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false \
  -e GOTRUE_SMTP_MAX_FREQUENCY=1s \
  -e GOTRUE_MAILER_URLPATHS_INVITE=http://127.0.0.1:54321/auth/v1/verify \
  -e GOTRUE_MAILER_URLPATHS_CONFIRMATION=http://127.0.0.1:54321/auth/v1/verify \
  -e GOTRUE_MAILER_URLPATHS_RECOVERY=http://127.0.0.1:54321/auth/v1/verify \
  -e GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=http://127.0.0.1:54321/auth/v1/verify \
  -e GOTRUE_RATE_LIMIT_EMAIL_SENT=360000 \
  -e GOTRUE_EXTERNAL_PHONE_ENABLED=false \
  -e GOTRUE_SMS_AUTOCONFIRM=true \
  -e GOTRUE_SMS_MAX_FREQUENCY=5s \
  -e GOTRUE_SMS_OTP_EXP=6000 \
  -e GOTRUE_SMS_OTP_LENGTH=6 \
  -e "GOTRUE_SMS_TEMPLATE=Your code is {{ .Code }}" \
  -e GOTRUE_PASSWORD_MIN_LENGTH=6 \
  -e GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true \
  -e GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10 \
  -e GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=false \
  -e GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=false \
  -e GOTRUE_MFA_PHONE_ENROLL_ENABLED=false \
  -e GOTRUE_MFA_PHONE_VERIFY_ENABLED=false \
  -e GOTRUE_MFA_TOTP_ENROLL_ENABLED=false \
  -e GOTRUE_MFA_TOTP_VERIFY_ENABLED=false \
  -e GOTRUE_MFA_WEB_AUTHN_ENROLL_ENABLED=false \
  -e GOTRUE_MFA_WEB_AUTHN_VERIFY_ENABLED=false \
  -e GOTRUE_MFA_MAX_ENROLLED_FACTORS=10 \
  -e GOTRUE_RATE_LIMIT_ANONYMOUS_USERS=30 \
  -e GOTRUE_RATE_LIMIT_TOKEN_REFRESH=150 \
  -e GOTRUE_RATE_LIMIT_OTP=30 \
  -e GOTRUE_RATE_LIMIT_VERIFY=30 \
  -e GOTRUE_RATE_LIMIT_SMS_SENT=30 \
  -e GOTRUE_RATE_LIMIT_WEB3=30 \
  -e GOTRUE_EXTERNAL_APPLE_ENABLED=false \
  -e GOTRUE_EXTERNAL_APPLE_SKIP_NONCE_CHECK=false \
  -e GOTRUE_EXTERNAL_APPLE_EMAIL_OPTIONAL=false \
  -e GOTRUE_EXTERNAL_APPLE_REDIRECT_URI=http://127.0.0.1:54321/auth/v1/callback \
  -e GOTRUE_EXTERNAL_WEB3_SOLANA_ENABLED=false \
  -e GOTRUE_EXTERNAL_WEB3_ETHEREUM_ENABLED=false \
  -e GOTRUE_DB_MIGRATIONS_PATH=/usr/local/etc/auth/migrations \
  -e GOTRUE_SAML_ENABLED=true \
  -e "GOTRUE_SAML_PRIVATE_KEY=${SAML_KEY_B64}" \
  -e "GOTRUE_SAML_SIGNING_CERT=${SAML_CERT_B64}" \
  -l com.docker.compose.project=capgo-app \
  -l com.supabase.cli.project=capgo-app \
  public.ecr.aws/supabase/gotrue:v2.184.0

echo "Waiting for container to start..."
sleep 3

if docker ps | grep -q supabase_auth_capgo-app; then
  echo "✅ Auth container running with SAML enabled!"
  docker logs supabase_auth_capgo-app 2>&1 | tail -5
else
  echo "❌ Auth container failed to start"
  docker logs supabase_auth_capgo-app 2>&1 | tail -10
  exit 1
fi
