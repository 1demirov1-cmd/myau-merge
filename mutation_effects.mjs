// Physical effects for МЯУ-МУТАЦИИ. Used only when a ball explicitly has mutation metadata.
// No random mutant drops are enabled in the game UI yet.
import {
  MUTATION_DEFINITIONS, activateMutation, advanceMutation, spendMutation,
} from './mutations.mjs';

export const EFFECT_MAX_SPEED = 850;
const MAX_IMPULSE = 360;

const cap = (value, limit = EFFECT_MAX_SPEED) => Math.max(-limit, Math.min(limit, value));
const normalBall = ball => ball.level < 8 && (!ball.mutation || ball.mutation.phase === 'spent');

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
  // Use impulses, never teleport; reduce force if crowded or near the ceiling.
  const horizontalRoom = Math.max(left, right);
  const headroom = Math.max(0, ball.y - ball.r);
  const horizontal = Math.min(175, horizontalRoom * 3);
  const vertical = Math.min(260, Math.sqrt(2 * world.gravity *
    (3 * ball.r)) * Math.min(1, headroom / (3 * ball.r)));
  ball.vx = cap(ball.vx + direction * horizontal);
  ball.vy = cap(ball.vy - vertical);
  world.events.push({type: 'mutation', mutation: 'ninja', id: ball.id, x:ball.x, y:ball.y});
}

export function startMutationTick(world, dt) {
  for (const ball of world.balls) {
    const state = ball.mutation;
    if (!state) continue;
    if (state.phase === 'armed' && (state.type === 'ghost' || state.type === 'heavy')) {
      ball.mutation = activateMutation(state);
    }
  }
  // Only previously activated magnets pull. Do not move bosses or phased ghosts.
  for (const source of world.balls) {
    if (source.mutation?.type !== 'magnet' || source.mutation.phase !== 'active') continue;
    for (const target of world.balls) {
      if (target === source || target.level !== source.level || !normalBall(target) || isPhased(target)) continue;
      const dx = source.x - target.x, dy = source.y - target.y;
      const dist = Math.hypot(dx, dy);
      const range = source.r * MUTATION_DEFINITIONS.magnet.rangeInRadii;
      if (dist < 1 || dist > range) continue;
      const proximity = 1 - dist / range;
      const acceleration = 420 * proximity;
      target.vx = cap(target.vx + dx / dist * acceleration * dt);
      target.vy = cap(target.vy + dy / dist * acceleration * dt);
    }
  }
}

export function registerImpact(world, ball, speed) {
  if (ball.mutation?.type !== 'spring' || ball.mutation.phase !== 'armed' ||
      speed < MUTATION_DEFINITIONS.spring.minImpactSpeed) return;
  ball.mutation = activateMutation(ball.mutation);
  (world.mutationPulses ??= []).push({id:ball.id,x:ball.x,y:ball.y,r:ball.r});
  world.events.push({type:'mutation',mutation:'spring',id:ball.id,x:ball.x,y:ball.y});
}

function applyPulse(world, pulse) {
  const range = pulse.r * MUTATION_DEFINITIONS.spring.rangeInRadii;
  for (const ball of world.balls) {
    if (ball.id === pulse.id || ball.level >= 8 || isPhased(ball)) continue;
    const dx=ball.x-pulse.x,dy=ball.y-pulse.y,dist=Math.hypot(dx,dy);
    if (dist >= range) continue;
    const falloff=1-dist/range;
    const strength=Math.min(MAX_IMPULSE, 290*falloff);
    const ux=dist > .001 ? dx/dist : (ball.id%2 ? -1 : 1);
    const uy=dist > .001 ? dy/dist : -1;
    ball.vx=cap(ball.vx+ux*strength);
    ball.vy=cap(ball.vy+uy*strength);
  }
}

export function finishMutationTick(world, dt) {
  // Impacts are queued so all pulses are processed after collision iteration.
  for (const pulse of world.mutationPulses ?? []) applyPulse(world, pulse);
  if (world.mutationPulses) world.mutationPulses.length=0;
  for (const ball of world.balls) {
    const state = ball.mutation;
    if (!state) continue;
    if (state.phase === 'active' && (state.type === 'ghost' || state.type === 'magnet')) {
      const next = advanceMutation(state, dt);
      if (state.type === 'ghost' && next.phase === 'spent') {
        // Resolve overlap over several simulation steps, rather than instantly displacing the ball.
        ball.materializeUntil=world.time+.5;
      }
      ball.mutation=next;
    } else if (state.phase === 'armed' && (state.type === 'ninja' || state.type === 'magnet')) {
      if (!isSettled(world,ball)) { ball.mutationSettle=0; continue; }
      ball.mutationSettle=(ball.mutationSettle??0)+dt;
      if (state.type === 'ninja' && ball.mutationSettle >= MUTATION_DEFINITIONS.ninja.jumpDelay) {
        ball.mutation=activateMutation(state);
        ninjaJump(world,ball);
      } else if (state.type === 'magnet' && ball.mutationSettle >= dt) {
        ball.mutation=activateMutation(state);
        world.events.push({type:'mutation',mutation:'magnet',id:ball.id,x:ball.x,y:ball.y});
      }
    }
  }
}
