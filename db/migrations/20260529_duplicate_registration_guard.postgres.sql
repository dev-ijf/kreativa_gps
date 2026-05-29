ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS duplicate_reference_id INTEGER;

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS matched_student_id INTEGER;

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_verification_status_check;

ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_payment_status_check;

ALTER TABLE registrations
ADD CONSTRAINT registrations_verification_status_check
CHECK (verification_status IN ('verified', 'need_review', 'not_verified', 'already_registered'));

ALTER TABLE registrations
ADD CONSTRAINT registrations_payment_status_check
CHECK (payment_status IN ('pending', 'verified', 'rejected', 'paid', 'confirmed', 'waiting_confirmation', 'failed', 'canceled', 'cancelled', 'expired'));

CREATE INDEX IF NOT EXISTS idx_registrations_duplicate_reference_id
ON registrations(duplicate_reference_id);

CREATE INDEX IF NOT EXISTS idx_registrations_matched_student_active
ON registrations(matched_student_id, verification_status, payment_status)
WHERE matched_student_id IS NOT NULL;
