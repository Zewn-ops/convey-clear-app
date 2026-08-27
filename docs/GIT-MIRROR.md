# Gitea mirror — how and why

`convey-clear-app` has two remotes:

| Remote | Where | Role |
|---|---|---|
| `github` | `git@github.com:Zewn-ops/convey-clear-app.git` | What Vercel builds from. Pushing `master` **is** the production deploy. |
| `origin` | `ssh://git@192.168.110.69:2222/zewn/convey-clear-app.git` | Self-hosted Gitea on the NUC — the copy of record that survives losing a GitHub account. |

## The problem this solves

On 2026-08-27 Gitea was found **85 commits behind** GitHub, stuck at `edd09d6` since go-live. Nothing
was wrong with it; mirroring was simply a step a human had to remember, and during a launch week
nobody did. A backup that only works when you remember it is not a backup.

## The hook

`.git/hooks/pre-push` mirrors the refs being pushed to `origin` whenever the push target is `github`.
Pushing to `origin` itself is skipped, so it never recurses.

Two deliberate properties:

- **It never blocks a push.** If the NUC is asleep, off the LAN, or the laptop is on mobile data, the
  hook prints a warning telling you the exact command to run later and exits 0. A dead mirror must
  never stop you shipping.
- **It runs before the GitHub push completes**, because git has no post-push hook. Gitea can therefore
  end up briefly *ahead* of GitHub if the GitHub push is then rejected. That is the harmless direction
  for a mirror, and the next successful push settles it.

## Reinstalling it

⚠️ **Git hooks are not cloned.** After a fresh clone, or on another machine, run:

```bash
cp docs/pre-push.sample .git/hooks/pre-push && chmod +x .git/hooks/pre-push
```

Verify without pushing anything real:

```bash
printf 'refs/heads/master %s refs/heads/master %s\n' "$(git rev-parse HEAD)" "$(git rev-parse HEAD)" \
  | .git/hooks/pre-push github git@github.com:Zewn-ops/convey-clear-app.git
```

Expected: `→ mirroring to Gitea: master` then `Gitea updated.`

## Checking they agree

```bash
git ls-remote github refs/heads/master
git ls-remote origin  refs/heads/master
```
