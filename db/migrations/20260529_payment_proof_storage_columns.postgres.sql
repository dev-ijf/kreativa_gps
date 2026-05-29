ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS payment_proof_filename TEXT;

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS payment_proof_mime_type TEXT;

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS payment_proof_data TEXT;
