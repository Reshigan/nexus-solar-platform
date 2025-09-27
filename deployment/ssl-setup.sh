#!/bin/bash

# SSL setup script for Nexus Solar Platform
# This script sets up SSL certificates using Let's Encrypt for nexus.gonxt.tech

# Exit on error
set -e

# Configuration
DOMAIN="nexus.gonxt.tech"
EMAIL="admin@gonxt.tech"  # Change to a valid email
SERVER_IP="13.246.193.45"

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root" >&2
    exit 1
fi

# Update system
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install required packages
echo "Installing required packages..."
apt-get install -y certbot python3-certbot-nginx nginx

# Create directories for certbot
mkdir -p /var/www/certbot

# Configure Nginx for initial certificate acquisition
echo "Configuring Nginx for certificate acquisition..."
cat > /etc/nginx/sites-available/$DOMAIN.conf << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/$DOMAIN.conf /etc/nginx/sites-enabled/

# Test Nginx configuration
nginx -t

# Restart Nginx
systemctl restart nginx

# Obtain SSL certificate
echo "Obtaining SSL certificate from Let's Encrypt..."
certbot certonly --webroot -w /var/www/certbot -d $DOMAIN --email $EMAIL --agree-tos --non-interactive

# Configure Nginx with SSL
echo "Configuring Nginx with SSL..."
cat > /etc/nginx/sites-available/$DOMAIN.conf << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/$DOMAIN/chain.pem;
    
    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # HSTS (15768000 seconds = 6 months)
    add_header Strict-Transport-Security "max-age=15768000; includeSubDomains; preload" always;
    
    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Placeholder for proxy configuration
    # This will be replaced by the actual Docker configuration
    location / {
        return 200 'SSL is configured correctly for $DOMAIN';
        add_header Content-Type text/plain;
    }
}
EOF

# Test Nginx configuration
nginx -t

# Restart Nginx
systemctl restart nginx

# Set up auto-renewal
echo "Setting up automatic certificate renewal..."
echo "0 0,12 * * * root python -c 'import random; import time; time.sleep(random.random() * 3600)' && certbot renew -q" | sudo tee -a /etc/crontab > /dev/null

echo "SSL certificate has been successfully installed for $DOMAIN"
echo "Certificate location: /etc/letsencrypt/live/$DOMAIN/"
echo "Certificate will auto-renew via cron job"