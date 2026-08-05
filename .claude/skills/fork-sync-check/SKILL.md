---
name: fork-sync-check
description: Weekly triage of upstream AutomateThePlanet/appium-novawindows-driver commits against this fork, reporting anything not yet ported. Triggers on scheduled routine "fork-sync-check", or manual "/fork-sync-check".
---

# Fork sync check

This repo (`verisoft-ai/appium-desktop-driver`) is a fork of
`AutomateThePlanet/appium-novawindows-driver`. Upstream keeps evolving after the C# server
rewrite merge point we share (commit `cde0513`). This skill re-runs the triage a human did
manually, using a checkpoint file so it never re-explains a commit twice.

Checkpoint file: `.claude/fork-sync/checkpoint.json`. Fields:
- `branches.<name>.last_reviewed_sha` — the upstream commit each branch was last diffed against.
- `reviewed_commits` — a ledger of every commit ever classified, keyed by short SHA, each with a
  `verdict` (`already-ported` / `not-applicable` / `needs-porting`) and a one-line `note`.

## Steps

1. **Sync remotes.**
   ```bash
   git remote add novawindows-sync https://github.com/AutomateThePlanet/appium-novawindows-driver.git 2>/dev/null || true
   git fetch novawindows-sync main develop
   ```

2. **Read the checkpoint.** Load `.claude/fork-sync/checkpoint.json`. Get
   `branches.main.last_reviewed_sha` and `branches.develop.last_reviewed_sha`.

3. **Find new commits per branch.**
   ```bash
   git log --oneline --no-merges <last_reviewed_sha>..novawindows-sync/main
   git log --oneline --no-merges <last_reviewed_sha>..novawindows-sync/develop
   ```
   Skip any SHA already present in `reviewed_commits` (can happen if a commit lands on both
   branches, e.g. via a merge).

4. **Drop noise.** Ignore commits whose subject matches `chore(release)`, is a pure version
   bump, or is a merge commit with no unique diff of its own (`git show --stat <sha>` empty
   beyond the merge).

5. **Classify each remaining commit.**
   For each: `git show <sha>` to see the actual diff. Then check whether the same behavior
   already exists in this repo's `lib/` — grep for the touched function name(s) or the
   surrounding logic (same method used in the 2026-08-05 session: locate the analogous file/
   function here, read it, and judge whether the bug/feature is already handled, handled
   differently, or genuinely missing). Assign:
   - `already-ported` — equivalent logic already exists here (note *where*).
   - `not-applicable` — feature/fix doesn't apply to this fork (e.g. it depends on something
     we deliberately don't use, like the upstream ffmpeg auto-download screen recorder).
   - `needs-porting` — genuinely missing and worth adding; note *why it matters*.

6. **Update the checkpoint.** Add every newly classified commit to `reviewed_commits`. Bump
   `branches.<name>.last_reviewed_sha` to the fetched upstream HEAD for each branch. Update
   `last_run` to current UTC time.

7. **Report.** Search for an existing open GitHub issue titled `Fork sync report` first
   (`gh issue list --search "Fork sync report" --state open`). If found, `gh issue edit` its body
   with the fresh report (below). Otherwise `gh issue create`.

   ```markdown
   ## Fork sync report — <date>

   Checked `AutomateThePlanet/appium-novawindows-driver` main + develop since last review
   (`<old_sha_main>` / `<old_sha_develop>`).

   ### Needs porting
   - `<sha>` <subject> — <why it matters>

   ### Already covered here
   - `<sha>` <subject> — <where/how we already handle it>

   ### Not applicable
   - `<sha>` <subject> — <why we skip it>

   _No new commits since last check._  <!-- only when both branches had zero new commits -->
   ```

8. **Land the checkpoint update.** Commit `.claude/fork-sync/checkpoint.json` on a new branch,
   e.g. `fork-sync/checkpoint-<date>`. **Commit message must use `docs:` or `ci:` prefix, never
   `chore:`** — `.releaserc.json`'s commit-analyzer treats `chore` as a patch-release trigger, and
   `release.yml` fires on any push to `main`/`develop`. Do not push to `main` or `develop`
   directly. Open a PR against `main` with `gh pr create` for a human to merge.

## Notes

- This skill only reads/writes within this repo and the public upstream — it never needs
  upstream write access.
- If `needs-porting` items are found, do not implement them in this run — just report. Porting
  upstream fixes is a separate, deliberate task a human decides to pick up.
