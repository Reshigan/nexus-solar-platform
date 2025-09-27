# Nexus Solar Platform Deployment Guide

This guide provides step-by-step instructions for deploying the Nexus Solar Platform to production.

## Prerequisites

- Ubuntu 22.04 LTS server with at least 8 CPU cores, 32GB RAM, and 500GB SSD
- Domain name (nexus.gonxt.tech) with DNS A record pointing to 13.246.193.45
- SSH access to the server with sudo privileges
- Docker and Docker Compose installed
- Git installed

## Deployment Steps

### 1. Initial Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common git

# Install Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.3/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create a non-root user for Docker
sudo groupadd docker
sudo usermod -aG docker $USER
```

### 2. Clone Repository

```bash
# Clone the repository
git clone https://github.com/yourusername/nexus-solar-platform.git /opt/nexus-solar-platform
cd /opt/nexus-solar-platform
```

### 3. Configure Environment Variables

```bash
# Create .env file
cat > .env << EOF
# General
TAG=1.0.0
NODE_ENV=production

# Security
JWT_SECRET=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)

# Database
DB_USER=nexus_user
DB_PASSWORD=$(openssl rand -hex 16)
DB_NAME=nexus_db

# Redis
REDIS_PASSWORD=$(openssl rand -hex 16)

# RabbitMQ
RABBITMQ_USER=nexus_mq
RABBITMQ_PASSWORD=$(openssl rand -hex 16)

# Monitoring
GRAFANA_USER=admin
GRAFANA_PASSWORD=$(openssl rand -hex 16)

# Blockchain
BLOCKCHAIN_PROVIDER_URL=https://your-blockchain-provider
CONTRACT_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
WALLET_PRIVATE_KEY=your-private-key

# Domain
DOMAIN=nexus.gonxt.tech
EOF
```

### 4. Set Up SSL Certificate

```bash
# Run SSL setup script
cd /opt/nexus-solar-platform/deployment
chmod +x ssl-setup.sh
sudo ./ssl-setup.sh
```

### 5. Create Docker Volumes and Networks

```bash
# Create Docker volumes
docker volume create postgres-data
docker volume create redis-data
docker volume create rabbitmq-data
docker volume create prometheus-data
docker volume create grafana-data
docker volume create elasticsearch-data
docker volume create ai-models

# Create Docker network
docker network create nexus-network
```

### 6. Build and Start Services

```bash
# Build and start all services
cd /opt/nexus-solar-platform
docker-compose -f deployment/docker-compose.prod.yml build
docker-compose -f deployment/docker-compose.prod.yml up -d
```

### 7. Initialize Database

```bash
# Run database migrations
docker-compose -f deployment/docker-compose.prod.yml exec backend npm run migrate

# Seed initial data
docker-compose -f deployment/docker-compose.prod.yml exec backend npm run seed
```

### 8. Verify Deployment

```bash
# Check if all services are running
docker-compose -f deployment/docker-compose.prod.yml ps

# Check logs for any errors
docker-compose -f deployment/docker-compose.prod.yml logs -f
```

### 9. Set Up Monitoring and Alerting

```bash
# Access Grafana dashboard
# URL: https://nexus.gonxt.tech/grafana
# Username: admin
# Password: (from .env file)

# Import dashboards
# Navigate to Dashboards > Import and upload the JSON files from /opt/nexus-solar-platform/deployment/grafana/dashboards
```

### 10. Set Up Backup Schedule

```bash
# Create backup directory
mkdir -p /opt/nexus-solar-platform/backups

# Set up daily backup cron job
echo "0 2 * * * cd /opt/nexus-solar-platform && docker-compose -f deployment/docker-compose.prod.yml exec -T backup /scripts/backup.sh > /dev/null 2>&1" | sudo tee -a /etc/crontab
```

## Post-Deployment Tasks

### 1. Create Super Admin User

```bash
# Create super admin user
docker-compose -f deployment/docker-compose.prod.yml exec backend npm run create-admin
```

### 2. Configure Firewall

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Set Up Log Rotation

```bash
# Configure log rotation
sudo nano /etc/logrotate.d/docker-containers

# Add the following content
/var/lib/docker/containers/*/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    copytruncate
}
```

### 4. Test SSL Configuration

```bash
# Test SSL configuration
curl -I https://nexus.gonxt.tech

# Expected output should include:
# HTTP/2 200
# strict-transport-security: max-age=15768000; includeSubDomains; preload
```

## Maintenance Procedures

### Updating the Platform

```bash
# Pull latest changes
cd /opt/nexus-solar-platform
git pull

# Rebuild and restart services
docker-compose -f deployment/docker-compose.prod.yml down
docker-compose -f deployment/docker-compose.prod.yml build
docker-compose -f deployment/docker-compose.prod.yml up -d
```

### Backup and Restore

```bash
# Manual backup
docker-compose -f deployment/docker-compose.prod.yml exec backup /scripts/backup.sh

# Restore from backup
docker-compose -f deployment/docker-compose.prod.yml exec backup /scripts/restore.sh BACKUP_FILENAME
```

### Monitoring Logs

```bash
# View logs for all services
docker-compose -f deployment/docker-compose.prod.yml logs -f

# View logs for a specific service
docker-compose -f deployment/docker-compose.prod.yml logs -f backend
```

## Troubleshooting

### Service Not Starting

```bash
# Check service logs
docker-compose -f deployment/docker-compose.prod.yml logs SERVICE_NAME

# Restart a specific service
docker-compose -f deployment/docker-compose.prod.yml restart SERVICE_NAME
```

### Database Connection Issues

```bash
# Check database status
docker-compose -f deployment/docker-compose.prod.yml exec postgres pg_isready -U nexus_user -d nexus_db

# Check database logs
docker-compose -f deployment/docker-compose.prod.yml logs postgres
```

### SSL Certificate Issues

```bash
# Renew SSL certificate manually
sudo certbot renew --force-renewal

# Verify certificate
sudo certbot certificates
```

## Security Considerations

1. Regularly update all services and dependencies
2. Monitor logs for suspicious activities
3. Implement IP whitelisting for admin access
4. Regularly rotate secrets and credentials
5. Perform regular security audits
6. Keep backups in a secure, off-site location
7. Enable and monitor audit logs

## Contact Information

For assistance with deployment issues, contact:
- Technical Support: support@gonxt.tech
- Emergency Support: emergency@gonxt.tech or +1-555-123-4567