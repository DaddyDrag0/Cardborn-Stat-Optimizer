# Cardborn Stat Optimizer

A simple browser calculator for Cardborn RNG. Enter your build, see calculated current stats, then optimize in a separate tab. Uses Cardborn's exported definitions and rolling code; HitCalculator influences the layout, not the game formulas.

## Use

Start in **Setup**. Enter lifetime rolls and allocated points, gamepasses, skill-tree nodes, crafted artifact/tier and Artifact Index points, relics/borders, Personal Artifact values, Tower/Void Shop levels, completed Index Sets, active potions, weather, and unlocks. Totals are calculated and read-only. The under-10M 1.25× Luck boost automatically applies below its threshold, unless disabled.

Crafted tiers include all 16 combinations. Artifact Index is separate from card Index Sets: every 2 points adds 10% strength (49 points = +240%). The crafting tier preview matches the game and leaves Roll Speed unchanged. Index stacking with tiers remains configurable and unconfirmed; the default multiplies their luck boosts. Existing saved profiles keep their setup and default to Normal/0 Index points until filled in.

- Setup: 102 skill nodes including both paths, masteries, Grandmastery, Transcendence and Constellations; 13 crafted artifacts; 16 relics with six border tiers; 24 potion definitions; 19 Index Sets; and all Tower/Void Shop levels. Selecting a skill includes prerequisites, and removing it removes dependent nodes.
- Hit Calculator: choose a minimum **base** rarity or exact card and required borders; see odds, hit rates, waiting times, and session chances.
- Optimizer: compare legal point allocations across eight stages or possible Personal Artifact builds, preserving selected locks and level/slot/duplicate limits.
- Profiles save in your browser and can be exported/imported as JSON. Nothing is sent to a server.

Recommendations use the same full build calculation. Applying them changes the allocation or artifact, then recalculates stats. **Calculation breakdown** shows sources; **Compare with in-game stats** accepts observed values without changing the model. This is intended for correcting unconfirmed server mechanics against a real build.

The Corrupted Shop catalog, code/fountain/server bonuses, and some rewards are server-supplied and absent from the export. Enter actual values as named **Other bonuses**, rather than editing calculated totals. Model settings expose starting values and multiplier order. A Tower discrepancy is explicit: UI says +0.4 Awakened Luck/level, shared shop description says +0.3; the default follows the UI.

Personal Artifact values can be entered as raw values before rarity or full-range quality percentages. Planned optimizer quality uses the available range at your level. Existing v1 profiles retain points/artifact and move their old entered totals into the comparison column; they do not silently become stat overrides.

## Accuracy

The original place export contains client/shared scripts, but no server scripts. The app visibly identifies the remaining assumptions. In particular, Fabled, Corrupted, and Void base odds are editable estimates. A border's rarity multiplier is not proof of its roll denominator. Fabled unlocks are card-specific; use the global Fabled switch only when every card in the selected pool is unlocked.

The point search is exhaustive under the model when Lucky Hand is zero. With Lucky Hand, it searches a shortlist and evaluates the joint card/border outcomes. The artifact planner uses a beam search; neither heuristic promises a global optimum. See [mechanics and assumptions](docs/mechanics.md).

## Develop and deploy

No build tool or runtime dependencies are required. Serve this folder with an HTTP server, for example `python -m http.server 8766`, and open its localhost URL. ES modules and workers require HTTP rather than opening the HTML file directly.

Run `npm ci` and `npm test` with Node 24. GitHub Actions tests pull requests and deploys `main` to GitHub Pages. In repository **Settings → Pages**, select **GitHub Actions** as the source before the first deployment. The published artifact includes only HTML, CSS, JavaScript, and `data/game.json`.

Game data was extracted without executing the supplied Lua scripts. Its source hash and source paths are recorded in `data/game.json`. Roblox card thumbnails retain the existing calculator's asset-ID/CDN mapping.
