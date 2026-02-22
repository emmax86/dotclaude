---
allowed-tools: Task, structured_output
description: Run code review and return a structured verdict for CI gating
---

You are a CI gating agent. $ARGUMENTS has the format `owner/repo/pull/N`. Replace $ARGUMENTS with the actual arguments passed to this command.

Steps:

1. Use a sub-agent with this exact prompt (do not include the surrounding code block markers in the prompt itself):

   ```
   Run `/code-review:code-review $ARGUMENTS`.

   After completing the review and posting your findings to the pull request, output
   exactly one of the following as the very last line of your response — no other text
   after it:

   VERDICT:pass
   VERDICT:fail

   Use `VERDICT:pass` only if you found zero blocking issues. Use `VERDICT:fail` for
   any blocking issues, or if you were unable to complete the review.
   ```

2. Scan the sub-agent's response for lines matching exactly `VERDICT:pass` or
   `VERDICT:fail`. If multiple such lines are present, use the last one. If no such line
   is present, treat it as `VERDICT:fail` (fail-closed).

3. Call the `structured_output` tool with:
   ```json
   {
     "verdict": "pass",
     "summary": "<complete sub-agent response text, excluding the final VERDICT:pass or VERDICT:fail line>"
   }
   ```
   where `verdict` is either `"pass"` or `"fail"` based on step 2.
