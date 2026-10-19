import assert from 'node:assert/strict';
import {World, RADII} from './physics.mjs';
import {getMagnetPairs} from './mutation_effects.mjs';
import {MUTATION_DEFINITIONS} from './mutations.mjs';

const dt = 1 / 120;
const step = (world, n = 1) => { for (let i = 0; i < n && !world.over; i++) world.step(dt); };
const near = (a, b, tolerance = .001) =>
  assert(Math.abs(a - b) <= tolerance, 'Expected ' + a + ' ≈ ' + b);

// Nearest disjoint pairs inside the circle, no preference for the magnet's level.
{
  const w = new World();
  const m = w.add(2, 90, 617, {mutationType: 'magnet'});
  m.mutation = {type: 'magnet', phase: 'active', remaining: 2};
  const a = w.add(1, 120, 625), b = w.add(1, 180, 625);
  const c = w.add(1, 240, 625), d = w.add(1, 300, 625);
  const outsider = w.add(1, 345, 625);
  const e = w.add(3, 140, 500), f = w.add(3, 205, 500);
  const pairs = getMagnetPairs(w, m);
  assert.equal(pairs.length, 3);
  const ids = pairs.flatMap(pair => [pair.a.id, pair.b.id]);
  assert(ids.includes(a.id) && ids.includes(b.id) && ids.includes(c.id) &&
    ids.includes(d.id) && ids.includes(e.id) && ids.includes(f.id));
  assert(!ids.includes(m.id) && !ids.includes(outsider.id));
  const byLevel = pairs.filter(pair => pair.a.level === 1);
  assert.equal(byLevel.length, 2);
  assert(byLevel.some(pair => [pair.a.id, pair.b.id].includes(a.id) &&
    [pair.a.id, pair.b.id].includes(b.id)));
  assert(byLevel.some(pair => [pair.a.id, pair.b.id].includes(c.id) &&
    [pair.a.id, pair.b.id].includes(d.id)));
}

// Actual physical forces go from each eligible cat toward its matching partner.
{
  const w = new World();
  const mag = w.add(2, 90, 617, {mutationType: 'magnet'});
  const a = w.add(1, 180, 625), b = w.add(1, 300, 625);
  const initial = b.x - a.x;
  step(w, 15);
  assert.equal(mag.mutation.phase, 'active');
  assert(b.x - a.x < initial - 1, 'pair should approach within the active field');
  near(mag.x, 90, .01);
  step(w, 90);
  assert(!w.balls.includes(a) || !w.balls.includes(b),
    'nearby pair should actually merge rather than just shake');
  assert(w.events.some(e => e.type === 'merge' && e.level === 2));
}

// No partner in the field means no pull, even if the lone cat matches the magnet.
{
  const w = new World();
  w.add(2, 90, 617, {mutationType: 'magnet'});
  const different = w.add(1, 270, 625);
  const loneSameAsMagnet = w.add(2, 160, 617);
  const outsidePartner = w.add(1, 335, 625);
  step(w, 15);
  near(different.x, 270);
  near(loneSameAsMagnet.x, 160);
  near(outsidePartner.x, 335);
}

// The two-second field can organize a second merge after the first creates a new level.
{
  const w = new World();
  const mag = w.add(4, 90, 597, {mutationType: 'magnet'});
  w.add(1, 170, 625);
  w.add(1, 260, 625);
  w.add(2, 330, 617);
  step(w, 275);
  assert(w.events.some(e => e.type === 'merge' && e.level === 2),
    'first merge should occur');
  assert(w.events.some(e => e.type === 'merge' && e.level === 3),
    'new level should be paired for a chain merge');
  assert.equal(mag.mutation.phase, 'spent');
}

// Both bosses are immune; an active ghost must never be a magnet target.
{
  const w = new World();
  const mag = w.add(4, 90, 597, {mutationType: 'magnet'});
  mag.mutation = {type: 'magnet', phase: 'active', remaining: 2};
  const ghost = w.add(0, 140, 600, {mutationType: 'ghost'});
  ghost.mutation = {type: 'ghost', phase: 'active', remaining: 1};
  w.add(0, 230, 600);
  w.add(8, 250, 400, {kind: 'kamilla'});
  w.add(8, 350, 400, {kind: 'demir'});
  assert.equal(getMagnetPairs(w, mag).length, 0);
}

// All ninja activations use +60% ballistic height; each has its own full spin.
{
  assert.equal(MUTATION_DEFINITIONS.ninja.jumpHeightInDiameters, 2.4);
  const formerVelocity = Math.min(350, Math.sqrt(2 * 1050 * (3 * RADII[0])));
  for (const random of [() => .25, () => .75]) {
    const w = new World({random});
    const ninja = w.add(0, 180, 650 - RADII[0], {mutationType: 'ninja'});
    for (let i = 0; i < 100 && ninja.mutation.phase === 'armed'; i++) step(w);
    assert.equal(ninja.mutation.phase, 'spent');
    near(ninja.vy, -formerVelocity * Math.sqrt(1.6), 2);
    near(ninja.ninjaFlipStartedAt, w.time);
    near(ninja.ninjaFlipDuration, .65);
    assert([1, -1].includes(ninja.ninjaFlipDirection));
    assert.equal(w.events.filter(e => e.mutation === 'ninja').length, 1);
  }
}
console.log('MAGNET_NINJA_UPGRADE_PASS');
