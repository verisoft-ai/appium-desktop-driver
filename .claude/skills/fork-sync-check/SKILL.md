---
name: fork-sync-check
description: Weekly triage of upstream AutomateThePlanet/appium-novawindows-driver and its diverged sibling forks against this repo, reporting anything not yet ported. Triggers on scheduled routine "fork-sync-check", or manual "/fork-sync-check".
---

# Fork sync check

This repo (`verisoft-ai/appium-desktop-driver`) is a fork of
`AutomateThePlanet/appium-novawindows-driver`. Upstream keeps evolving after the C# server
rewrite merge point we share (commit `cde0513`), and some of upstream's own forks have diverged
independently with fixes worth knowing about. This skill re-runs the triage a human did
manually, using a checkpoint file so it never re-explains a commit twice.

Checkpoint file: `.claude/fork-sync/checkpoint.json`. Top-level sections:
- `our_architecture_snapshot` — facts about THIS repo's current transport/architecture, verified
  from code, not docs. Read step 0 below before trusting it.
- `primary_upstream` — the direct fork parent (`AutomateThePlanet/appium-novawindows-driver`),
  tracked per branch with `last_reviewed_sha`.
- `sibling_forks` — other forks of the same upstream that have diverged meaningfully, discovered
  via the GitHub API and filtered by an "ahead by" threshold.
- `reviewed_commits` (nested under each upstream/fork) — ledger of every commit ever classified,
  keyed by short SHA, each with a `verdict` (`already-ported` / `not-applicable` /
  `needs-porting`) and a one-line `note`.

## Step 0: verify our own architecture before comparing anything

**Do this first, every run, before touching any upstream commit.** A past run assumed this repo
was still PowerShell-based (going off `CLAUDE.md`'s description) when it had actually moved to a
C# server — that stale assumption would have silently misclassified every commit. Re-derive the
facts from code, not docs:

```bash
ls lib/server/ native/ 2>/dev/null   # C# server evidence
ls lib/powershell/ 2>/dev/null       # PowerShell-transport evidence
grep -n "NovaUIAutomationClient" lib/driver.ts
```

If `our_architecture_snapshot` in the checkpoint no longer matches what you find, update that
block first (with today's date) — every classification below depends on knowing our real
current transport, not what a doc or a past checkpoint entry claimed.

## Steps

### A. Primary upstream

1. **Sync remotes.**
   ```bash
   git remote add novawindows-sync https://github.com/AutomateThePlanet/appium-novawindows-driver.git 2>/dev/null || true
   git fetch novawindows-sync main develop
   ```

2. Read `primary_upstream.branches.<name>.last_reviewed_sha` from the checkpoint.

3. **Find new commits per branch.**
   ```bash
   git log --oneline --no-merges <last_reviewed_sha>..novawindows-sync/main
   git log --oneline --no-merges <last_reviewed_sha>..novawindows-sync/develop
   ```
   Skip any SHA already present in `reviewed_commits`.

4. **Drop noise.** Ignore `chore(release)`/version-bump commits and merge commits with no
   unique diff of their own (`git show --stat <sha>` empty beyond the merge).

5. **Classify each remaining commit** (see "Classification method" below).

6. Bump `primary_upstream.branches.<name>.last_reviewed_sha` to the fetched HEAD per branch.

### B. Sibling forks

7. **Discover forks.**
   ```bash
   gh api repos/AutomateThePlanet/appium-novawindows-driver/forks --paginate -q '.[].full_name'
   ```
   For each fork not already in `sibling_forks.tracked` or `sibling_forks.ignored`, get its
   default branch and how far ahead it is of upstream `main`:
   ```bash
   gh api repos/<owner>/<repo> -q .default_branch
   gh api repos/AutomateThePlanet/appium-novawindows-driver/compare/main...<owner>:<default_branch> -q '.ahead_by'
   ```
   - `ahead_by` at or below `sibling_forks.discovery.ahead_by_threshold` (3): add to
     `sibling_forks.ignored` with the count and reason, skip triage.
   - Above threshold and not yet tracked: add to `sibling_forks.tracked` with
     `last_reviewed_sha: null` (first-time triage) or seed at current HEAD if the backlog is too
     large to triage in one run — flag this choice to the user rather than silently deciding.

8. **For each already-tracked fork**, re-check its `ahead_by` against `last_reviewed_sha`
   (not against upstream `main` — sibling forks are compared to their own prior state). Fetch
   new commits, drop noise (WIP commits with no semantic content like bare `update`/`temp`/`add`,
   and anything specific to a transport this repo doesn't use — check
   `our_architecture_snapshot` first), classify the rest.

9. Update `last_reviewed_sha` for each tracked fork to its current HEAD.

### Classification method

For each remaining commit: `git show <sha>` to see the actual diff. Check whether the same
behavior already exists in this repo's `lib/` — grep for the touched function name(s) or
surrounding logic, read the analogous file here, and judge:
- `already-ported` — equivalent logic already exists here (note *where*).
- `not-applicable` — doesn't apply (depends on a transport/feature we don't use, e.g. PowerShell-
  specific internals when we're on the C# server, or the upstream ffmpeg auto-download recorder
  we deliberately don't want).
- `needs-porting` — genuinely missing and worth adding; note *why it matters*.

Add every classified commit to the relevant `reviewed_commits` (or `needs_porting`/
`already_ported_or_equivalent`/`not_applicable` list for sibling forks, matching the existing
checkpoint shape).

## Report

Search for an existing open GitHub issue titled `Fork sync report` first
(`gh issue list --search "Fork sync report" --state open`). If found, `gh issue edit` its body
with the fresh report. Otherwise `gh issue create`.

```markdown
## Fork sync report — <date>

### Primary upstream (AutomateThePlanet/appium-novawindows-driver)
Checked main + develop since last review (`<old_sha_main>` / `<old_sha_develop>`).

#### Needs porting
- `<sha>` <subject> — <why it matters>

#### Already covered here
- `<sha>` <subject> — <where/how>

#### Not applicable
- `<sha>` <subject> — <why skipped>

_No new commits since last check._  <!-- when nothing new -->

### Sibling forks
- New forks discovered this run: <list, or "none">
- `<owner>/<repo>` (N commits ahead): <needs-porting items, or "nothing new, already covered">
```

## Land the checkpoint update

Commit `.claude/fork-sync/checkpoint.json` on a new branch, e.g.
`fork-sync/checkpoint-<date>`. **Commit message must use `docs:` or `ci:` prefix, never
`chore:`** — `.releaserc.json`'s commit-analyzer treats `chore` as a patch-release trigger, and
`release.yml` fires on any push to `main`/`develop`. Do not push to `main` or `develop` directly.
Open a PR against `main` with `gh pr create` for a human to merge.

## Notes

- This skill only needs read access to upstream/sibling forks (all public) and write access
  (PR + issue) to this repo — never write access to any upstream.
- If `needs-porting` items are found, do not implement them in this run — just report. Porting
  is a separate, deliberate task a human decides to pick up.
- If a sibling fork's unreviewed backlog is too large to triage in one run, say so explicitly in
  the report and ask before silently seeding the checkpoint at HEAD (that would skip the
  backlog permanently) — this happened once already (2026-08-05, 160-commit backlog on
  nguyenvanhuy0612/appium-novawindows2-driver) and the user chose to deep-triage it rather than
  skip it.
