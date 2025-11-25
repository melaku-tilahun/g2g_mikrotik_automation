# Alert Configuration Guide

## Quick Configuration

All alert timing and threshold settings are centralized in [`config/default.js`](file:///c:/projects/g2gauto/config/default.js) for easy modification.

### Location

Open `config/default.js` and find the `alertConfig` section (around line 24):

```javascript
// ============================================
// ALERT CONFIGURATION - Easy to modify
// ============================================
alertConfig: {
    // Default traffic threshold in KB/s (0 = any traffic drop triggers alert)
    defaultThreshold: 0,
    
    // Time to wait before sending first alert (in minutes)
    firstAlertDelayMinutes: 10,
    
    // Time to wait before sending second alert (in hours)
    secondAlertDelayHours: 1,
    
    // Enable recovery notifications when traffic returns to normal
    sendRecoveryNotifications: false
}
```

## Configuration Options

### 1. Traffic Threshold (`defaultThreshold`)

**What it does**: Minimum traffic level (in KB/s) before triggering an alert.

**Current value**: `0` KB/s (any traffic drop triggers alert)

**Examples**:
```javascript
defaultThreshold: 0,    // Alert on any traffic drop
defaultThreshold: 5,    // Alert when traffic < 5 KB/s
defaultThreshold: 10,   // Alert when traffic < 10 KB/s
defaultThreshold: 100,  // Alert when traffic < 100 KB/s
```

**When to change**:
- Set to `0` if you want to be notified of any traffic issues
- Set higher (e.g., 5-10) to ignore very low traffic fluctuations
- Adjust based on your typical GPON traffic patterns

---

### 2. First Alert Delay (`firstAlertDelayMinutes`)

**What it does**: How long to wait after traffic drops before sending the first alert.

**Current value**: `10` minutes

**Examples**:
```javascript
firstAlertDelayMinutes: 5,   // Alert after 5 minutes
firstAlertDelayMinutes: 10,  // Alert after 10 minutes (current)
firstAlertDelayMinutes: 15,  // Alert after 15 minutes
firstAlertDelayMinutes: 30,  // Alert after 30 minutes
```

**When to change**:
- Shorter delay (5 min) for critical queues requiring immediate attention
- Longer delay (15-30 min) to avoid alerts for brief outages
- Consider your typical recovery time and tolerance for downtime

---

### 3. Second Alert Delay (`secondAlertDelayHours`)

**What it does**: How long after the first alert to send a second "still down" alert.

**Current value**: `1` hour

**Examples**:
```javascript
secondAlertDelayHours: 0.5,  // Alert after 30 minutes
secondAlertDelayHours: 1,    // Alert after 1 hour (current)
secondAlertDelayHours: 2,    // Alert after 2 hours
secondAlertDelayHours: 24,   // Alert after 24 hours
```

**When to change**:
- Shorter delay (0.5-1 hour) for critical infrastructure
- Longer delay (2-24 hours) for less critical queues
- Consider your escalation procedures and response times

---

### 4. Recovery Notifications (`sendRecoveryNotifications`)

**What it does**: Whether to send a notification when traffic returns to normal.

**Current value**: `false` (disabled)

**Options**:
```javascript
sendRecoveryNotifications: false,  // No recovery notifications (current)
sendRecoveryNotifications: true,   // Send recovery notifications
```

**When to enable**:
- Enable if you want confirmation that issues are resolved
- Disable to reduce notification volume
- Useful for tracking resolution times

---

## How to Update Configuration

### Step 1: Edit the File

Open `config/default.js` in your editor:

```bash
# Windows
notepad config/default.js

# VS Code
code config/default.js
```

### Step 2: Modify Values

Change the values in the `alertConfig` section:

```javascript
alertConfig: {
    defaultThreshold: 5,              // Changed from 0 to 5
    firstAlertDelayMinutes: 15,       // Changed from 10 to 15
    secondAlertDelayHours: 2,         // Changed from 1 to 2
    sendRecoveryNotifications: true   // Changed from false to true
}
```

### Step 3: Restart the Server

```bash
# Stop the server (Ctrl+C)
# Then restart
npm start
```

The new configuration will be loaded and logged on startup:

```
[INFO]: AlertManager initialized {
  firstAlertDelay: '15 minutes',
  secondAlertDelay: '2 hours',
  defaultThreshold: '5 KB/s',
  recoveryNotifications: true
}
```

---

## Notification Channels

The system now uses a **unified notification service** that supports multiple channels:

### Currently Supported

1. **Email** (via Gmail)
   - Configured in `.env`: `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_TO`
   - Automatically enabled if credentials are provided

2. **Telegram**
   - Configured in `.env`: `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`
   - Automatically enabled if credentials are provided

### Adding Future Channels

The notification system is designed for scalability. To add a new channel (e.g., Slack, SMS, webhook):

1. Open `services/NotificationService.js`
2. Add a new send method (e.g., `sendSlack`)
3. Register it in `initializeChannels()`

Example:
```javascript
// Add Slack channel
if (config.slack.webhookUrl) {
    this.channels.push({
        name: 'slack',
        enabled: true,
        send: this.sendSlack.bind(this)
    });
}
```

---

## Alert Types

The system sends three types of alerts:

### 1. First Alert
- **When**: After `firstAlertDelayMinutes` of low traffic
- **Subject**: "⚠️ ALERT: [Queue] - Low Traffic Detected"
- **Channels**: All enabled (email + Telegram)

### 2. Second Alert
- **When**: After `secondAlertDelayHours` of continued low traffic
- **Subject**: "🚨 CRITICAL: [Queue] - Still Down After X Hour(s)"
- **Channels**: All enabled (email + Telegram)

### 3. Recovery Alert (Optional)
- **When**: Traffic returns above threshold
- **Subject**: "✅ RECOVERED: [Queue] - Traffic Restored"
- **Channels**: All enabled (email + Telegram)
- **Enabled**: Only if `sendRecoveryNotifications: true`

---

## Per-Queue Thresholds

While `defaultThreshold` applies to all queues, you can set per-queue thresholds in the dashboard:

1. Open http://localhost:3000
2. Find the queue in the table
3. Modify the "Threshold" column
4. Changes save automatically

**Note**: Per-queue thresholds override the default threshold.

---

## Verification

After changing configuration, verify it's working:

### 1. Check Logs

```bash
tail -f logs/combined.log
```

Look for:
```
[INFO]: AlertManager initialized {
  firstAlertDelay: '10 minutes',
  secondAlertDelay: '1 hours',
  defaultThreshold: '0 KB/s',
  recoveryNotifications: false
}
```

### 2. Test Alert Flow

1. Set a queue to Active with threshold 1000 KB/s
2. Wait 10 minutes (or your configured delay)
3. Check email/Telegram for first alert
4. Wait 1 hour (or your configured delay)
5. Check for second alert

### 3. Monitor Metrics

Visit http://localhost:3000/metrics and check:
- `alerts_total{type="first"}` - First alerts sent
- `alerts_total{type="second"}` - Second alerts sent
- `alerts_total{type="recovery"}` - Recovery alerts sent

---

## Troubleshooting

### Alerts Not Sending

1. **Check notification channels**:
   ```bash
   # Look for these lines in logs:
   [INFO]: Email notification channel enabled
   [INFO]: Telegram notification channel enabled
   ```

2. **Verify credentials** in `.env`:
   - Email: `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_TO`
   - Telegram: `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`

3. **Check alert history**:
   ```sql
   sqlite3 gpon.db "SELECT * FROM alert_history ORDER BY triggered_at DESC LIMIT 10;"
   ```

### Wrong Timing

1. **Verify configuration** in `config/default.js`
2. **Restart server** to load new config
3. **Check logs** for "AlertManager initialized" message

### Threshold Not Working

1. **Check per-queue threshold** in dashboard (overrides default)
2. **Verify queue status** is "Active"
3. **Check traffic values** in dashboard

---

## Best Practices

### Recommended Settings

**For Critical Infrastructure**:
```javascript
alertConfig: {
    defaultThreshold: 0,              // Alert on any drop
    firstAlertDelayMinutes: 5,        // Quick response
    secondAlertDelayHours: 0.5,       // Escalate fast
    sendRecoveryNotifications: true   // Confirm resolution
}
```

**For Standard Monitoring**:
```javascript
alertConfig: {
    defaultThreshold: 5,              // Ignore minor fluctuations
    firstAlertDelayMinutes: 10,       // Avoid false alarms
    secondAlertDelayHours: 1,         // Reasonable escalation
    sendRecoveryNotifications: false  // Reduce noise
}
```

**For Non-Critical Queues**:
```javascript
alertConfig: {
    defaultThreshold: 10,             // Higher tolerance
    firstAlertDelayMinutes: 30,       // Longer wait
    secondAlertDelayHours: 24,        // Daily check-in
    sendRecoveryNotifications: false  // Minimal notifications
}
```

---

## Summary

- **All alert settings** are in `config/default.js` → `alertConfig` section
- **Easy to modify** - just edit the file and restart
- **Current defaults**: 0 KB/s threshold, 10 min first alert, 1 hour second alert
- **Unified notifications** - one service handles all channels
- **Scalable design** - easy to add new notification channels

For questions or issues, check the logs at `logs/combined.log` or `logs/error.log`.
