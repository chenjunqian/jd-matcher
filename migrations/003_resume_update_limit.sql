ALTER TABLE user_info ADD COLUMN resume_update_date TEXT;
ALTER TABLE user_info ADD COLUMN resume_update_count INTEGER DEFAULT 0;
