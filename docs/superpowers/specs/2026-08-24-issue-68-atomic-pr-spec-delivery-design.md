# Issue 68: code and Spec atomic PR delivery

## Decision

SDD Ring 5 ends when an implementation PR has been successfully created.  The
PR must contain the implementation, the updated canonical files under
`openspec/specs/`, and the archived change artifacts.  Pull-request review and
merge are repository activities outside the SDD workflow.

`dop change done <change-id>` is called automatically only after `gh pr create`
has succeeded.  Its meaning is therefore **AI delivery is complete and a PR has
been submitted**, not that the PR has merged or deployed.

## Ring 5 flow

1. Confirm all tasks are complete, tests pass, and the AI review has no
   Critical or Important findings.
2. Run strict OpenSpec validation, then run `openspec archive <slug>` on the
   implementation branch.  This updates the branch's canonical specs and moves
   the change to `openspec/changes/archive/<slug>/`.
3. Verify that every declared delta capability is present in the canonical
   specs and run the final validation set again against the archive result.
4. Commit and push the implementation branch; create one PR that includes the
   code, canonical specs, and archived audit artifacts.
5. On a successful PR creation, invoke `dop change done <change_id>`, where
   `change_id` is read from the change metadata rather than inferred from the
   slug.

The former `--finalize` path, merged-PR polling, checkout/pull of `main`, and
direct push to `main` are removed.

## State and audit data

The terminal Ring 5 delivery state is `pr-submitted`; it stores the PR URL,
number, branch head SHA, and `pr_submitted_at`.  Archive completion is recorded
before PR creation because it is part of the PR content.

DOP closure is represented separately from the SDD ring:

- `dop_completion.status`: `pending`, `succeeded`, or `failed`;
- `dop_completion.attempted_at` and, on success, `dop_completion.done_at`;
- a sanitized failure summary when the command fails.

The repository's immutable artifacts prove what was submitted.  DOP is the
source of truth for whether the delivery notification completed; no follow-up
commit is made merely to change a completion flag after the PR exists.

## Failure and retry behavior

Creating a PR is never rolled back because `dop change done` fails.  The user
is told that the PR exists but DOP completion is pending, and the failure is
observable through the session-start reconciliation path.  Reconciliation uses
the archived metadata to identify pending changes, first checks the DOP change
state, and retries `done` only when DOP has not already recorded completion.
The implementation must verify the real CLI's already-done behavior before
assuming idempotence.

## Scope and tests

Both the primary and OpenCode copies of `sdd-review` follow this flow.  The
supporting SDD context/validation and session-start reminder logic is updated
to distinguish `pr-submitted` from DOP completion.  Tests cover canonical Spec
content in the PR instructions, removal of post-merge operations, use of
metadata `change_id`, DOP success/failure, retry discovery, and parity of the
two skill copies.

## Non-goals

This change does not automate GitHub review, merge, deployment, or calculate
lead time through merge.  It also does not claim that DOP's own wall-clock
duration excludes time after PR submission; `done` deliberately occurs at PR
submission, so human merge wait lies outside the defined SDD workflow.
