# Nerdforge

Nerdforge is a production-grade deterministic multi-agent software factory powered by the DigitalOcean Inference API. Built for resilience and iterative software engineering, Nerdforge acts as an interactive CLI orchestrator that integrates deeply into your local Git repositories to execute autonomous Test-Driven Development (TDD) loops.

## Features

- **Interactive Orchestrator**: A CLI dashboard (`@clack/prompts`) for seamless task management and session tracking.
- **Autonomous Architecture Blueprints**: Define a high-level goal, and the AI agent automatically analyzes your repository via structural maps to produce structured multi-module architecture blueprints broken down into executable microtasks.
- **Deterministic Work Loops**:
  - **Unit Test Implementation**: Generates missing unit tests or modifies existing ones to capture failing requirements.
  - **Targeted Patching**: Generates unified diffs and structured patches applied directly via `git apply --3way`.
  - **Hygiene Audits**: Audits the generated diff for structural violations or linting errors.
  - **Gatekeeper Verification**: The final LLM reviewer validates the code changes against the tests and hygiene checks before approving the implementation.
- **Atomic Git Operations**: Every successful microtask is committed automatically with context-aware commit messages, guaranteeing safe rollbacks.
- **Resilient Parsing**: Built-in fallback strategies for strict Zod schema validation using `z.output` defaults to combat LLM hallucinations during execution.

## Getting Started

### Installation

Nerdforge uses a standard Node.js/TypeScript configuration. 
```bash
npm install
npm run build
npm link
```

### Configuration

You can configure Nerdforge by creating a `.nerdforge/config.yaml` file in your repository, or using environment variables. 
The system defaults to using the DigitalOcean Inference Router for LLM calls.

```env
DO_MODEL_ACCESS_KEY=your_access_token
```

### Usage

Simply type `nerdforge` in your terminal to launch the interactive TDD dashboard.

```bash
nerdforge
```

Or you can use direct CLI commands:
```bash
# Generate a repository map for the AI
nerdforge repomap

# Generate an architecture blueprint
nerdforge blueprint --goal "Build a scalable microservice architecture"

# Manually audit uncommitted changes using the AI Gatekeeper
nerdforge gate <microtask-id>
```

## How It Works

Nerdforge operates on a rigorous cycle:
1. **Blueprint Generation**: Breaks user goals into isolated microtasks with acceptance criteria and expected file scopes.
2. **Implementation**: An agent writes failing tests, generates the target feature code, and asserts the tests pass.
3. **Audit**: Code passes through a hygiene and deterministic gatekeeper check to prevent model regressions and hallucinations.
4. **Commit**: Clean changes are merged into your worktree.

## License
MIT
