CREATE TABLE registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL UNIQUE,
  parent_category TEXT NOT NULL CHECK (parent_category IN ('existing', 'existing_2027', 'waitlist', 'general')),
  waiting_list_status TEXT,
  student_level TEXT NOT NULL,
  student_name TEXT NOT NULL,
  parent_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  attendee_count INTEGER NOT NULL DEFAULT 1 CHECK (attendee_count BETWEEN 1 AND 3),
  lunch_box_count INTEGER NOT NULL DEFAULT 0 CHECK (lunch_box_count BETWEEN 0 AND 10),
  ticket_price INTEGER NOT NULL DEFAULT 0 CHECK (ticket_price >= 0),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  seat_number TEXT NOT NULL UNIQUE,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'verified', 'rejected')),
  payment_proof_filename TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'attended')),
  notes TEXT,
  checked_in_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (lunch_box_count = attendee_count)
);

CREATE INDEX idx_registrations_parent_category ON registrations(parent_category);
CREATE INDEX idx_registrations_payment_status ON registrations(payment_status);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_created_at ON registrations(created_at);

CREATE TRIGGER registrations_updated_at
AFTER UPDATE ON registrations
FOR EACH ROW
BEGIN
  UPDATE registrations SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
