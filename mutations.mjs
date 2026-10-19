// МЯУ-МУТАЦИИ: five active special-cat abilities.
export const MUTATION_CHANCE = 0.10;
export const FIRST_MUTATION_THROW = 5; // 1-based drop number
export const MAX_ACTIVE_MUTATIONS = 3;
export const MIN_MUTATION_LEVEL = 0; // physics levels are 0-based
export const MAX_MUTATION_LEVEL = 4; // user-facing levels 1–5

export const MUTATION_DEFINITIONS = Object.freeze({
  ghost: Object.freeze({weight: 20, trigger: 'drop', duration: 1.5}),
  heavy: Object.freeze({weight: 25, trigger: 'drop', duration: null, massMultiplier: 5}),
  maniac: Object.freeze({weight: 25, trigger: 'contact', duration: 0}),
  ninja: Object.freeze({weight: 15, trigger: 'settled', duration: 0, jumpDelay: 0.4, jumpHeightInDiameters: 2.4}),
  magnet: Object.freeze({weight: 15, trigger: 'settled', duration: 2, rangeInRadii: 7}),
});
export const MUTATION_TYPES = Object.freeze(Object.keys(MUTATION_DEFINITIONS).filter(type => MUTATION_DEFINITIONS[type].weight > 0));
const WEIGHT_TOTAL = MUTATION_TYPES.reduce((sum, type) => sum + MUTATION_DEFINITIONS[type].weight, 0);

export function isMutationLevel(level) {
  return Number.isInteger(level) && level >= MIN_MUTATION_LEVEL && level <= MAX_MUTATION_LEVEL;
}

export function createMutationState(type) {
  if (!Object.hasOwn(MUTATION_DEFINITIONS, type)) throw new RangeError('Unknown mutation: ' + String(type));
  return {type, phase: 'armed', remaining: 0};
}

export function isActiveMutation(mutation) {
  return Boolean(mutation && (mutation.phase === 'armed' || mutation.phase === 'active'));
}

export function countActiveMutations(balls) {
  return balls.reduce((total, ball) => total + (isActiveMutation(ball.mutation) ? 1 : 0), 0);
}

function getRandom(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Random generator must return a number in [0, 1)');
  }
  return value;
}

// Return a mutation type or null. This does not modify the world.
// Call ONCE per generated upcoming cat, then preserve the result for preview/drop/undo.
export function rollMutation({level, throwNumber, balls = [], random = Math.random} = {}) {
  if (!Number.isInteger(throwNumber) || throwNumber < 1) throw new RangeError('Invalid throw number');
  if (!isMutationLevel(level) || throwNumber < FIRST_MUTATION_THROW ||
      countActiveMutations(balls) >= MAX_ACTIVE_MUTATIONS) return null;
  if (getRandom(random) >= MUTATION_CHANCE) return null;
  const pick = getRandom(random) * WEIGHT_TOTAL;
  let sum = 0;
  for (const type of MUTATION_TYPES) {
    sum += MUTATION_DEFINITIONS[type].weight;
    if (pick < sum) return type;
  }
  throw new Error('Invalid mutation distribution');
}

// Pure lifecycle: armed -> active -> spent. Instant actions become spent when triggered.
// Heavy stays active (remaining=null) until its ball merges or is removed.
export function activateMutation(state) {
  if (!state || !Object.hasOwn(MUTATION_DEFINITIONS, state.type)) throw new RangeError('Invalid mutation state');
  if (state.phase !== 'armed') return state;
  const duration = MUTATION_DEFINITIONS[state.type].duration;
  return duration === 0
    ? {...state, phase: 'spent', remaining: 0}
    : {...state, phase: 'active', remaining: duration};
}

export function advanceMutation(state, dt, {paused = false} = {}) {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid step duration');
  if (!state || state.phase !== 'active' || state.remaining === null || paused || dt === 0) return state;
  const remaining = Math.max(0, state.remaining - dt);
  return {...state, remaining, phase: remaining === 0 ? 'spent' : 'active'};
}

export function spendMutation(state) {
  return state && state.phase !== 'spent'
    ? {...state, phase: 'spent', remaining: 0}
    : state;
}
