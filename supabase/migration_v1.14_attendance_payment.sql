ALTER TABLE records
  DROP CONSTRAINT IF EXISTS records_attendance_check;

ALTER TABLE records
  ADD CONSTRAINT records_attendance_check
    CHECK (attendance IN ('present', 'absent', 'makeup', 'payment'));
