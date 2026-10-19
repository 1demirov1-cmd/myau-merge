# MYAU Mutations: spring, ninja, magnet usability fix — 2026-10-19

User report: only Ghost and Heavy were visibly working; Spring, Ninja and Magnet felt inactive.

## Diagnosis
Direct simulation of drops from the game spawn height (y=43) showed abilities technically firing, but:
- Spring's radial pulse was invisible without nearby cats, and same-level merges could consume it before impact.
- Ninja needed a sustained settled state, made worse by bouncing and unstable stacks; its jump force was weaker than the specified 1.5-diameter height.
- Magnet only applied a weak force to same-level ordinary cats within four radii, leading to negligible motion in a normal crowded game; no eligible targets made it appear to do nothing.
- Temporary notifications could be overwritten by merge toasts.

## Fix
- Spring: once activated, pushes nearby normal cats and visibly rebounds its own ball. It also bursts once when merged on contact before reaching the floor.
- Ninja: the 0.4-second jump countdown begins at a real supporting contact (floor or another ball), not only after a long stationary period. Vertical jump force respects a maximum height of around 1.5 diameters.
- Magnet: begins on first touchdown and applies noticeably stronger attraction within the existing four-radii range, to ordinary cats of the same level. Shows connecting lines when there are targets. Its 2-second duration is unchanged.
- In-game colored effect labels persist ~1.2 seconds independently of the general toast, making activation visible during simultaneous merges. Spring shockwave, Ninja trail and Magnet field remain recognizable.
- Ghost, Heavy, 10% mutant roll frequency, max three active, and the Kamillkachad/Demirchad finale logic remain unchanged.

## Evidence
`node --test test_absolute_mur.mjs test_mutations.mjs test_mutation_effects.mjs test_game_state.mjs test_real_mutation_activation.mjs`: 5 suites passed. `test_real_mutation_activation.mjs` verifies actual drops from y=43, spring's recoil, Ninja jump velocity, Magnet pulling equal cats to a merge, and Spring activation upon same-level merging.

`py -3 test_browser_all_effects.py`: mobile-viewport Chrome tested three abilities with a test-only HTTP interception forcing the fifth drop to have each mutation, without changing production odds. Each ability visibly rendered its on-canvas event text for 72 frames with 0 page JavaScript errors. Interception code is confined to the test harness and does not ship to players.

`py -3 test_browser_mutations.py`: existing seeded-roll/undo/continue/pause regression.

Limitations: automated Chrome and simulated physics do not replace a manual gameplay session on real iOS Safari/Android devices; no independent iPhone acceptance was performed. The magnet needs an eligible ordinary cat at the same level within the four-radii area to attract anything; without such a target, only its field is visible. The spring only pushes nearby cats; with no neighbor its own bounce confirms activation.

## Deployment
PWA cache version v10. Public address unchanged: https://1demirov1-cmd.github.io/myau-merge/
