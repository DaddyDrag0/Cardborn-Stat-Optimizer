# Cardborn Stat Optimizer

A browser build calculator for Cardborn RNG. Hit Calc supplies the visual reference; game formulas use Cardborn definitions and player-confirmed corrections.

## Use

The tabs are **Setup**, **Optimizer**, **Roll Simulator**, and **Builds**. Enter investments and equipment in Setup to derive current stats. Builds contains named browser saves, JSON import/export and model settings. Nothing is uploaded by the application.

- Card Index is the only skill-point source: `floor(Index / 20) × 2`. Earned/spent/available points are read-only. Selecting nodes includes prerequisites and rejects overspending. Lowering Index trims trailing selections/dependents to the budget. Constellations allow 2 Normal, 1 Greater and 1 Ascendant. Hover tooltips follow the pointer and show name/effect/cost.
- PA level is `floor(100 × (rolls / 100M)^0.4)`, capped at 100. Raw limits interpolate from minimum to maximum by level/100. Fixed slots follow levels 1/15/35/60/90, Mythic +1 or Celestial +2, gamepass +2 and Void up to +2. Lowering slot count drops trailing positions; values clamp to the level range. Empty slots add nothing.
- All 27 Index Sets include eight border-specific versions. Crafted artifacts have 16 tiers and a separate Artifact Index: 49 points gives +240%. Tier preview matches the game; Index/tier stacking remains a model assumption.
- Mythic Shiny/Awakened potions stack with their regular/Legendary versions. Other potion groups retain one strongest selection. Unavailable Fabled potions are excluded from UI and imports.
- Fabled border availability is under Account: a 1B threshold makes eligible cards at or below 1B rollable with that border. This does **not** grant Fabled abilities. Other border gates are assumed unlocked; world/weather filters still apply.
- Owned-level inputs calibrate existing shop investments. Buy spends unspent currency; Tower refunds return gold and Void has no refunds. The manual Tower-cap extension is removed. Shiny/Fabled gold caps are 25 from screenshots; other gold caps retain shared definitions pending confirmation.
- Five screenshot-confirmed Corrupted upgrades have levels/effects/caps. Buy works only for a next-level price actually provided. Unshown cost/refund curves and affordable “Own everything” purchases remain pending.
- Nineteen screenshot-confirmed achievements are selectable. Vaeloryn adds a periodic ×40 Luck roll every 20,000 rolls and World 8 access; it does not multiply permanent Luck. Periodic phase/counters follow the synchronized-cycle model.

The optimizer uses the same model for points or PA recommendations. The seeded simulator samples up to 50,000 cycles with cards, borders, extra rolls, Lucky Hand and periodic boosts.

## Pending mechanics

The place export has shared/client Lua but no server scripts. Remaining gold caps, full Corrupted cost/refund curves and new Dungeon floor/progression formulas need current data. Dungeon toggle/floor/HH:MM:SS inputs are available; time shows runs/hour but does not invent a progression bonus. The optional highest-floor preview retains labeled historical estimates.

Fabled/Corrupted/Void odds and several server aggregation rules remain estimates. Point search is exhaustive under the model without Lucky Hand and uses a shortlist with it; PA planning uses a beam search. See [mechanics](docs/mechanics.md).

## Develop and deploy

Run `npm ci` and `npm test`. Serve this directory over HTTP. GitHub Actions tests PRs and deploys main to Pages. The preparation helper in the parent workspace parses Lua literals without executing them and applies `data-overrides/player-confirmed.json` for screenshot/user corrections.
