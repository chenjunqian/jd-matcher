CREATE TABLE job_detail (
    id varchar(64) NOT NULL,
    title varchar(128),
    job_desc text,
    job_tags text [],
    link varchar(128),
    source varchar(64),
    PRIMARY KEY (id)
);

ALTER TABLE job_detail ADD CONSTRAINT unique_link UNIQUE (link);

CREATE TABLE user_info (
    id varchar(64) NOT NULL,
    name varchar(64),
    email varchar(64),
    telegram_id varchar(64),
    PRIMARY KEY (id)
);

CREATE TABLE user_matched_job (
    user_id varchar(64) NOT NULL,
    job_id varchar(64) NOT NULL,
    update_time timestamp,
    PRIMARY KEY (user_id, job_id),
);