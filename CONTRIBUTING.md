# Contributing

Thanks for your interest in improving OptionsAnalysis.

## Workflow

1. Fork and create a feature branch.
2. Keep changes focused and scoped to one concern.
3. Add or update tests when behavior changes.
4. Open a pull request with a clear summary and validation notes.

## Local Validation

```bash
cd backend && pytest
cd frontend && npm test
```

For UI changes, include a short screenshot or recording in the PR.

## Standards

- Prefer readable, typed, testable code.
- Keep runtime defaults safe for localhost development.
- Do not commit secrets, API keys, or private account data.
