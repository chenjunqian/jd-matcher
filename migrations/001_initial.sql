CREATE TABLE IF NOT EXISTS job_detail (
    id TEXT PRIMARY KEY,
    title TEXT,
    job_desc TEXT,
    job_tags TEXT,
    link TEXT UNIQUE,
    source TEXT,
    location TEXT,
    salary TEXT,
    update_time TEXT,
    vectorize_id TEXT
);

CREATE TABLE IF NOT EXISTS user_info (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    telegram_id TEXT,
    resume TEXT DEFAULT '',
    job_expectations TEXT,
    vectorize_id TEXT
);

CREATE TABLE IF NOT EXISTS user_matched_job (
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    update_time TEXT,
    notification INTEGER DEFAULT 0,
    match_score TEXT,
    match_reason TEXT,
    PRIMARY KEY (user_id, job_id)
);
