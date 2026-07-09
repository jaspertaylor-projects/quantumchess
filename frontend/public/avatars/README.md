# Character avatars

Source of truth: `frontend/src/characters/characterCatalog.js`.

That catalog owns character ids, tiers, display names, image paths, taglines,
and event sayings. The `image` field points at files under this directory,
for example `/avatars/free/pawn_avatar.png`.

Do not maintain roster lists here by hand. Add or remove characters in the
catalog, then run:

```bash
cd frontend
pnpm audit:avatars
```

The audit checks that every catalog image exists and that every PNG in this
folder is referenced by a character.
