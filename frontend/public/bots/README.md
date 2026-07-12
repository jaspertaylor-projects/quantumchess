# Bot avatars

Source of truth: `frontend/src/ai/bots.js`.

That catalog owns bot ids, tiers, names, ratings, personalities, taglines,
sayings, and hues. Drop a square PNG named `<bot-id>.png` in this folder and
`getBotAvatarUrl()` will use it automatically. If the file is missing, the
player bar falls back to procedural initials.

Do not maintain free/premium bot lists here by hand; read them from the
catalog (`FREE_BOTS`, `PREMIUM_BOTS`) or run:

```bash
cd frontend
pnpm audit:avatars
```

Human players use the same drop-in scheme:
  anonymous.png — you (vs AI, and the White seat in Local 2 Player)
  stranger.png  — the second player in Local 2 Player

Recommended: 128x128 or larger, square. Files here are served at /bots/<id>.png.

Legal/art guardrail: both halves of every scientist × chess-player mashup
must be deceased. Portraits must remain fantastical and must not depict a
real person's likeness or imply endorsement.
