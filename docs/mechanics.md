# Mechanics and assumptions

## Source

The supplied `225x Luck Cardborn RNG.rbxl` export is place version 3786, SHA-256 `ba7ad2c92039807c5e3220df79b83c717f3c399496b11aa27c751ce8040ad66d`. Its shared/client Lua was inspected as text; none was executed. It omits server scripts. Data includes 160 cards, secret upgrades, weather/badge requirements, point caps, and 18 artifact stats. The recent update log confirms the 0.2-second minimum interval, +0.15 Void Luck per point, and two extra artifact slots.

## Confirmed in shared/client code

- Base cards are checked sequentially, rarest first, with probability `1 / max(1, ceil(base rarity / Luck))`. The last eligible card is the fallback. This is not a weighted draw proportional to inverse rarity.
- Secret upgrades are conditional on the base card, with their exported denominators; normal Luck does not scale that upgrade roll.
- Shiny chance is Shiny Luck / 100. Awakened chance is Awakened Luck / 1,000,000 and requires its unlock. Probabilities saturate at one.
- Void's generator uses `1 / max(1, ceil(VOID_BASE_ODDS / Void Luck))`, but the referenced constant is not defined in the export.
- Border rarity multipliers are Shiny 100, Awakened 1,000,000, Fabled 10,000, Corrupted 100,000, and Void 10,000,000. They stack for rolled stats.
- Rolled HP is `floor((10 + final rarity^0.35 × 5) × matching weather boost)` and ATK is `floor(HP / 2)`.
- Lucky Hand creates two candidates and keeps the greater HP + 2×ATK, then rarity for a tie. The calculator evaluates joint card/border outcomes: a common card with a strong border can beat a desired rare card.
- Four assignable stats gain Luck +0.5, Shiny +0.05, Awakened +0.1, Void +0.15 per point. The UI says one point per 50,000 rolls; the budget can be entered directly. Final caps are 1000/75/500/500; all previous caps must be filled to unlock the next stage.
- Artifact level is `floor(100 × (rolls / 100,000,000)^0.4)`, capped at 100. Five base slots unlock at levels 1/15/35/60/90, plus gamepass +2, Mythic +1 or Celestial +2, and purchased Void slots up to +2. Bonuses start when a base slot exists.
- Artifact maxima interpolate from minimum to full maximum by level, with the exported rounding. A second copy has half effect; more than two are prohibited. For multiplier stats, half effect and rarity affect the bonus above one, not the entire multiplier.
- Exported lock count is base 2 or gamepass 4, plus Mythic 1 or Celestial 2. Void Shop text mentions another lock, but this function does not include it; extra lock behavior remains unconfirmed.

## Explicit model assumptions

- The base-card pool is reconstructed from displayed badge and weather requirements. The server's exact eligible-pool construction is missing.
- Border rolls are independent. Fabled and Corrupted are modeled as continuous Luck/base-odds probabilities after unlock. Their server rolls are missing. The global Fabled switch assumes all eligible cards have their individual unlock.
- Default base odds for Fabled 10,000, Corrupted 100,000, and Void 10,000,000 are estimates, editable in Model settings. These defaults must not be presented as verified odds.
- Double Roll adds one card, Roll Twice adds two, and Triple Roll adds two; these procs stack independently. The UI supports the first two counts, but the server batching/interaction logic and Triple Roll count are missing. Enter measured percentages and treat throughput as a model estimate.
- Current flat artifact bonuses are removed before current multipliers; new flat bonuses and points are then applied before the new multipliers. Separate multiplier stats multiply together. Artifact strength scales their bonus above one and flat values. The server's final buff aggregation and resonance order are missing. The optional point scale calibrates additional multipliers beyond the artifact.
- Current displayed totals already include all other buffs, potions, sets, skill trees, weather/stat bonuses, and the under-10M boost. These remain constant during each comparison. The app does not optimize skill-tree selections or potion costs.
- A session holds the entered stats constant. Potion duration, potion expiry, free-roll currencies, and reroll acquisition costs are outside the objective.

## Optimization and probability

Targets use base rarity or exact card identity, plus all selected borders. Additional unselected borders are allowed. The objective is expected kept target cards per hour, including Lucky Hand selection and roll throughput. The session probability uses the complementary no-hit probability across complete roll cycles; it cannot exceed 100%.

With zero Lucky Hand, the point search enumerates feasible Luck/Shiny/Awakened allocations at each stage and assigns the maximum useful remaining Void points. This is exhaustive for the monotone target probability model. With Lucky Hand, the best 24 candidates from the proxy search are rescored using joint outcomes; it is a heuristic. Up to 2,075 points can be assigned; remaining points are reported.

The artifact planner retains a beam of 12 builds at each slot depth, tries damage-relevant luck and throughput stats, obeys the two-copy limit, and preserves locked slots in their positions. Planned quality means percent of the **available level range**, not the game's full-level quality display. It compares full legal builds and retains the current profile when better. This is a recommendation search, not a proof of the global optimum or an estimate of Essence cost.

Regression coverage checks sequential rounding, secret probability mass, eligibility, border stacking, Lucky Hand selection, roll batches, session probabilities, point-stage prerequisites, a brute-force allocation comparison, artifact scaling/positions, and profile validation. Browser QA covers saving, both worker searches, applying plans, card eligibility, and desktop/mobile layout.
