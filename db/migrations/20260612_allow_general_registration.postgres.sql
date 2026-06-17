ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_parent_category_check;

ALTER TABLE registrations
ADD CONSTRAINT registrations_parent_category_check
CHECK (parent_category IN ('existing', 'existing_2027', 'waitlist', 'general'));
