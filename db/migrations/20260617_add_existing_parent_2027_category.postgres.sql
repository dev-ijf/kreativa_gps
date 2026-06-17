ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_parent_category_check;

ALTER TABLE registrations
ADD CONSTRAINT registrations_parent_category_check
CHECK (parent_category IN ('existing', 'existing_2027', 'waitlist', 'general'));

ALTER TABLE eligible_students
DROP CONSTRAINT IF EXISTS eligible_students_parent_status_check;

ALTER TABLE eligible_students
ADD CONSTRAINT eligible_students_parent_status_check
CHECK (parent_status IN ('existing_parent', 'existing_parent_2027', 'waiting_list_parent', 'has_not_registered'));
