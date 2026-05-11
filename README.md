# nerdforge

Production-grade, deterministic CLI orchestration tool for a multi-agent software factory, powered by the **DigitalOcean Inference Router**.

## Features

- **Schema Validation First**: All LLM outputs are rigorously validated against Zod schemas. Hallucinations are rejected.
- **TDD Workflow**: Strictly follows a Test-Driven Development loop: verify failing test → implement patch → verify passing test.
- **Safe Execution**: Uses 3-way merge `git apply` to patch code safely. Never force-pushes, never modifies history.
- **Gatekeeper Verified**: All changes must pass a hygiene architecture audit and a gatekeeper validation before being committed.
- **Tracing Proofs**: Generates structured Markdown evidence artifacts proving exactly why a change is correct.

## Setup

1. **Build and Install globally (or run via npx)**
```bash
npm install
npm run build
npm link
```

2. **Configure your DigitalOcean Model Access Key**
Get a Model Access Key from the DigitalOcean AI dashboard and export it:
```bash
export DO_MODEL_ACCESS_KEY="your-token"
```

3. **Initialize a Project**
Navigate to the repository you want to work on:
```bash
nerdforge init
```

## Commands Workflow

1. **Check Environment**
```bash
nerdforge doctor
```

2. **Generate Repository Map**
```bash
nerdforge repomap
```

3. **Generate Architecture Blueprint**
```bash
nerdforge blueprint --goal "Implement the payment gateway module"
```

4. **Audit Symbols (Anti-Hallucination)**
```bash
nerdforge audit:symbols
```

5. **Normalize Microtasks**
```bash
nerdforge microtasks
```

6. **Execute TDD Work Loop**
```bash
nerdforge work MT-001
```

7. **Check Status**
```bash
nerdforge status
```

## Architecture Diagram

- `nerdforge blueprint` calls the `enterprise-pos-architecture-blueprint` task.
- `nerdforge audit:symbols` calls the `repository-symbol-existence-audit` task.
- `nerdforge work` orchestrates tests and the `unit-test-targeted-implementation` task.
- The pipeline concludes with `maintainability-architecture-hygiene-audit` and `tdd-proof-gatekeeper`.

## State & Artifacts

All operational state and session data is stored locally in `.nerdforge/` (which is gitignored). You can inspect `.nerdforge/sessions/` to see raw prompts, responses, and patch files for debugging agent routing issues.
