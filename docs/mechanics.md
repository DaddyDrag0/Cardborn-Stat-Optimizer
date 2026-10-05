# Mechanics and assumptions

## Build calculator v2

Setup derives stats from investments/equipment rather than taking final totals as inputs. It includes all 102 generated skill-tree nodes (72 regular, 2 Grandmastery, 7 Transcendence, 21 Constellations), 13 crafted artifacts, 16 relics/six border tiers, 24 potion definitions, 19 Index Sets, passes, and Tower/Void upgrades. Skill prerequisites/costs reproduce the definition module's generated IDs, including legacy IDs retained in Mythos and Corrupted paths. The two path capstones are required for each mastery; Constellation limits are 2/1/1.

The model adds base, points, pass flats, equipment, tree flats, sets, shops, manual source bonuses, potion flats, and weather flat Luck. Artifact multipliers, summed tree percentages, pass percentages, individual potion percentages, weather, under-10M Luck, and Void attunement then apply. The default keeps groups separate. An alternative combines artifact bonus-above-one with summed tree percentages. Server aggregation is absent, so neither order is claimed confirmed. SkillTree.ComputeBonuses confirms sums within the tree, not its position in the final calculation.

Base defaults follow shop text: Luck/Shiny/Awakened/Corrupted 1; Fabled 2. Void 1 is assumed. A base interval of 1 second follows the client `1 - RollSpeed` cooldown. The update's minimum is 0.2s. Final speed potion percentages are modeled on the accumulated cooldown reduction, not on interval; this needs server confirmation.

Gamepass flat boosts and +10% final Shiny/Awakened/Corrupted follow descriptions; Fabled adds +1. Potion power is 1 + tree/manual power bonuses + 4% per Void Shop level, modeled on flat and final-percent potion boosts. Potion duration includes artifact/relic/tree bonuses. Void resonance adds 5% per level to equipment strength, modeled for both crafted and Personal Artifacts; exact scope/order is unconfirmed. Void attunement multiplies final Void Luck by 1 + 3% per level. Additional artifact strength defaults to zero and does not duplicate resonance.

Relic border scales use each exported BorderScale, with default scales only when absent. Lucky Hand relic chance is min(60%, 10% × scale). Bonus rolls occur every max(5, round(25/scale)); Dice every max(10, round(50/scale)). Their 2× and 4× Luck rolls are averaged with synchronized intersections and multiplicative overlap as assumptions. Rates average actual rounded-card probabilities, rather than multiplying ordinary Luck by an average. Session/wait estimates use stationary average cycles because server phase/counter rules are missing. Raider's Sword applies only to the separate raid Fabled readout.

Tower gain defaults use the Tower UI: Luck 2, Shiny .1, Awakened .4, Fabled .2, Corrupted .2, Void .5; Double .02, Roll Twice .01, Lucky Hand .02 per level. The shared description instead says Awakened .3, so this discrepancy is configurable. Above-base Tower levels are accepted for players with extra-cap upgrades; actual Corrupted Shop upgrade definitions are server-supplied and not available.

Other bonuses accepts named flat and luck-percent contributions for missing Corrupted Shop/code/fountain/server/reward data. These amounts require user input. It does not invent costs or levels for an absent catalog. Optional in-game totals are comparison data only. Infinite Dungeon floor bonuses are opt-in historical estimates and added after permanent multipliers. Normal rolling excludes them.

The older displayed-total inversion model remains internally available for legacy regression fixtures. The v2 interface migrates old totals to comparison values and uses build sources; its recommendations apply by replacing only allocations/artifact slots and recalculating.

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
- Artifact flat values and scaled bonus-above-one multipliers follow shared/client data. Separate duplicate multipliers multiply in this model; final server aggregation and resonance order are missing. Optional point scaling adds any further confirmed per-point factor; it normally stays at one because the build already includes equipment/tree percentages.
- Other build selections remain constant during recommendations. The app does not optimize skill-tree selections or potion costs. Under-10M Luck is automatically applied exactly once based on entered rolls, with a disable switch for calibration.
- A session holds the entered stats constant. Potion duration, potion expiry, free-roll currencies, and reroll acquisition costs are outside the objective.

## Optimization and probability

Targets use base rarity or exact card identity, plus all selected borders. Additional unselected borders are allowed. The objective is expected kept target cards per hour, including Lucky Hand selection and roll throughput. The session probability uses the complementary no-hit probability across complete roll cycles; it cannot exceed 100%.

With zero Lucky Hand, the point search enumerates feasible Luck/Shiny/Awakened allocations at each stage and assigns the maximum useful remaining Void points. This is exhaustive for the monotone target probability model. With Lucky Hand, the best 24 candidates from the proxy search are rescored using joint outcomes; it is a heuristic. Up to 2,075 points can be assigned; remaining points are reported.

The artifact planner retains a beam of 12 builds at each slot depth, tries damage-relevant luck and throughput stats, obeys the two-copy limit, and preserves locked slots in their positions. Planned quality means percent of the **available level range**, not the game's full-level quality display. It compares full legal builds and retains the current profile when better. This is a recommendation search, not a proof of the global optimum or an estimate of Essence cost.

Regression coverage checks sequential rounding, secret probability mass, eligibility, border stacking, Lucky Hand selection, roll batches, session probabilities, point-stage prerequisites, a brute-force allocation comparison, artifact scaling/positions, and profile validation. Browser QA covers saving, both worker searches, applying plans, card eligibility, and desktop/mobile layout.
