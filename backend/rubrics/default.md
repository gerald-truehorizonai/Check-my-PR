# PR Rubric (placeholder — swap in the team's real rules)

## Summary (weight 3)
Explains what the pull request changes and why the change is needed, in a few sentences.
- Missing, or only repeats the title.
- Says what changed but not why.
- Clearly explains both what changed and why it was needed.

## Changes (weight 2)
Lists the main code changes so a reviewer knows where to look.
- No list of changes.
- A vague list like "various fixes" or "updated files".
- A specific list naming the files, modules or behaviours that changed.

## Testing (weight 3)
Describes how the change was verified.
- No testing information.
- Vague, like "tested locally" or "works on my machine".
- Specific steps, commands or test names a reviewer could repeat.

## Risk and rollback (weight 1)
Calls out what could break and how to undo the change if it does.
- Not mentioned.
- Mentions risk without saying what or how to roll back.
- Names the specific risk and gives a rollback plan.

## Screenshots (weight 1, applies feature/bugfix)
Shows before and after screenshots or recordings for any user-visible change.
- No screenshots or recordings.
- A screenshot without saying what it shows.
- Labelled before and after screenshots or a recording.

## Linked issue (weight 1)
Links the ticket or issue this pull request resolves.
- No issue or ticket referenced.
- Mentions an issue without a link or number.
- Links the issue, e.g. "Closes #123" or a ticket URL.
