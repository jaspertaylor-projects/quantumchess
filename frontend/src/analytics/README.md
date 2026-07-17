# Product analytics

`analytics.js` loads GA4 and handles consent. `productEvents.js` is the
privacy-safe product contract: feature code sends product facts to
`trackProductEvent()` and the contract chooses the stable GA4 event name and
approved parameters. Do not send email addresses, usernames, account IDs,
game IDs, room codes, or free-form text.

## Event contract

| Product moment | GA4 event | Useful parameters |
| --- | --- | --- |
| First-visit welcome page is shown | `welcome_viewed` | — |
| Visitor chooses a welcome path | `welcome_choice` | `welcome_choice` |
| Human makes their first move in a game | `first_move` | `game_mode`, `player_side`, `bot_tier`, `intro` |
| Tutorial opens | `tutorial_begin` | `tutorial_entry` |
| Player advances past a tutorial step | `tutorial_step_complete` | `lesson_id`, `lesson_number`, `step_number` |
| Player finishes the complete tutorial | `tutorial_complete` | — |
| Daily puzzle opens | `daily_opened` | `puzzle_id`, `puzzle_moves` |
| Daily puzzle finishes | `daily_solved` | `puzzle_id`, `puzzle_moves`, `score`, `grade`, `outcome` |
| Daily result is copied | `share` | `method`, `content_type`, `item_id`, `score`, `grade` |
| Bot game finishes | `bot_game_finished` | `result`, `bot_id`, `bot_tier`, `move_count`, `end_reason` |
| A premium offer is displayed | `premium_upsell_viewed` | `upsell_source` |
| A premium/tip CTA is clicked | `premium_upsell_clicked` | `upsell_source`, `offer` |
| Account signup succeeds | `sign_up` | `method` |
| Stripe returns a checkout URL | `begin_checkout` | `currency`, `value`, `upsell_source`, `offer`, `items` |
| An engine review successfully opens | `review_opened` | `access_type`, `result`, `move_count` |

`tutorial_begin`, `tutorial_complete`, `share`, `sign_up`, and
`begin_checkout` use GA4 recommended event names. The remaining names are
Quantum Chess product events.

## GA4 property setup

New events should appear first in Reports → Realtime after they are exercised
on the live site. Event parameters can be inspected immediately in Realtime
or DebugView, but most parameters need event-scoped custom definitions before
they can be used broadly in reports and explorations.

In Admin → Data display → Custom definitions, create these event-scoped
custom dimensions first:

| Display name | Event parameter |
| --- | --- |
| Welcome choice | `welcome_choice` |
| Game mode | `game_mode` |
| Player side | `player_side` |
| Bot | `bot_id` |
| Bot tier | `bot_tier` |
| Game result | `result` |
| Tutorial lesson | `lesson_id` |
| Puzzle grade | `grade` |
| Puzzle outcome | `outcome` |
| Upsell source | `upsell_source` |
| Offer | `offer` |
| Review access | `access_type` |

Create event-scoped custom metrics for `score`, `move_count`,
`lesson_number`, and `step_number` only when a report needs them. Avoid
registering `puzzle_id` unless day-by-day puzzle analysis is important; it is
a higher-cardinality value.

Recommended key events:

- `sign_up`
- `begin_checkout`
- `daily_solved`
- `tutorial_complete`

Recommended Explore funnels:

1. Activation: `welcome_viewed` → `welcome_choice` → `first_move` →
   `sign_up`, broken down by `welcome_choice`.
2. Daily loop: `daily_opened` → `daily_solved` → `share`, filtered to
   `content_type = daily_puzzle` on the share step.
3. Revenue: `premium_upsell_viewed` → `premium_upsell_clicked` →
   `begin_checkout`.
4. Bot engagement: `first_move` filtered to `game_mode = bot` →
   `bot_game_finished` → `review_opened`.

Custom definitions are not retroactive and can take roughly 24–48 hours to
become available in standard reports, so create the core definitions soon
after deploying the events.

Official references:

- https://developers.google.com/analytics/devguides/collection/ga4/reference/recommended-events
- https://developers.google.com/analytics/devguides/collection/ga4/event-parameters
- https://support.google.com/analytics/answer/14239696
- https://support.google.com/analytics/answer/14240153
