-- OneZero (and future native-2FA banks): phone number + persistent OTP token.
-- Both columns hold ciphertext (IV:CT:TAG) produced by utils/encryption.js.
-- TEXT, not VARCHAR(100), because OTP long-term tokens are JWT-like and exceed 100 chars.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_credentials' AND column_name = 'phone_number') THEN
    ALTER TABLE vendor_credentials ADD COLUMN phone_number TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_credentials' AND column_name = 'otp_long_term_token') THEN
    ALTER TABLE vendor_credentials ADD COLUMN otp_long_term_token TEXT;
  END IF;
END $$;
