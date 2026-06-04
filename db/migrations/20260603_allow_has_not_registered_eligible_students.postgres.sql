ALTER TABLE eligible_students
DROP CONSTRAINT IF EXISTS eligible_students_parent_status_check;

ALTER TABLE eligible_students
ADD CONSTRAINT eligible_students_parent_status_check
CHECK (parent_status IN ('existing_parent', 'waiting_list_parent', 'has_not_registered'));
