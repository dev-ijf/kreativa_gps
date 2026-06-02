ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_attendee_count_check;

ALTER TABLE registrations
ADD CONSTRAINT registrations_attendee_count_check
CHECK (attendee_count BETWEEN 1 AND 3);
