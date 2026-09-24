import { findPathAStar, type SearchResult } from "../../domain/navigation/search";
import { worldToCell, type GridMap, type GridPoint } from "../../domain/model/grid";
import type { PerceptionMemory } from "../../domain/perception/memory";
import { nextPatrolIndex, patrolPointAt } from "../../domain/behavior/patrol";
import {
  resolveTransition,
  type GuardCause,
  type GuardPerceptionInput,
  type GuardState,
} from "../../domain/behavior/guardState";
import {
  appendTransition,
  createTransitionLog,
  type TransitionEvent,
  type TransitionLog,
} from "../../domain/telemetry/transitionLog";
import { TILE_SIZE } from "./labLevel";

const LOG_TAIL_LIMIT = 10;

export interface GuardFrameInput {
  readonly timeMs: number;
  readonly positionCell: GridPoint;
  readonly arrived: boolean;
  readonly visionVisible: boolean;
  readonly soundHeard: boolean;
  readonly memory: PerceptionMemory;
}

export interface GuardFrameOutput {
  readonly state: GuardState;
  readonly events: readonly TransitionEvent[];
  readonly routeVersion: number;
  readonly routeCells: readonly GridPoint[] | null;
  readonly goalCell: GridPoint | null;
  readonly searchResult: SearchResult | null;
  readonly log: TransitionLog;
}

interface GuardRoute {
  readonly goalCell: GridPoint;
  readonly cells: readonly GridPoint[];
}

export interface GuardSimulation {
  readonly map: GridMap;
  readonly patrolPoints: readonly GridPoint[];
  state: GuardState;
  patrolIndex: number;
  route: GuardRoute | null;
  routeVersion: number;
  started: boolean;
  lastArrived: boolean;
  searchResult: SearchResult | null;
  log: TransitionLog;
}

type Emit = (from: GuardState, to: GuardState, cause: GuardCause, target: GridPoint | null) => void;

export function createGuardSimulation(
  map: GridMap,
  patrolPoints: readonly GridPoint[],
  startCell: GridPoint,
): GuardSimulation {
  if (patrolPoints.length === 0) {
    throw new Error("Patrol points must not be empty.");
  }
  return {
    map,
    patrolPoints,
    state: "patrol",
    patrolIndex: initialPatrolIndex(patrolPoints, startCell),
    route: null,
    routeVersion: 0,
    started: false,
    lastArrived: false,
    searchResult: null,
    log: createTransitionLog(LOG_TAIL_LIMIT),
  };
}

export function updateGuardSimulation(
  sim: GuardSimulation,
  input: GuardFrameInput,
): GuardFrameOutput {
  const events: TransitionEvent[] = [];

  const emit: Emit = (from, to, cause, target) => {
    const event: TransitionEvent = { timeMs: input.timeMs, from, to, cause, target };
    events.push(event);
    sim.log = appendTransition(sim.log, event);
  };

  if (!sim.started) {
    sim.started = true;
    emit("patrol", "patrol", "patrol-started", currentPatrolGoal(sim));
  }

  const arrivedEdge = input.arrived && !sim.lastArrived;
  sim.lastArrived = input.arrived;

  const perception: GuardPerceptionInput = {
    visionVisible: input.visionVisible,
    soundHeard: input.soundHeard,
    memory: input.memory,
  };

  const resolution = resolveTransition(
    sim.state,
    perception,
    sim.state === "patrol" ? arrivedEdge : input.arrived,
    false,
  );
  let consumedArrival = false;
  if (resolution && resolution.to !== sim.state) {
    const target = resolution.to === "investigate" ? lastKnownCell(input.memory) : null;
    emit(sim.state, resolution.to, resolution.cause, target);
    consumedArrival = input.arrived;
    sim.state = resolution.to;
    sim.route = null;
  }

  routeForState(sim, input, perception, consumedArrival ? false : arrivedEdge, emit);

  return {
    state: sim.state,
    events,
    routeVersion: sim.routeVersion,
    routeCells: sim.route?.cells ?? null,
    goalCell: sim.route?.goalCell ?? null,
    searchResult: sim.searchResult,
    log: sim.log,
  };
}

function routeForState(
  sim: GuardSimulation,
  input: GuardFrameInput,
  perception: GuardPerceptionInput,
  arrivedEdge: boolean,
  emit: Emit,
): void {
  switch (sim.state) {
    case "patrol":
      routePatrol(sim, input, arrivedEdge, emit);
      return;
    case "investigate":
      routeInvestigate(sim, input, perception, emit);
      return;
    default:
      sim.route = null;
  }
}

function routePatrol(
  sim: GuardSimulation,
  input: GuardFrameInput,
  arrivedEdge: boolean,
  emit: Emit,
): void {
  if (arrivedEdge) {
    emit("patrol", "patrol", "arrived", sim.route?.goalCell ?? null);
    sim.patrolIndex = nextPatrolIndex(sim.patrolPoints.length, sim.patrolIndex);
    emit("patrol", "patrol", "patrol-point-selected", currentPatrolGoal(sim));
    attemptPatrolRoute(sim, input.positionCell, emit);
  } else if (!sim.route || !sameCell(currentPatrolGoal(sim), sim.route.goalCell)) {
    attemptPatrolRoute(sim, input.positionCell, emit);
  }
}

function attemptPatrolRoute(sim: GuardSimulation, startCell: GridPoint, emit: Emit): void {
  const limit = sim.patrolPoints.length;
  for (let attempt = 0; attempt < limit; attempt += 1) {
    const goal = currentPatrolGoal(sim);
    const result = findPathAStar(sim.map, startCell, goal);
    sim.searchResult = result;
    if (result.status === "success") {
      sim.route = { goalCell: goal, cells: result.path };
      sim.routeVersion += 1;
      emit("patrol", "patrol", "route-replanned", goal);
      return;
    }
    emit("patrol", "patrol", "patrol-point-skipped", goal);
    sim.patrolIndex = nextPatrolIndex(sim.patrolPoints.length, sim.patrolIndex);
  }
  sim.route = null;
}

function routeInvestigate(
  sim: GuardSimulation,
  input: GuardFrameInput,
  perception: GuardPerceptionInput,
  emit: Emit,
): void {
  const goal = lastKnownCell(input.memory);
  if (!goal) {
    sim.route = null;
    return;
  }
  if (sim.route && sameCell(goal, sim.route.goalCell)) {
    return;
  }
  if (sameCell(goal, input.positionCell)) {
    sim.route = { goalCell: goal, cells: [goal] };
    sim.routeVersion += 1;
    emit("investigate", "investigate", "retargeted", goal);
    return;
  }
  const result = findPathAStar(sim.map, input.positionCell, goal);
  sim.searchResult = result;
  if (result.status === "success") {
    sim.route = { goalCell: goal, cells: result.path };
    sim.routeVersion += 1;
    emit("investigate", "investigate", "retargeted", goal);
    return;
  }
  const recovery = resolveTransition(sim.state, perception, false, true);
  if (recovery && recovery.to !== sim.state) {
    emit(sim.state, recovery.to, recovery.cause, goal);
    sim.state = recovery.to;
    sim.route = null;
    routeForState(sim, input, perception, false, emit);
  } else {
    sim.route = null;
  }
}

function lastKnownCell(memory: PerceptionMemory): GridPoint | null {
  const position = memory.lastKnownPosition;
  if (!position) {
    return null;
  }
  return worldToCell(position, TILE_SIZE);
}

function currentPatrolGoal(sim: GuardSimulation): GridPoint {
  return patrolPointAt(sim.patrolPoints, sim.patrolIndex);
}

function initialPatrolIndex(points: readonly GridPoint[], startCell: GridPoint): number {
  if (points.length === 1) {
    return 0;
  }
  const first = points[0];
  if (first && sameCell(first, startCell)) {
    return 1;
  }
  return 0;
}

function sameCell(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y;
}