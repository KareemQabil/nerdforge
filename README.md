# nerdforge

> **Deterministic CLI orchestrator for the DigitalOcean Inference Router `nerdpos`.**
> Drives an Autonomous Multi-Agent Software Factory: strict TDD loops, schema-validated agent outputs, tracing proofs, and atomic baby-step commits.

[![CI: tests](https://img.shields.io/badge/tests-41%20passing-brightgreen)](#testing)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-blue)](#requirements)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## What is this?

`nerdforge` is a **terminal CLI** that turns your DigitalOcean Inference Router into a structured engineering pipeline. Instead of one freeform "make my app" prompt, it drives five specialised router tasks through a deterministic workflow:

```
┌──────────────────────────────┐         ┌────────────────────────────────┐
│ enterprise-pos-architecture- │  →      │ repository-symbol-existence-   │
│         blueprint            │         │           audit                │
└──────────────────────────────┘         └────────────────────────────────┘
              │                                          │
              ▼                                          ▼
       blueprint.json   ───────────────────► symbol-audit.json
              │
              ▼ microtasks[]
┌──────────────────────────────┐
│ unit-test-targeted-          │   ◄──── failing test logs
│    implementation            │
└──────────────────────────────┘
              │  patch.diff (unified diff)
              ▼
       git apply --3way
              │
              ▼ tests pass
┌──────────────────────────────┐         ┌────────────────────────────────┐
│ maintainability-architecture │  →      │       tdd-proof-gatekeeper      │
│       -hygiene-audit         │         │                                │
└──────────────────────────────┘         └────────────────────────────────┘
                                                       │ PASS
                                                       ▼
                                           proof.md + atomic git commit
```

Every router response is **Zod-validated** against a versioned schema. Anything that doesn't match the contract is retried or surfaced as a structured error — **never silently accepted**.

---

## Why this exists

LLM-driven coding agents drift. They invent function names, hallucinate file paths, refactor unrelated code, or write tests after the fact. `nerdforge` fights drift by mechanising the rules a great staff engineer would enforce on a junior:

- **Tracing proofs**: every commit must carry evidence (failing log → patch → passing log → hygiene → gatekeeper verdict).
- **Baby-step commits**: one microtask = one atomic commit. No multi-feature diffs.
- **Symbol existence checks**: before any work, the blueprint is audited against the real repo map.
- **Diff-only worker output**: the implementation agent can only ship a unified diff inside a JSON envelope.
- **Schema everywhere**: blueprint, audit, patch, hygiene, gatekeeper, microtasks — each has its own Zod schema and `schema_version` literal.
- **Anti-hallucination prompt header**: every prompt is prefixed with a machine-readable `[NERDFORGE_ROUTER_TASK=...]` tag so the router's semantic matcher locks on to the right task.

---

## Requirements

- **Node 20+**
- **git 2.30+**
- A DigitalOcean **Model Access Key** (`Inference → Routers → nerdpos`)
- A router named `nerdpos` with the following tasks already configured (your screenshot already shows these):
  - `enterprise-pos-architecture-blueprint`
  - `tdd-proof-gatekeeper`
  - `unit-test-targeted-implementation`
  - `repository-symbol-existence-audit`
  - `maintainability-architecture-hygiene-audit`

> **Note on DO subscription tiers:** the routed models (Claude Opus 4.7, GPT-5.3 Codex, Claude 4.5 Sonnet, Qwen3 Coder Flash) require a paid Serverless Inference tier. If you see `403 forbidden_error: this model is not available for your subscription tier`, upgrade your account at <https://cloud.digitalocean.com/account/billing>. nerdforge itself does not change behaviour by tier — it surfaces the 403 verbatim.

---

## Install

```bash
# clone + link locally (during development)
git clone <your fork>
cd nerdforge
yarn install
yarn build
yarn link

# OR after publishing
npm i -g nerdforge
```

`yarn link` exposes the `nerdforge` binary on your PATH.

---

## Quick start

```bash
# 1. one-time bootstrap
export DIGITALOCEAN_TOKEN=doo_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
cd path/to/your-repo
nerdforge init
nerdforge doctor

# 2. plan
nerdforge repomap
nerdforge blueprint --goal "Add configurable discount rules per store"
nerdforge audit:symbols
nerdforge microtasks

# 3. work
nerdforge work MT-001       # full TDD loop with commit on PASS
nerdforge status            # see what's done

# 4. (optional) hand-graded changes
git apply some.patch
nerdforge gate MT-002       # runs hygiene + gatekeeper on staged diff
```

Every command emits two streams:
- **stderr** — human progress (with colour)
- **stdout** — machine-readable JSON (so you can `nerdforge status | jq`)

---

## Commands

| Command | What it does |
|---|---|
| `nerdforge init` | Create `nerdforge.yaml` + `.nerdforge/` artifacts dir |
| `nerdforge doctor` | Validate env, token, git, config |
| `nerdforge repomap` | Build `.nerdforge/repo-map.json` |
| `nerdforge blueprint --goal "<text>" [--context "<text>"]` | Architect a blueprint via the `enterprise-pos-architecture-blueprint` task |
| `nerdforge audit:symbols` | Run `repository-symbol-existence-audit` against blueprint + repo map |
| `nerdforge microtasks` | Normalise blueprint microtasks into `microtasks.json` |
| `nerdforge work <MT-ID> [--dry-run] [--session <ts>]` | Run the full TDD loop on one microtask |
| `nerdforge gate <MT-ID>` | Hygiene + gatekeeper on the currently staged diff |
| `nerdforge status` | Summarise branch, session, microtask progress |

Add `--cwd <path>` to run from elsewhere.

---

## Configuration (`nerdforge.yaml`)

Generated by `nerdforge init`. Everything is config-driven; secrets only via env.

```yaml
router:
  name: nerdpos
  base_url: "https://inference.do-ai.run"
  model: "router:nerdpos"
  timeout_ms: 60000

auth:
  do_api_token_env: "DIGITALOCEAN_TOKEN"

models:
  temperature:
    enterprise-pos-architecture-blueprint: 0.2
    tdd-proof-gatekeeper: 0.1
    unit-test-targeted-implementation: 0.0
    repository-symbol-existence-audit: 0.0
    maintainability-architecture-hygiene-audit: 0.1
  max_tokens:
    default: 4000

workflow:
  branch_prefix: "nerdforge/"
  artifacts_dir: ".nerdforge"
  require_clean_worktree: true
  require_tests_pass: true
  test_command: "yarn test"
  max_worker_attempts: 3
  max_router_retries: 2

repo_map:
  include: ["src/**", "test/**", "package.json"]
  exclude: ["node_modules/**", "dist/**", ".git/**"]
```

---

## Artifacts (`.nerdforge/`)

```
.nerdforge/
├── config.resolved.json           # validated effective config
├── state.json                     # branch, session, microtask status
├── repo-map.json                  # latest repo map
└── sessions/
    └── 2026-01-12T08-44-01-123Z/
        ├── blueprint.json
        ├── symbol-audit.json
        ├── microtasks.json
        └── runs/
            └── MT-001/
                └── attempt-1/
                    ├── request.json           # what we asked the worker
                    ├── response.json          # the router record (id, model, ms)
                    ├── patch.diff             # the unified diff applied
                    ├── apply.patch            # actual file fed to git apply
                    ├── test.failing.log
                    ├── test.log               # passing log
                    ├── hygiene.json
                    ├── gatekeeper.json
                    └── proof.md               # human-readable tracing proof
```

You can `cat .nerdforge/sessions/<ts>/runs/MT-001/attempt-1/proof.md` to read the audit trail in plain English.

---

## Anti-hallucination model

Every router prompt is wrapped:

```
[NERDFORGE_ROUTER_TASK=unit-test-targeted-implementation]
[OUTPUT_SCHEMA=nerdforge.patch.v1]
[HARD_CONSTRAINTS]
- respond with exactly one JSON object
- no markdown fences, no prose, no explanations outside JSON
- unified diff only inside the `diff` field
- minimal change scoped to making the failing test pass
- no refactor, no formatting churn, no unrelated edits
- reference only symbols proven to exist in the repo
[/HARD_CONSTRAINTS]
```

The matching system frame doubles up the routing intent, so even if the user header is normalised the system role still encodes the task.

If the router's response:

- isn't valid JSON → retry (up to `max_router_retries`)
- doesn't match the Zod schema → retry (with the same correlation id)
- still fails after retries → fail with a structured `NerdforgeError` code

There is **no freeform-prompt path** anywhere in the codebase.

---

## Safety

`nerdforge` runs git for you. The rules:

- **never force push** (we never push at all)
- only commit when `gatekeeper.verdict === 'PASS'`
- one microtask = one commit (no multi-microtask diffs)
- `--dry-run` stops before any router call
- patch application is `git apply --3way`; if it fails we leave `.rej` files for inspection and throw
- empty commits are refused (`GIT_EMPTY_COMMIT`)
- never reads or writes outside `cwd` and `~/.config` (we don't use `~/.config` either, just env vars)

---

## Testing

```bash
yarn test
```

Test coverage:
- `test/config.test.ts` — YAML parsing, defaults, schema rejection
- `test/prompt.test.ts` — header injection, task whitelist
- `test/schemas.test.ts` — blueprint / patch / hygiene / gatekeeper / symbol-audit / microtask
- `test/router.test.ts` — RouterClient with mocked transport, retries, backoff, schema validation
- `test/repomap.test.ts` — includes/excludes + previews
- `test/patch.test.ts` — `git apply` round-trip, empty-commit refusal
- `test/work.test.ts` — full TDD loop end-to-end with mocked router + real git
- `test/commands.test.ts` — init/doctor/repomap/status integration

All 41 tests pass in ~4s.

---

## Example session (live)

```text
$ nerdforge init
✔ wrote /work/nerdforge.yaml
✔ wrote /work/.nerdforge/config.resolved.json
✔ wrote /work/.nerdforge/state.json

$ nerdforge doctor
✔ nerdforge.yaml present: /work/nerdforge.yaml
✔ config schema valid: router=nerdpos base_url=https://inference.do-ai.run
✔ artifacts dir: /work/.nerdforge
✔ DIGITALOCEAN_TOKEN set: (DIGITALOCEAN_TOKEN is set)
✔ git installed: git version 2.39.5
✔ cwd is a git repo: branch=main

$ nerdforge blueprint --goal "Add configurable discount rules per store"
• requesting blueprint via task enterprise-pos-architecture-blueprint
✔ blueprint saved → /work/.nerdforge/sessions/2026-01-12T08-44-01-123Z/blueprint.json

$ nerdforge work MT-001
• Working on MT-001 on branch nerdforge/MT-001
[1/3] Attempt 1
✔ tests pass on attempt 1
✔ committed b880abdc
✔ microtask MT-001 PASSED in 1 attempt(s)
```

---

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | unexpected error |
| 2 | doctor: at least one check failed |
| 3 | audit:symbols: verdict FAIL |
| 4 | work: microtask FAIL after max attempts |
| 5 | gate: gatekeeper FAIL |

---

## Roadmap

- [ ] streaming router responses
- [ ] parallel microtask workers (config-gated)
- [ ] CI mode that fails on drift (`nerdforge ci`)
- [ ] hashed prompt/response cache under `.nerdforge/cache/`
- [ ] GitHub Action wrapper

---

## License

MIT
