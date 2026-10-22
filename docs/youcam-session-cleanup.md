# YouCam session cleanup: what the docs say (checked 22 Oct 2026)

Question: is there an endpoint to delete uploaded files or tasks?

Answer: none documented.

- https://docs.perfectcorp.com/llms.txt (all 639,381 characters scanned): the only methods on the File and Task APIs are
  `POST /s2s/v2.0/file`, `PUT` to the pre-signed upload URL, `POST /s2s/<ver>/task/<feature>` and `GET /s2s/<ver>/task/<feature>/<task_id>`.
  No `DELETE`, no "delete file" or "delete task" operation. The "removal" pages (object, watermark, background) are image features.
- https://docs.perfectcorp.com/develop/file_retention_period.md, verbatim:
  - "Uploaded files and their associated file_id values are stored for 30 days."
  - "After an AI task is created, the corresponding task_id remains valid for 30 days."
  - "All uploaded and generated images and videos are automatically removed after 30 days."
  - Result download links are valid for 2 hours; use the task_id to get a new one.
  The page says nothing about manual deletion.

So `POST /api/session/end` deletes nothing at YouCam. It forgets the session on our side only (task list, cache entries
pointing at the session's renders) and tells the user the truth: YouCam removes files after 30 days.
The product copy must not say "deleted from YouCam". Say "removed from our records now, and from YouCam within 30 days".
Worth asking Perfect Corp support whether a delete route exists but is undocumented.
