# First create proper config
cat > /tmp/rclone.conf << EOL
[r2]
type = s3
provider = Cloudflare
access_key_id = ***
secret_access_key = ***
endpoint = ***.r2.cloudflarestorage.com
acl = private
EOL

# Then run cleanup with the config
rclone --config /tmp/rclone.conf cleanup r2:capgo

# Clean up the config file
rm /tmp/rclone.conf
