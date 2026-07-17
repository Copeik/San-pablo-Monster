# Superpowers Project Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unavailable Luna requirement with a mandatory Superpowers entry workflow for every repository task.

**Architecture:** The root `AGENTS.md` is the only implementation surface. It will invoke the globally discovered `superpowers:using-superpowers` skill by name, direct agents to load other applicable Superpowers skills, preserve the dispatched-subagent exception, and report an explicit dependency failure when the entry skill is unavailable.

**Tech Stack:** Markdown project instructions, Codex native skill discovery, PowerShell verification, Git.

## Global Constraints

- Do not restore or modify `skills/luna-reasoning-agent/**`.
- Do not touch application code or unrelated uncommitted work.
- Do not vendor Superpowers into the repository or hard-code a user-specific installation path in `AGENTS.md`.
- The global Superpowers installation must expose exactly 14 `SKILL.md` manifests through `~/.agents/skills/superpowers`.
- Fresh native skill discovery requires restarting Codex or opening a new task.

---

### Task 1: Replace the repository skill policy

**Files:**
- Modify: `AGENTS.md:1`
- Reference: `docs/superpowers/specs/2026-07-16-superpowers-project-policy-design.md`

**Interfaces:**
- Consumes: Codex's root `AGENTS.md` instruction discovery and the globally installed `superpowers:using-superpowers` skill.
- Produces: A repository-wide policy that requires Superpowers and contains no Luna requirement.

- [ ] **Step 1: Run the policy check and verify the current file fails**

```powershell
$policyText = Get-Content -LiteralPath 'AGENTS.md' -Raw
if ($policyText -match 'luna-reasoning-agent') { throw 'Luna requirement is still present.' }
if ($policyText -notmatch [regex]::Escape('superpowers:using-superpowers')) { throw 'Superpowers entry skill is not required.' }
```

Expected: FAIL with `Luna requirement is still present.`

- [ ] **Step 2: Replace `AGENTS.md` with the approved policy**

```markdown
# Project instructions

## Required skill system

For every task in this repository, invoke `superpowers:using-superpowers` before any response or action. Read and follow its current instructions, then invoke every other applicable Superpowers skill before continuing.

If `superpowers:using-superpowers` is unavailable, report the missing skill dependency and do not claim the Superpowers workflow was followed.

Dispatched subagents must follow the exception defined by `superpowers:using-superpowers`.
```

- [ ] **Step 3: Re-run the policy check and verify it passes**

```powershell
$policyText = Get-Content -LiteralPath 'AGENTS.md' -Raw
if ($policyText -match 'luna-reasoning-agent') { throw 'Luna requirement is still present.' }
if ($policyText -notmatch [regex]::Escape('superpowers:using-superpowers')) { throw 'Superpowers entry skill is not required.' }
Write-Output 'Project policy verification passed.'
```

Expected: PASS with `Project policy verification passed.`

- [ ] **Step 4: Verify the native Superpowers discovery junction**

```powershell
$superpowersLink = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.agents\skills\superpowers'
$linkItem = Get-Item -LiteralPath $superpowersLink -Force
if ($linkItem.LinkType -ne 'Junction') { throw 'Superpowers discovery path is not a junction.' }
$skillCount = @(Get-ChildItem -LiteralPath $superpowersLink -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') }).Count
if ($skillCount -ne 14) { throw "Expected 14 Superpowers skills, found $skillCount." }
Write-Output 'Superpowers installation verification passed.'
```

Expected: PASS with `Superpowers installation verification passed.`

- [ ] **Step 5: Inspect the targeted diff**

```powershell
git diff --check -- AGENTS.md
git diff -- AGENTS.md
```

Expected: no whitespace errors; the diff only replaces the Luna policy with the approved Superpowers policy.

- [ ] **Step 6: Commit only the repository policy**

```powershell
git add -- AGENTS.md
git commit -m "chore: require Superpowers for repository tasks" -- AGENTS.md
```

Expected: one commit containing only `AGENTS.md`.
