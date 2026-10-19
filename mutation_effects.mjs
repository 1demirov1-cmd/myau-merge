// Physical effects for МЯУ-МУТАЦИИ. Used only when a ball explicitly has mutation metadata.
// Effects activate only on explicit mutation metadata.
import {
  MUTATION_DEFINITIONS, activateMutation, advanceMutation, spendMutation,
} from './mutations.mjs?v=4';

export const EFFECT_MAX_SPEED = 850;

const cap = (value, limit = EFFECT_MAX_SPEED) => Math.max(-limit, Math.min(limit, value));

export function isPhased(ball) {
  return ball.mutation?.type === 'ghost' && ball.mutation.phase === 'active';
}

export function inverseMass(ball) {
  const multiplier = ball.mutation?.type === 'heavy' && ball.mutation.phase !== 'spent'
    ? MUTATION_DEFINITIONS.heavy.massMultiplier : 1;
  return 1 / (ball.r * ball.r * multiplier);
}

// Evaluate support, but not merely low velocity in mid-air.
export function isSettled(world, ball) {
  if (Math.abs(ball.vx) > 30 || Math.abs(ball.vy) > 35) return false;
  if (ball.y >= world.height - ball.r - 1) return true;
  return world.balls.some(other =>
    other !== ball && !isPhased(other) &&
    other.y > ball.y && Math.abs(other.vx) < 35 && Math.abs(other.vy) < 35 &&
    Math.hypot(other.x - ball.x, other.y - ball.y) <= ball.r + other.r + 1
  );
}

function roomOnSide(world, b, direction) {
  const wall = direction < 0 ? b.x - b.r : world.width - b.r - b.x;
  let space = wall;
  for (const other of world.balls) {
    if (other === b || isPhased(other)) continue;
    if (Math.abs(other.y - b.y) > b.r + other.r) continue;
    const distance = direction * (other.x - b.x) - b.r - other.r;
    if (distance >= -1) space = Math.min(space, Math.max(0, distance));
  }
  return Math.max(0, space);
}

function ninjaJump(world, ball) {
  const left = roomOnSide(world, ball, -1);
  const right = roomOnSide(world, ball, 1);
  const direction = Math.abs(left - right) < 1
    ? (world.random() < 0.5 ? -1 : 1) : (right > left ? 1 : -1);
  // Preserve the original impulse and its headroom guard; a 1.6x height
  // requires sqrt(1.6)x takeoff velocity under the same gravity.
  const horizontalRoom = Math.max(left, right);
  const headroom = Math.max(0, ball.y - ball.r);
  const horizontal = Math.min(210, horizontalRoom * 3.5);
  const formerVertical = Math.min(350, Math.sqrt(2 * world.gravity * (3 * ball.r))) *
    Math.min(1, headroom / (3 * ball.r));
  const vertical = formerVertical * Math.sqrt(
    MUTATION_DEFINITIONS.ninja.jumpHeightInDiameters / 1.5
  );
  ball.vx = cap(ball.vx + direction * horizontal);
  ball.vy = cap(ball.vy - vertical);
  // Cosmetic somersault, independent of collision-driven angular momentum.
  ball.ninjaFlipStartedAt = world.time;
  ball.ninjaFlipDuration = 0.65;
  ball.ninjaFlipDirection = direction;
  world.events.push({type: 'mutation', mutation: 'ninja', stage:'jump', id: ball.id, x:ball.x, y:ball.y, r:ball.r});
}

// Return disjoint nearest pairs inside one active magnet's circle.
// The magnet is a field generator, not an attraction target.
export function getMagnetPairs(world, source) {
  if (source.mutation?.type !== 'magnet' || source.mutation.phase !== 'active') return [];
  const range = source.r * MUTATION_DEFINITIONS.magnet.rangeInRadii;
  const nearby = world.balls.filter(ball =>
    ball !== source && ball.level < 8 && !isPhased(ball) &&
    !(ball.mutation?.type === 'magnet' && ball.mutation.phase === 'active') &&
    Math.hypot(ball.x - source.x, ball.y - source.y) <= range
  );
  const candidates = [];
  for (let i = 0; i < nearby.length; i++) {
    for (let j = i + 1; j < nearby.length; j++) {
      const a = nearby[i], b = nearby[j];
      if (a.level !== b.level) continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist > 0.001) candidates.push({a, b, dist, range});
    }
  }
  candidates.sort((p, q) => p.dist - q.dist || p.a.id - q.a.id || p.b.id - q.b.id);
  const used = new Set(), pairs = [];
  for (const pair of candidates) {
    if (used.has(pair.a.id) || used.has(pair.b.id)) continue;
    used.add(pair.a.id);
    used.add(pair.b.id);
    pairs.push(pair);
  }
  return pairs;
}

export function startMutationTick(world, dt) {
  for (const ball of world.balls) {
    const state = ball.mutation;
    if (!state) continue;
    if (state.phase === 'armed' && (state.type === 'ghost' || state.type === 'heavy')) {
      ball.mutation = activateMutation(state);
      world.events.push({type:'mutation',mutation:state.type,stage:'start',id:ball.id,x:ball.x,y:ball.y,r:ball.r});
    }
  }
  // Any eligible level may pair inside the field; both partners must be inside.
  // A ball participates in at most one pair even if several fields overlap.
  const candidates = world.balls.flatMap(source => getMagnetPairs(world, source));
  candidates.sort((p, q) => p.dist - q.dist || p.a.id - q.a.id || p.b.id - q.b.id);
  const used = new Set();
  for (const {a, b, dist, range} of candidates) {
    if (used.has(a.id) || used.has(b.id)) continue;
    used.add(a.id);
    used.add(b.id);
    const dx = (b.x - a.x) / dist, dy = (b.y - a.y) / dist;
    const acceleration = 3200 * Math.max(0.4, 1 - dist / (2 * range));
    a.vx = cap(a.vx + dx * acceleration * dt);
    a.vy = cap(a.vy + dy * acceleration * dt);
    b.vx = cap(b.vx - dx * acceleration * dt);
    b.vy = cap(b.vy - dy * acceleration * dt);
  }
}

export function registerTouchdown(world,ball) {
  if((ball.mutation?.type==='ninja'||ball.mutation?.type==='magnet'||ball.mutation?.type==='vampire')&&
    ball.mutation.phase==='armed' && !(ball.mutationSettle>0))ball.mutationSettle=0.00001;
}

export function registerImpact(world, ball, speed) {
  if(ball.mutation?.type==='heavy' && ball.mutation.phase==='active' && speed>=150 &&
     (ball.heavyImpactAt===undefined || world.time-ball.heavyImpactAt>=.45)){
    ball.heavyImpactAt=world.time;
    world.events.push({type:'mutation',mutation:'heavy',stage:'impact',id:ball.id,x:ball.x,y:ball.y,r:ball.r});
  }
}
export function finishMutationTick(world, dt) {
  for (const ball of world.balls) {
    const state = ball.mutation;
    if (!state) continue;
    if (state.phase === 'active' && (state.type === 'ghost' || state.type === 'magnet')) {
      const next = advanceMutation(state, dt);
      if (state.type === 'ghost' && next.phase === 'spent') {
        // Resolve overlap over several simulation steps, rather than instantly displacing the ball.
        ball.materializeUntil=world.time+.5;
        world.events.push({type:'mutation',mutation:'ghost',stage:'end',id:ball.id,x:ball.x,y:ball.y,r:ball.r});
      }
      ball.mutation=next;
    } else if (state.phase === 'armed' && (state.type === 'ninja' || state.type === 'magnet' || state.type === 'vampire')) {
      // A genuine touchdown starts the clock even if the cat keeps rolling or bouncing.
      if(!(ball.mutationSettle>0) && !isSettled(world,ball))continue;
      ball.mutationSettle=(ball.mutationSettle??0)+dt;
      if (state.type === 'ninja' && ball.mutationSettle >= MUTATION_DEFINITIONS.ninja.jumpDelay) {
        ball.mutation=activateMutation(state);
        ninjaJump(world,ball);
      } else if (state.type === 'vampire' && ball.mutationSettle >= dt) {
        const radius = ball.r * MUTATION_DEFINITIONS.vampire.rangeInRadii;
        const target = world.balls.filter(b => b !== ball && b.level === ball.level + 1 &&
          b.level < 8 && Math.hypot(b.x-ball.x,b.y-ball.y) <= radius)
          .sort((a,b) => Math.hypot(a.x-ball.x,a.y-ball.y) -
            Math.hypot(b.x-ball.x,b.y-ball.y) || a.id-b.id)[0];
        ball.mutation = spendMutation(state);
        if (target) {
          const level = target.level;
          const x = (ball.x+target.x)/2, y = (ball.y+target.y)/2;
          world.balls.splice(world.balls.indexOf(target),1);
          world.balls.splice(world.balls.indexOf(ball),1);
          const merged = world.add(level,x,y,{lock:world.time+.12});
          merged.x = Math.max(merged.r,Math.min(world.width-merged.r,merged.x));
          merged.y = Math.min(world.height-merged.r,merged.y);
          const points = 2 ** (level+1);
          world.score += points;
          world.events.push({type:'mutation',mutation:'vampire',stage:'bite',x,y,r:ball.r});
          world.events.push({type:'merge',x,y,level,points});
        }
      } else if (state.type === 'magnet' && ball.mutationSettle >= dt) {
        ball.mutation=activateMutation(state);
        world.events.push({type:'mutation',mutation:'magnet',stage:'start',id:ball.id,x:ball.x,y:ball.y,r:ball.r});
      }
    }
  }
}
