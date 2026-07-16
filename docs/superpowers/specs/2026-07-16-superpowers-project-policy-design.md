# Superpowers Project Policy Design

## Objective

Make Superpowers the mandatory skill system for every Codex task in this repository while preserving unrelated local work.

## Chosen approach

Use the official global Superpowers installation and make the repository policy explicit in the root `AGENTS.md`.

- Keep the cloned repository and native skill-discovery junction outside this project.
- Replace the broken `luna-reasoning-agent` requirement in `AGENTS.md`.
- Require `superpowers:using-superpowers` before any response or action.
- Require every other applicable Superpowers skill selected by that entry skill.
- Preserve the entry skill's exception for dispatched subagents.

The project policy will refer to the skill by name, not by an absolute user-specific path.

## Policy shape

`AGENTS.md` will contain one required-skill section with these semantics:

1. Every task starts by invoking `superpowers:using-superpowers`.
2. Its current instructions are read and followed before further work.
3. Every applicable Superpowers workflow is invoked before continuing.
4. Dispatched subagents obey the exception defined by `using-superpowers`.

## Dependencies and failure handling

Codex must discover the global Superpowers skills through `~/.agents/skills/superpowers`. If the entry skill is unavailable, the agent must report that exact missing dependency instead of claiming the policy was followed.

## Scope and preservation

The implementation changes only the root `AGENTS.md`. It does not restore or modify the deleted Luna skill files, touch application code, alter existing uncommitted work, or vendor Superpowers into this repository.

## Verification

Completion requires all of the following:

- `AGENTS.md` requires `superpowers:using-superpowers` before any response or action.
- `AGENTS.md` no longer requires the unavailable Luna skill.
- The global junction resolves to the installed Superpowers `skills` directory.
- The installation exposes the expected 14 skill manifests.
- A targeted Git diff shows no unrelated project changes caused by this implementation.

Codex must be restarted or a new task opened before relying on fresh native skill discovery.
