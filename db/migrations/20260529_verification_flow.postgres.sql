CREATE TABLE IF NOT EXISTS eligible_students (
  id SERIAL PRIMARY KEY,
  student_name VARCHAR(255) NOT NULL,
  parent_status VARCHAR(100) NOT NULL CHECK (
    parent_status IN ('existing_parent', 'waiting_list_parent')
  ),
  grade VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS parent_status VARCHAR(100);

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) DEFAULT 'not_verified';

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS matched_student_id INTEGER;

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

ALTER TABLE registrations
ALTER COLUMN seat_number DROP NOT NULL;

ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_seat_number_key;

ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_verification_status_check;

ALTER TABLE registrations
ADD CONSTRAINT registrations_verification_status_check
CHECK (verification_status IN ('verified', 'need_review', 'not_verified'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_seat_number_unique
ON registrations(seat_number)
WHERE seat_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eligible_students_parent_status
ON eligible_students(parent_status);

CREATE INDEX IF NOT EXISTS idx_registrations_verification_status
ON registrations(verification_status);

INSERT INTO eligible_students (student_name, parent_status, grade)
SELECT seed.student_name, seed.parent_status, seed.grade
FROM (
  VALUES
    ('Ahmad Zaki', 'existing_parent', 'P1'),
    ('Aisha Nabila', 'existing_parent', 'K2'),
    ('Muhammad Arkan', 'waiting_list_parent', 'P1')
) AS seed(student_name, parent_status, grade)
WHERE NOT EXISTS (
  SELECT 1
  FROM eligible_students existing
  WHERE LOWER(TRIM(existing.student_name)) = LOWER(TRIM(seed.student_name))
    AND existing.parent_status = seed.parent_status
);
