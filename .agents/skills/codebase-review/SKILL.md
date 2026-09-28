---
name: codebase-review
description: Review and revise the entire codebase by dividing it into manageable, contract-focused chunks and applying code-review to each, with coverage tracking and cross-cutting reconciliation.
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
---

# Codebase review

Use [code review](../code-review/SKILL.md) for each chunk. Read it first; its phases, implementation authorization, safeguards, and verification requirements apply. Explicit audit-only instructions take precedence. This skill divides repository-wide work; it does not add review criteria.

## Map the codebase

Inventory the current first-party repository, including unchanged code, non-ignored untracked files, packages, shared libraries, tests, scripts, tooling, configuration, examples, and documentation. Exclude dependencies, vendored/generated output, build artifacts, and temporary state; record user-specified exclusions. Git changes help preserve existing work, not select the review target.

Identify entry points, shared owners, dependency relationships, and user-facing flows. Inspect enough structure to plan coverage before diving into the first implementation; do not try to load the entire repository into context.

## Plan manageable chunks

1. Start with packages or subsystems. Keep a small cohesive package together; split a large one by feature or contract, such as one command, provider, persistence boundary, or UI flow. Include each slice's implementation, relevant tests, and documentation together.
2. Size chunks so their contracts, implementation, consumers, and verification fit in one focused review. Split again when unrelated responsibilities or a large consumer set make the work hard to reason about. Do not use arbitrary file counts or separate production code from the tests needed to understand it.
3. Review shared foundations before dependent features where practical. Identify consumers as context even when they belong to later chunks. Give root-level tooling, configuration, and standalone documentation explicit chunks rather than leaving them as leftovers.
4. Plan bounded cross-cutting chunks for contracts that span packages: comparable UI surfaces, repeated implementations, shared API consumers, and common documentation. Name the specific contract and participating paths rather than reopening the whole repository at once.
5. Maintain a coverage ledger with each chunk's purpose, owned paths, contextual dependencies, status, findings, checks, and next action. Assign every in-scope file a primary chunk; overlap for consumer tracing and cross-cutting comparisons is intentional. Track pending, in-progress, completed, and blocked work separately.

## Review one chunk at a time

For each ready chunk:

1. Pass its explicit paths and contract as the target to [code review](../code-review/SKILL.md), along with relevant repository guidance, audit-only mode if requested, and prior shared-contract decisions. Do not let its default diff-based scope replace the chunk, even on a clean working tree.
2. Complete that skill's phases in order for this chunk, including applicable checks, before moving to the next. Load only the references and implementation context needed for the current work. Record justified not-applicable phases.
3. Follow necessary consumers outside the chunk when completing a fix. Update their coverage entries, but do not mark an entire consumer chunk reviewed because one call site was inspected. Queue unrelated discoveries under their owning chunk instead of letting the current review expand indefinitely.
4. Record concrete findings, important keep decisions, changes, exact checks/results, and unresolved questions. Mark the chunk complete only when its review and required verification are complete; blocked work remains visible while independent work continues.
5. Reassess the remaining chunks after shared changes. Reopen affected review conclusions or checks when their evidence is no longer valid. Continue until the ledger is exhausted, not merely until the initial sample or highest-risk package is finished.

When collaboration tools are available, delegate independent chunks with explicit targets, shared decisions, evidence requirements, and disjoint edit ownership. Keep dependent chunks ordered and reconcile shared-owner changes before consumers rely on them.

Keep a resumable ledger in `.tmp/`. Before a pause or context reset, save completed coverage, unresolved findings, shared decisions, and the next chunk there. Resume from that record and current source rather than repeating the inventory or treating a summary as fresh verification.

## Reconcile and finish

Complete the planned cross-cutting chunks using the same code-review workflow. Deduplicate findings by root cause, verify shared changes against all affected consumers, and account for files added, moved, or removed during the work.

Reconcile the ledger against the repository inventory and review the cumulative diff. Follow code-review's final verification requirements across the affected packages and shared consumers. Report coverage and exclusions, important outcomes, exact checks/results, and unfinished chunks. A sampled, paused, or blocked review is partial, not a completed codebase review.
