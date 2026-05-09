# Changesets

This folder is managed by [@changesets/cli](https://github.com/changesets/changesets).

When you make a change that should be released, run `pnpm changeset` and follow the prompts. A markdown file describing your change will be created here. When merged to `main`, the release workflow consumes these files to bump versions and publish to npm.

Only `@agentronics/protocol`, `@agentronics/sdk`, and `@agentronics/react` are published. Other workspaces (gateway, apps) are deployed, not published, and are listed in `ignore` in `config.json`.
