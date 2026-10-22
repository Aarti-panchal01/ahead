# YouCam session cleanup (verified 22 Oct 2026)

Question: can we delete uploaded files and tasks at YouCam?

Answer: yes, tasks. The docs index (llms.txt) does not list it, but the task_management reference bundle does
(docs.perfectcorp.com/_bundle/reference/task_management.json), and it was verified live on 22 Oct (0 units; see
docs/api-truth-table.md row 17).

## The endpoint

`POST https://yce-api-01.makeupar.com/s2s/v2.0/task/delete`, bearer key, JSON body `{ "task_id": "<id>" }`.

- 200 `{ "status": 200 }`: the task and its input and output files are deleted. Polling that task afterwards gives
  400 `InvalidTaskId`.
- Errors: `OperationNotSupport`, `OperationInvalid` (the task has not finished yet), `InvalidTaskId` (unknown or already
  deleted), `InvalidParameters`.

## What `POST /api/session/end` does

Header `x-ahead-session` identifies the session. For every task the session created:

1. `mock:` ids are skipped (nothing was ever sent to YouCam).
2. The task is polled first. Still running: left alone, counted as `skipped`, put back on the session (a second end
   deletes it once finished) and flagged so `GET /api/result` deletes it right after the browser has read the image.
3. Finished (success or error): deleted. `InvalidTaskId` counts as deleted (YouCam no longer has it).
4. Any other failure counts as `failed`; it is flagged the same way.

Our own records (task list, cache entries) are always cleared. Answer: `{ ended, deleted, skipped, failed, mock,
forgotten, deletedAtYoucam, note }`. `note` is the plain sentence for the UI.

Retention if anything is left: YouCam removes uploaded files, task ids and generated files after 30 days
(https://docs.perfectcorp.com/develop/file_retention_period.md). Result download links last 2 hours.

Uploaded source files (`file_id`) have no delete call; they go with their task (the verified test showed the
task's input and output files removed with it).
