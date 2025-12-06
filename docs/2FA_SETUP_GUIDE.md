# 2-Step Verification (2FA) Setup Guide

## Overview

Admin and Super Admin users are now required to verify their identity using a 6-digit code sent to their email address during login. This adds an extra layer of security to protect privileged accounts.

## Prerequisites

### Email Configuration

2FA requires a working email configuration. Update your `.env` file with the following:

```env
# Email Configuration
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-gmail-app-password
EMAIL_TO=notifications@yourdomain.com
```

### Gmail App Password Setup

> **Important:** Regular Gmail passwords will not work. You must create an App Password.

1. Go to your [Google Account Settings](https://myaccount.google.com/)
2. Navigate to **Security** → **2-Step Verification**
3. Scroll down to **App Passwords**
4. Select **Mail** and your device
5. Copy the 16-character password
6. Use this password in `EMAIL_PASS` (no spaces)

## How It Works

### For Viewer Users
- ✅ Login normally (username + password only)
- ✅ No 2FA required

### For Admin & Super Admin Users
1. Enter username and password
2. Click "Sign In"
3. Check your email for a 6-digit code
4. Enter the code on the verification screen
5. Click "Verify Code"
6. Access granted!

## User Experience

### Login Flow

```
[Username + Password] → [Check Email] → [Enter OTP] → [Dashboard]
```

### OTP Email Example

```
Subject: 🔐 Your Login Verification Code

Hello Admin,

Your verification code for GPON Monitor login is:

123456

This code will expire in 10 minutes.

Security Notice:
- DO NOT share this code with anyone
- We will never ask for this code via phone or email
- If you didn't attempt to login, please secure your account immediately

Best regards,
GPON Monitor Security Team
```

## Security Features

### OTP Properties
- **Length:** 6 digits (numeric)
- **Validity:** 10 minutes
- **Single-use:** Code is invalidated after successful verification
- **Storage:** Codes are bcrypt-hashed in the database

### Protection Mechanisms
- **Attempt Limit:** 5 failed verification attempts allowed
- **Account Lockout:** 30-minute lockout after max attempts exceeded
- **Resend Limit:** 60-second cooldown between resend requests
- **Email Masking:** Email addresses are partially masked in responses

### Example Security Flow

```
Attempt 1: Wrong code → "Invalid code. 4 attempts remaining."
Attempt 2: Wrong code → "Invalid code. 3 attempts remaining."
Attempt 3: Wrong code → "Invalid code. 2 attempts remaining."
Attempt 4: Wrong code → "Invalid code. 1 attempt remaining."
Attempt 5: Wrong code → "Account locked for 30 minutes."
```

## Common Issues & Solutions

### Issue: Not Receiving OTP Email

**Possible Causes:**
1. Incorrect email configuration
2. Gmail App Password not used
3. Email in spam/junk folder
4. SMTP blocked by firewall

**Solutions:**
1. Verify `EMAIL_USER` and `EMAIL_PASS` in `.env`
2. Ensure you're using an App Password, not your regular password
3. Check spam/junk folder
4. Test email configuration:
   ```bash
   node -e "const ns = require('./services/NotificationService'); ns.sendOTPEmail('test@email.com', '123456', 'Test User').then(console.log).catch(console.error)"
   ```

### Issue: OTP Code Expired

**Cause:** OTP codes expire after 10 minutes.

**Solution:** Click "Resend Code" to receive a fresh code.

### Issue: Account Locked

**Cause:** 5 failed verification attempts.

**Solution:** 
1. Wait 30 minutes for automatic unlock, or
2. Super admin can unlock via database:
   ```sql
   UPDATE profiles 
   SET twofa_locked_until = NULL, twofa_attempts = 0 
   WHERE username = 'locked-user';
   ```

### Issue: Can't Resend Code

**Cause:** 60-second cooldown between resend requests.

**Solution:** Wait for the countdown timer to reach 0, then click "Resend Code".

## Admin Functions

### Check 2FA Status

```sql
SELECT id, username, role, twofa_enabled, twofa_attempts, twofa_locked_until
FROM profiles
WHERE role IN ('admin', 'super_admin');
```

### Enable/Disable 2FA for a User

```sql
-- Disable 2FA
UPDATE profiles SET twofa_enabled = 0 WHERE username = 'someadmin';

-- Enable 2FA
UPDATE profiles SET twofa_enabled = 1 WHERE username = 'someadmin';
```

### Unlock a Locked Account

```sql
UPDATE profiles 
SET twofa_locked_until = NULL, twofa_attempts = 0 
WHERE username = 'locked-user';
```

### Clear OTP for a User

```sql
UPDATE profiles 
SET twofa_secret = NULL, 
    twofa_secret_expires = NULL,
    twofa_attempts = 0
WHERE username = 'someadmin';
```

## Testing 2FA

### Test Credentials

Assuming you have these test users in your database:

| Username | Role | 2FA Enabled |
|----------|------|-------------|
| viewer | viewer | ❌ No |
| admin | admin | ✅ Yes |
| melaku | super_admin | ✅ Yes |

### Test Procedure

1. **Test viewer (no 2FA):**
   - Login with viewer credentials
   - Should go directly to dashboard

2. **Test admin (with 2FA):**
   - Login with admin credentials
   - Should show OTP verification screen
   - Check email for code
   - Enter code and verify
   - Should reach dashboard

3. **Test resend:**
   - Start admin login
   - Click "Resend Code"
   - Wait for countdown (60s)
   - Verify new code works

4. **Test invalid code:**
   - Start admin login
   - Enter wrong code (e.g., 000000)
   - Verify error message shows
   - Verify attempts counter decrements

## Monitoring & Logs

### Check Recent 2FA Activity

All 2FA events are logged. Check your application logs:

```bash
# Linux/Mac
tail -f logs/combined.log | grep -i "2FA\|OTP"

# Windows PowerShell
Get-Content logs\combined.log -Wait | Select-String -Pattern "2FA|OTP"
```

### Example Log Entries

```
[INFO] 2FA initiated for user: admin (admin)
[INFO] OTP sent successfully { userId: 9, email: 'admin1@gmail.com' }
[INFO] OTP verified successfully { userId: 9 }
[INFO] User logged in via 2FA: admin (admin)
```

```
[WARN] Invalid OTP attempt { userId: 9, attempts: 1 }
[WARN] Invalid OTP attempt { userId: 9, attempts: 2 }
[WARN] Account locked due to failed 2FA attempts { userId: 9 }
```

## Database Schema

### New Columns in `profiles` Table

```sql
-- 2FA control
twofa_enabled BOOLEAN DEFAULT 0

-- OTP storage (bcrypt hashed)
twofa_secret TEXT

-- OTP expiry (Unix timestamp)
twofa_secret_expires INTEGER

-- Security tracking
twofa_attempts INTEGER DEFAULT 0
twofa_locked_until INTEGER
```

## API Endpoints

### POST /api/auth/login

Standard login endpoint that now checks for 2FA requirement.

**Request:**
```json
{
  "username": "admin",
  "password": "yourpassword"
}
```

**Response (2FA Required):**
```json
{
  "requiresTwoFactor": true,
  "userId": 9,
  "email": "ad***@gmail.com",
  "message": "Verification code sent to your email"
}
```

**Response (No 2FA - Viewer):**
```json
{
  "message": "Login successful",
  "user": { ... },
  "token": "jwt-token"
}
```

### POST /api/auth/verify-2fa

Verify OTP and receive JWT token.

**Request:**
```json
{
  "userId": 9,
  "code": "123456"
}
```

**Success Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": 9,
    "username": "admin",
    "email": "admin1@gmail.com",
    "full_name": "Admin User",
    "role": "admin"
  },
  "token": "eyJhbGc..."
}
```

**Error Response:**
```json
{
  "error": "Invalid verification code. 3 attempt(s) remaining.",
  "attemptsRemaining": 3
}
```

### POST /api/auth/resend-otp

Request a new OTP code.

**Request:**
```json
{
  "userId": 9
}
```

**Response:**
```json
{
  "message": "Verification code sent to your email",
  "email": "ad***@gmail.com"
}
```

## Best Practices

### For Users
1. ✅ Check your spam folder if code doesn't arrive
2. ✅ Don't share your OTP code with anyone
3. ✅ Ensure your email account is secure
4. ✅ Use a strong password for your account
5. ✅ Report suspicious login attempts immediately

### For Administrators
1. ✅ Monitor failed 2FA attempts in logs
2. ✅ Keep email credentials secure
3. ✅ Regularly review locked accounts
4. ✅ Test email delivery periodically
5. ✅ Backup your database regularly
6. ✅ Use Gmail App Passwords, never store regular passwords

## Disabling 2FA (Emergency)

If you need to temporarily disable 2FA system-wide:

```sql
-- Disable for all users
UPDATE profiles SET twofa_enabled = 0;

-- Or disable for specific user
UPDATE profiles SET twofa_enabled = 0 WHERE username = 'admin';
```

> **Warning:** This bypasses the security layer. Only use in emergencies.

## Support

If you encounter issues not covered in this guide:

1. Check application logs in `/logs/combined.log`
2. Verify email configuration in `.env`
3. Test with a viewer account first (no 2FA)
4. Review the [walkthrough document](file:///C:/Users/lenovo/.gemini/antigravity/brain/0607bdc3-d716-4ef4-b53a-eb9d2d5e63a4/walkthrough.md)

---

**Last Updated:** December 6, 2025
**Version:** 1.0
