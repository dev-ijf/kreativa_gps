ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_attendee_count_check;

ALTER TABLE registrations
ADD CONSTRAINT registrations_attendee_count_check
CHECK (attendee_count BETWEEN 1 AND 2);

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS ticket_price INTEGER NOT NULL DEFAULT 0;

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS total_amount INTEGER NOT NULL DEFAULT 0;

ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_ticket_price_check;

ALTER TABLE registrations
ADD CONSTRAINT registrations_ticket_price_check
CHECK (ticket_price >= 0);

ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_total_amount_check;

ALTER TABLE registrations
ADD CONSTRAINT registrations_total_amount_check
CHECK (total_amount >= 0);

UPDATE registrations
SET lunch_box_count = attendee_count
WHERE lunch_box_count <> attendee_count;

ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_lunch_matches_attendees;

ALTER TABLE registrations
ADD CONSTRAINT registrations_lunch_matches_attendees
CHECK (lunch_box_count = attendee_count);
