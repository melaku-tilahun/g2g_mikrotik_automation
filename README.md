# GPON Network Monitor

A comprehensive network monitoring solution for MikroTik GPON queues with real-time traffic analysis, intelligent alerting, and a modern web dashboard.

## Features

### Core Monitoring
- **Real-time Traffic Monitoring**: Polls MikroTik router every 30 seconds for queue statistics
- **Intelligent Alerting**: Two-tier alert system (5 minutes + 24 hours) via Email and Telegram
- **Traffic Logging**: Historical traffic data stored in SQLite database
- **Configurable Thresholds**: Per-queue traffic thresholds with active/inactive status

### Dashboard
- **Live Dashboard**: Real-time web interface with auto-refresh
- **Traffic Visualization**: 24-hour traffic charts with Chart.js
- **Dark/Light Theme**: Persistent theme preference
- **Search & Filter**: Quick queue search functionality
- **Mobile Responsive**: Works on all devices

### Enhanced Features (New!)
- **Structured Logging**: Winston-based logging with rotation
- **Metrics Collection**: Prometheus-compatible metrics endpoint
- **Health Checks**: Kubernetes-ready health/readiness/liveness probes
- **Alert Management**: Centralized alert service with state persistence
- **Audit Logging**: Configuration change tracking
- **Input Validation**: Request validation and sanitization
- **Performance Monitoring**: API response time and error tracking

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- MikroTik router with RouterOS API enabled
- Gmail account for email alerts (optional)
- Telegram bot token (optional)

### Installation

1. **Clone and install dependencies**:
   ```bash
   cd c:\projects\g2gauto
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run database migration**:
   ```bash
   npm run migrate
   ```

4. **Start the server**:
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

5. **Access the dashboard**:
   Open http://localhost:3000 in your browser

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Server
PORT=3000
NODE_ENV=production
ALLOWED_ORIGIN=http://localhost:3000

# MikroTik Router
MIKROTIK_HOST=192.168.1.1
MIKROTIK_USER=admin
MIKROTIK_PASS=your_password
MIKROTIK_PORT=8728

# Email Alerts
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_TO=alerts@example.com

# Telegram Alerts (Optional)
TELEGRAM_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Authentication (Optional)
ADMIN_USER=admin
ADMIN_PASS=secure_password
```

### MikroTik Setup

1. Enable API on your MikroTik router:
   ```
   /ip service enable api
   /ip service set api port=8728
   ```

2. Create a user with API access:
   ```
   /user add name=monitor password=your_password group=read
   ```

3. Ensure GPON queues are named with "GPON" prefix

## API Endpoints

### Queue Management
- `GET /api/queues` - List all GPON queues with current traffic
- `GET /api/statuses` - Get queue monitoring status and thresholds
- `POST /api/statuses/bulk` - Update queue status and thresholds (requires auth)

### Traffic Data
- `GET /api/traffic/:name` - Get 24-hour traffic history for a queue

### Monitoring
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness probe (checks DB + MikroTik)
- `GET /health/live` - Liveness probe
- `GET /metrics` - Prometheus metrics

## Development

### Available Scripts

```bash
npm start          # Start production server
npm run dev        # Start with nodemon (auto-reload)
npm test           # Run tests with coverage
npm run lint       # Check code quality
npm run lint:fix   # Fix linting issues
npm run format     # Format code with Prettier
npm run migrate    # Run database migrations
```

### Project Structure

```
c:\projects\g2gauto\
├── config/
│   └── default.js          # Centralized configuration
├── middleware/
│   ├── metrics.js          # Prometheus metrics
│   └── validator.js        # Request validation
├── routes/
│   ├── queues.js           # Queue API
│   ├── statuses.js         # Status management API
│   ├── traffic.js          # Traffic data API
│   ├── health.js           # Health checks
│   └── metrics.js          # Metrics endpoint
├── services/
│   └── AlertManager.js     # Alert orchestration
├── utils/
│   └── logger.js           # Structured logging
├── scripts/
│   └── migrate.js          # Database migrations
├── public/
│   └── index.html          # Dashboard UI
├── logs/                   # Application logs
├── backups/                # Database backups
├── server.js               # Express server
├── monitor.js              # Monitoring loop
├── mikrotik.js             # MikroTik API client
├── db.js                   # Database setup
├── email.js                # Email notifications
├── telegram.js             # Telegram notifications
└── package.json
```

### Database Schema

**statuses** - Queue monitoring configuration
- `name` (PK) - Queue name
- `status` - Active/Inactive
- `threshold_kb` - Alert threshold in KB/s
- `updated_at` - Last update timestamp

**traffic_log** - Historical traffic data
- `id` (PK)
- `name` - Queue name (FK)
- `rx` - Received bytes
- `tx` - Transmitted bytes
- `timestamp` - Unix timestamp

**alerts** - Active alerts
- `id` (PK)
- `name` - Queue name
- `start_time` - Alert start timestamp
- `end_time` - Alert resolution timestamp
- `notified_first` - First notification sent
- `notified_second` - Second notification sent

**alert_history** - Alert audit trail
- `id` (PK)
- `name` - Queue name
- `alert_type` - first/second/recovery
- `traffic_kb` - Traffic at alert time
- `threshold_kb` - Threshold value
- `triggered_at` - Timestamp

**health_metrics** - System health data
- `id` (PK)
- `metric_name` - Metric identifier
- `metric_value` - Metric value
- `timestamp` - Timestamp

**config_changes** - Configuration audit log
- `id` (PK)
- `name` - Queue name
- `field` - Changed field
- `old_value` - Previous value
- `new_value` - New value
- `changed_at` - Timestamp
- `changed_by` - IP or user

## Monitoring & Observability

### Logs

Logs are written to `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only

Log levels: error, warn, info, debug

### Metrics

Prometheus metrics available at `/metrics`:

- `http_request_duration_seconds` - HTTP request latency
- `http_requests_total` - Total HTTP requests
- `gpon_active_count` - Number of active GPON queues
- `alerts_total` - Total alerts sent (by type and channel)
- `mikrotik_api_duration_seconds` - MikroTik API call latency
- `mikrotik_api_errors_total` - MikroTik API errors (by type)

### Health Checks

- `/health` - Returns 200 if server is running
- `/health/ready` - Returns 200 if DB and MikroTik are accessible
- `/health/live` - Returns 200 if process is responsive

## Alert System

### Alert Flow

1. **Traffic drops below threshold** → Start tracking
2. **After 5 minutes** → Send first alert (email + Telegram)
3. **After 24 hours** → Send second alert if still down
4. **Traffic recovers** → Clear alert state

### Alert State Persistence

Alert state is persisted to database and restored on restart to prevent:
- Duplicate alerts after server restart
- Lost alert tracking during downtime

### Alert Configuration

Configure per-queue in the dashboard:
- **Status**: Active (monitored) or Inactive (ignored)
- **Threshold**: Traffic threshold in KB/s (default: 10)

## Security

### Implemented Protections

- **Helmet.js**: Security headers (CSP, XSS protection)
- **CORS**: Configurable origin whitelist
- **Rate Limiting**: API and status endpoint limits
- **Input Validation**: Request validation with express-validator
- **SQL Injection**: Parameterized queries
- **Basic Auth**: Optional authentication for admin endpoints
- **Audit Logging**: Configuration change tracking

### Recommendations

1. Use strong passwords for MikroTik and admin access
2. Enable HTTPS in production (use reverse proxy like nginx)
3. Restrict ALLOWED_ORIGIN to your domain
4. Use environment-specific .env files
5. Regularly review audit logs

## Troubleshooting

### Common Issues

**MikroTik connection fails**
- Verify API is enabled on router
- Check firewall rules allow port 8728
- Verify credentials in .env

**Email alerts not sending**
- Use Gmail App Password, not regular password
- Enable "Less secure app access" or use OAuth2
- Check EMAIL_USER and EMAIL_TO are correct

**Telegram alerts not sending**
- Verify bot token is correct
- Ensure bot is added to chat
- Get chat ID using `/getUpdates` API

**Dashboard not loading**
- Check server is running on correct port
- Verify ALLOWED_ORIGIN includes your domain
- Check browser console for errors

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

## Performance

### Optimization Tips

1. **Database**: Vacuum regularly to reclaim space
   ```bash
   sqlite3 gpon.db "VACUUM;"
   ```

2. **Data Retention**: Old traffic logs auto-archived (30 days default)

3. **Polling Interval**: Adjust POLL_INTERVAL for your needs (default: 30s)

4. **Rate Limiting**: Tune limits based on usage patterns

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure ALLOWED_ORIGIN whitelist
- [ ] Enable HTTPS (reverse proxy)
- [ ] Set strong ADMIN_PASS
- [ ] Configure log rotation
- [ ] Set up database backups
- [ ] Monitor /metrics endpoint
- [ ] Configure health check monitoring

### Docker Deployment (Future)

```dockerfile
# Coming soon
```

### Systemd Service

```ini
[Unit]
Description=GPON Monitor
After=network.target

[Service]
Type=simple
User=gpon
WorkingDirectory=/opt/g2gauto
ExecStart=/usr/bin/node server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Contributing

### Code Style

- ESLint configuration in `.eslintrc.js`
- Prettier configuration in `.prettierrc`
- Run `npm run lint:fix` before committing

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

## License

MIT

## Support

For issues and questions:
- Check logs in `logs/` directory
- Review health checks at `/health/ready`
- Check metrics at `/metrics`
- Review audit logs in database

## Changelog

### Version 2.0.0 (Current)

**New Features:**
- Centralized configuration management
- Structured logging with Winston
- Prometheus metrics collection
- Health check endpoints
- Alert state persistence
- Configuration audit logging
- Input validation and sanitization
- Enhanced error handling
- Graceful shutdown

**Improvements:**
- Better MikroTik connection handling
- Improved security middleware
- Performance monitoring
- Code quality tooling (ESLint, Prettier)

**Breaking Changes:**
- Database schema updated (run migration)
- New dependencies required (run npm install)
- Configuration moved to config/default.js

### Version 1.0.0

- Initial release
- Basic monitoring and alerting
- Web dashboard
- Email and Telegram notifications
