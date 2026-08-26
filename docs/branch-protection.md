# Branch protection on `main`

`main` is the branch that deploys. Everything below exists so that "the checks
passed" and "this is what shipped" are the same statement.

Branch protection lives in GitHub's settings rather than in this repository, so
it cannot be reviewed in a diff, cannot be reverted with a commit, and does not
show up in `git log` when it changes. `scripts/apply-branch-protection.sh` is
the written-down version: run it to apply the rules, or with `--show` to print
what is currently in force.

```bash
bash scripts/apply-branch-protection.sh --show
```

## What is enforced

| Setting                              | Value                             |
| ------------------------------------ | --------------------------------- |
| Pull request required                | yes                               |
| Required approving reviews           | 1                                 |
| Dismiss stale reviews on new commits | yes                               |
| Require approval of the last push    | yes                               |
| Required conversation resolution     | yes                               |
| Force pushes                         | blocked                           |
| Branch deletion                      | blocked                           |
| Required status checks               | see below, with `strict: true`    |
| `enforce_admins`                     | **off** — see the note at the end |

### Required status checks

Named by **job name**, as the check appears on the pull request:

- `Format, Lint, Typecheck, Test` — `ci.yml`
- `Semgrep (OWASP Top 10)` — `security.yml`
- `OSV-Scanner` — `security.yml`

`strict: true` means a branch must be up to date with `main` before it merges,
so the checks that passed ran against the tree that will actually exist
afterwards.

`Docs` / `Link check (lychee)` is deliberately **not** required. It is
path-filtered to Markdown, so on a pull request that touches no documentation it
never runs at all — and GitHub cannot distinguish "did not need to run" from
"has not reported yet", so requiring it would leave such a PR pending forever.
The same reasoning applies to any future path-filtered job.

OWASP Dependency-Check is not in the list because it is not in the pipeline; the
reasons are recorded in a comment block in `security.yml`.

## Why deployment is gated separately as well

Required status checks govern **merging**. They do not govern what a workflow
does after a merge, and `backend-deploy.yml` used to fire on any push to `main`
with no dependency on `ci.yml` at all — so a red pull request that got merged
would deploy three Cloudflare Workers and a Fly service.

That workflow now triggers on `workflow_run` of CI completing, refuses to
proceed unless CI concluded `success`, waits for the Security workflow to finish
for the same commit and requires that too, and checks out the exact SHA the
checks ran against rather than whatever the branch tip happens to be by then.

Two independent gates, because they fail differently: branch protection can be
edited in a web UI by anyone with admin rights, and a workflow cannot. Neither
one is sufficient on its own.

## On `enforce_admins`

Left **off**, deliberately.

The repository owner is currently the only maintainer. Turning it on would mean
that a genuine emergency — a bad deploy that needs reverting while CI is
unavailable for an unrelated reason — has no path forward except turning the
setting off again, which is the same authority with an extra step and a worse
audit trail.

Revisit it when there is more than one person who can merge. The rule is worth
having when it constrains a group; against a single admin it mostly constrains
their ability to recover.
