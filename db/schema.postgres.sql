CREATE TABLE IF NOT EXISTS registrations (
  id BIGSERIAL PRIMARY KEY,
  registration_id VARCHAR(30) NOT NULL UNIQUE,
  parent_category VARCHAR(20) NOT NULL CHECK (
    parent_category IN ('existing', 'existing_2027', 'waitlist', 'general')
  ),
  waiting_list_status VARCHAR(30),
  student_level VARCHAR(100) NOT NULL,
  student_name VARCHAR(150) NOT NULL,
  parent_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(150) NOT NULL,
  attendee_count INTEGER NOT NULL DEFAULT 1 CHECK (
    attendee_count BETWEEN 1 AND 3
  ),
  lunch_box_count INTEGER NOT NULL DEFAULT 0 CHECK (
    lunch_box_count BETWEEN 0 AND 10
  ),
  ticket_price INTEGER NOT NULL DEFAULT 0 CHECK (
    ticket_price >= 0
  ),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (
    total_amount >= 0
  ),
  seat_number VARCHAR(20) NOT NULL UNIQUE,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'verified', 'rejected')
  ),
  payment_proof_filename TEXT,
  payment_proof_mime_type TEXT,
  payment_proof_data TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (
    status IN ('confirmed', 'cancelled', 'attended')
  ),
  notes TEXT,
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT registrations_lunch_matches_attendees
    CHECK (lunch_box_count = attendee_count)
);

CREATE INDEX IF NOT EXISTS idx_registrations_parent_category
ON registrations(parent_category);

CREATE INDEX IF NOT EXISTS idx_registrations_payment_status
ON registrations(payment_status);

CREATE INDEX IF NOT EXISTS idx_registrations_status
ON registrations(status);

CREATE INDEX IF NOT EXISTS idx_registrations_created_at
ON registrations(created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_registrations_updated_at ON registrations;

CREATE TRIGGER trg_registrations_updated_at
BEFORE UPDATE ON registrations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
