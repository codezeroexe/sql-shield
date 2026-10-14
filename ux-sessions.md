# SQLShield Demo: user sessions

A script for watching 3 to 5 people use the demo page. This is what level 4 of the UX record needs: real people from the audience, watched doing the key tasks, with what they struggled with written down.

## Who to ask

- 3 to 5 classmates who know basic SQL but have not seen this page.
- At least one person who has never heard of SQL injection.
- Not anyone who helped build it.

## Setup

- Run `npm start`, open `http://127.0.0.1:3000` in a fresh private window (so nothing typed earlier is restored).
- Use the projector or a laptop at arm's length, as on the day.
- One person at a time. You sit beside them, you do not touch the keyboard.
- Have a timer and this sheet. One copy of the notes table per person.

## What to say at the start

> "Thanks for helping. I'm testing the page, not you, so anything that confuses you is the page's fault and exactly what I need to find. Please think out loud: say what you're looking at, what you expect, and what surprises you. I won't help while you work, but I'll answer everything at the end."

## Tasks

Read each task aloud. Give the goal only; never say which button or section to use.

1. **First look (no clicking).** "Take 30 seconds and tell me what this page shows." Finished when they can say that the same input returned 0 rows one way and 8 rows the other.
2. **Log in without a password.** "Get the page to log you in as somebody without knowing their password." Finished when the pasted path returns at least one user and they can point to why.
3. **Find the leak.** "Use the search to get the page to list every user." Finished when the pasted search returns all eight users.
4. **Break it, then fix it.** "Delete the users table, then get the demo working again." Finished when login returns users again after the reset.
5. **Explain it.** "In one sentence, why did the bound version not leak?" Finished when the answer mentions that the input stayed a value, or the statement was fixed before the input arrived.

## What to note, per task

| Task | Finished? (yes / with help / no) | Time | Wrong turns | Questions they asked | Their words for things |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

Also note: anything they read aloud and misread, anything they tried to click that is not a control, and the moment they first understood the idea (if they did).

## Afterwards

- Ask: "What was the most confusing moment?" and "What would you tell a friend this page shows?"
- Write down their exact words. Do not summarise.

## Bringing it back

Paste the filled tables into the chat and run `/ux-level 4 audit`. Observed results will be recorded separately from the expert review, and where they disagree, what people did wins.
