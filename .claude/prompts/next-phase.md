You are running unattended inside an automated build loop. No human is watching and nobody will answer questions.

1. Read `CLAUDE.md`, then `docs/PLAN.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, and the parts of `docs/SPEC.md`
   relevant to the next phase. Run `git log --oneline | head -20` to see what is done.
2. If `package.json` exists, run `npm run verify` first. If it fails, fixing it is your first job — the previous session
   may have been cut off mid-phase. Inspect `git status` for uncommitted work from that session and finish it rather
   than starting over.
3. Work on the **first unchecked phase** in `docs/PLAN.md` (`- [ ]`). Implement it completely — no stubs, no TODOs for
   anything the phase or the spec requires. Use subagents for independent chunks when that is faster (e.g. writing tests
   while you build UI), but you own the final integration.
4. Verify every acceptance criterion by actually running the commands/tests, not by reasoning about them.
5. Finish with the end-of-phase checklist in `CLAUDE.md`: PROGRESS entry → tick the checkbox → `git commit`.
6. Then stop. Do not start the next phase.

If you get blocked on something only a human can do, record it under "Blocked / needs human" in `docs/PROGRESS.md`,
complete everything else in the phase, and still tick + commit the phase if its acceptance criteria are otherwise met.
