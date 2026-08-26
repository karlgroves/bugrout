# Security exceptions

An exception is a finding someone has decided **not to fix yet**. It is not a
false positive, and it is not a rule that fires wrongly — those are handled
differently, and confusing the three is how a register like this stops meaning
anything.

| It is…                               | Where it goes                                                 |
| ------------------------------------ | ------------------------------------------------------------- |
| A finding that is wrong at this site | inline `// nosemgrep: <rule> -- <reason>`                     |
| A rule that is wrong everywhere here | `security/config/semgrep.yml` → `excludeRules`, with an issue |
| Real, and not being fixed now        | **here** — `security/config/exceptions.json`, with an expiry  |

Required by §22, following the rules in §12.

## Current register

**Empty.** That is the correct state, and it is worth keeping that way. Every
entry is a risk someone accepted on the project's behalf.

## Exception format

`security/config/exceptions.json`:

```json
{
  "exceptions": [
    {
      "id": "OSV-2025-1234",
      "tool": "osv-scanner",
      "package": "example-package",
      "affected": "apps/mobile/package.json",
      "reason": "No fixed version published upstream",
      "owner": "karl@example.com",
      "expires": "2026-11-01",
      "compensating_control": "The vulnerable parser is never reached — the only caller passes a fixed literal",
      "ticket": "https://github.com/karlgroves/bugrout/issues/123"
    }
  ]
}
```

Every field is required (§12):

| Field                  | Why it is required                                                       |
| ---------------------- | ------------------------------------------------------------------------ |
| `id`                   | The finding identifier, so the exception can be matched to a scan result |
| `tool`                 | Which scanner reported it — the same CVE can surface differently         |
| `affected`             | File, URL or package                                                     |
| `reason`               | Why it is not being fixed **now**                                        |
| `owner`                | A person, not a team. Someone accepted this risk                         |
| `expires`              | ISO date, at most 90 days out                                            |
| `compensating_control` | What makes the risk tolerable meanwhile                                  |
| `ticket`               | Where the actual fix is tracked                                          |

If you cannot fill in `compensating_control` with something concrete, you do not
have an exception — you have an unfixed finding.

## Approval rules

- **A person, not a role, owns each exception.** "The team accepted it" means
  nobody did.
- **Critical findings require explicit owner approval**, recorded in the ticket
  rather than only here.
- The reviewer of the pull request that adds an exception is approving the risk
  acceptance, not just the JSON. Say so in the review.

## Expiration rules

- **No permanent exceptions.** An entry without `expires` is invalid.
- **No exception may exceed 90 days without reapproval.** Renewing means
  revisiting the reason, not bumping the date.
- Expired entries are listed in every `security-summary.md`, under their own
  heading. They do not fail the build — a hard failure on an expired exception
  would produce a build break with no code change behind it, and the reliable
  response to that is deleting the entry rather than fixing the finding.
  Visibility is the mechanism; the report puts them in front of a human on every
  run.

## Prohibited exceptions

These may never be excepted, whatever the expiry or the compensating control:

- **A confirmed valid secret.** Rotate it. A live credential in a public
  repository is not a risk to accept, and this repository is public.
- **An authorization bypass.** If a request without a credential can reach
  protected data, that is not a finding to schedule.
- **Anything that would make a stated privacy guarantee false.** The bundled
  privacy policy is shown to users at first launch and is a representation they
  agree to. Code and policy have to agree; if they cannot, the policy changes in
  the same pull request.

## Worked example of what does _not_ belong here

`image-size@1.2.1` carries two HIGH advisories with no published fix. They are
handled by `--ignore-unfixed` on the Trivy gate and
`pnpm.auditConfig.ignoreGhsas`, with the reasoning written in
`docs/dependency-upgrade-policy.md`.

That is deliberately **not** an exception, for two reasons. There is no fix to
schedule, so an expiry date would be theatre — it would come round and be
renewed unchanged, forever. And `--ignore-unfixed` is self-clearing: the moment
upstream publishes a fix, the finding becomes actionable and CI goes red on its
own. An exception with an expiry is the right tool when _you_ can act and have
chosen not to yet. When you genuinely cannot act, say so in the documentation
and make the gate notice when that changes.
