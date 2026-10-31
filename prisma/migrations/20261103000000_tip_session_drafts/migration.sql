-- Tips are staged on the session and only become recommendations once approved.
ALTER TABLE "tip_session" ADD COLUMN "drafts" JSONB NOT NULL DEFAULT '{}';
