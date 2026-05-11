/** Default nerdforge.yaml template content */
export const CONFIG_TEMPLATE = `# nerdforge configuration
# See: https://github.com/nerdforge/nerdforge#configuration

router:
  name: nerdpos
  base_url: "https://inference.do-ai.run"
  timeout_ms: 60000

auth:
  # Environment variable name containing your DO Model Access Key
  do_api_token_env: "DO_MODEL_ACCESS_KEY"

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
  test_command: "pnpm test"
  lint_command: "pnpm lint"
  format_command: "pnpm format"
  max_worker_attempts: 3
  max_router_retries: 2

repo_map:
  include:
    - "src/**"
    - "test/**"
    - "package.json"
  exclude:
    - "node_modules/**"
    - "dist/**"
    - ".git/**"
`;
