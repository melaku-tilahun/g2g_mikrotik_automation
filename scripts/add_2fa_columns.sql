-- Migration script for adding 2FA support to profiles table
-- Run this script to add necessary columns for two-factor authentication

-- Add 2FA columns to profiles table
ALTER TABLE profiles ADD COLUMN twofa_enabled BOOLEAN DEFAULT 0;
ALTER TABLE profiles ADD COLUMN twofa_secret TEXT;
ALTER TABLE profiles ADD COLUMN twofa_secret_expires INTEGER;
ALTER TABLE profiles ADD COLUMN twofa_attempts INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN twofa_locked_until INTEGER;

-- Enable 2FA by default for admin and super_admin users
UPDATE profiles 
SET twofa_enabled = 1 
WHERE role IN ('admin', 'super_admin');

-- Verification query to check new columns
SELECT 
    id, 
    username, 
    role, 
    twofa_enabled,
    email
FROM profiles
ORDER BY role DESC;
