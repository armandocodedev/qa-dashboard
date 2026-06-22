# QA Dashboard Portfolio

Public portfolio page for agentic QA automation work by Armando Code.

## What It Shows

- AI browser-testing project overview
- Public demo flow summaries
- Agent pipeline: explore, generate, execute, repair, report
- Roadmap for live report publishing and multi-project dashboards
- Sanitized live agent telemetry from the last 48 hours

## Live Data

The private `armandocodedev/agentic-testing` GitHub Actions workflow updates `data/runs.json` after agent runs. The public feed contains only safe summary fields such as status, public target URL, test counts, duration, generated coverage, repairs, and flakiness signals.

Prompts, failure logs, credentials, secrets, and URL query strings are not published.

## GitHub Pages

This repository is intended to deploy with GitHub Pages.

Suggested custom domain:

```text
qa.armandocode.com
```

Namecheap DNS:

```text
Type: CNAME
Host: qa
Value: armandocodedev.github.io
```

Then set the GitHub Pages custom domain to:

```text
qa.armandocode.com
```
