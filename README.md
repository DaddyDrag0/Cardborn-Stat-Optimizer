# Cardborn Stat Optimizer

A browser calculator for Cardborn RNG, with a stat-point optimizer and Personal Artifact planner. It uses Cardborn's exported card definitions and rolling code. HitCalculator influenced the presentation; its game formulas are not used.

## Use

Choose a minimum **base** rarity or a specific card, then select any required borders. Enter your current displayed lucks, measured roll interval, roll-proc percentages, lifetime rolls, point allocation, and raw artifact values. Include your existing buffs in the displayed totals; the app does not add the under-10M Luck boost again.

- Calculator: per-card odds, expected hits per hour, average waiting time, and the chance of at least one hit during a session.
- Stat points: compare legal allocations across all eight cap stages. Higher stages require filling the previous stage's four caps.
- Artifact planner: compare possible stat combinations, preserve selected locked slots, respect level ranges and duplicate limits, and use purchased Void Shop slots.
- Profiles save in your browser and can be exported/imported as JSON. Nothing is sent to a server.

Recommendations compare against the current profile. Applying a recommendation updates both its allocation/artifact and the displayed totals, avoiding counting the same bonuses twice.

## Accuracy

The original place export contains client/shared scripts, but no server scripts. The app visibly identifies the remaining assumptions. In particular, Fabled, Corrupted, and Void base odds are editable estimates. A border's rarity multiplier is not proof of its roll denominator. Fabled unlocks are card-specific; use the global Fabled switch only when every card in the selected pool is unlocked.

The point search is exhaustive under the model when Lucky Hand is zero. With Lucky Hand, it searches a shortlist and evaluates the joint card/border outcomes. The artifact planner uses a beam search; neither heuristic promises a global optimum. See [mechanics and assumptions](docs/mechanics.md).

## Develop and deploy

No build tool or runtime dependencies are required. Serve this folder with an HTTP server, for example `python -m http.server 8766`, and open its localhost URL. ES modules and workers require HTTP rather than opening the HTML file directly.

Run `npm ci` and `npm test` with Node 24. GitHub Actions tests pull requests and deploys `main` to GitHub Pages. In repository **Settings → Pages**, select **GitHub Actions** as the source before the first deployment. The published artifact includes only HTML, CSS, JavaScript, and `data/game.json`.

Game data was extracted without executing the supplied Lua scripts. Its source hash and source paths are recorded in `data/game.json`. Roblox card thumbnails retain the existing calculator's asset-ID/CDN mapping.
