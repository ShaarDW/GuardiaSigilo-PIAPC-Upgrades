import { findPathAStar, type SearchResult } from "../../domain/navigation/search";
import { manhattanDistance } from "../../domain/navigation/gridGraph";
import {
  cellKey,
  worldToCell,
  type GridMap,
  type GridPoint,
} from "../../domain/model/grid";
import type { PerceptionMemory } from "../../domain/perception/memory";
import { nextPatrolIndex, patrolPointAt } from "../../domain/behavior/patrol";
import { buildSearchPlan } from "../../domain/behavior/searchPlan";
import {
  resolveTransition,
  type GuardCause,
  type GuardPerceptionInput,
  type GuardState,
  type GuardTransitionContext,
} from "../../domain/behavior/guardState";
import {
  appendTransition,
  createTransitionLog,
  type TransitionEvent,
  type TransitionLog,
} from "../../domain/telemetry/transitionLog";
import { TILE_SIZE } from "./labLevel";

export const REPLAN_INTERVAL_MS = 250;
export const PATROL_PAUSE_MS = 700;
export const SEARCH_RADIUS_CELLS = 3;
export const SEARCH_WAYPOINTS_MAX = 16;
export const SEARCH_DURATION_MS = 5000;
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
  readonly routeComputations: number;
  readonly searchWaypoints: readonly GridPoint[] | null;
  readonly planIndex: number;
  readonly returnCandidates: readonly GridPoint[] | null;
  readonly candidateIndex: number;
  readonly patrolPaused: boolean;
  readonly patrolGazeCell: GridPoint | null;
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
  lastVisionSeenAtMs: number | null;
  lastRouteAtMs: number;
  routeComputations: number;
  stalledGoalKey: string | null;
  searchWaypoints: readonly GridPoint[] | null;
  planIndex: number;
  searchStartedAtMs: number | null;
  returnCandidates: readonly GridPoint[] | null;
  candidateIndex: number;
  patrolPauseMs: number;
  patrolPauseStartedAtMs: number | null;
  searchResult: SearchResult | null;
  log: TransitionLog;
}

type Emit = (from: GuardState, to: GuardState, cause: GuardCause, target: GridPoint | null) => void;

export interface GuardSimulationOptions {
  readonly patrolPauseMs?: number;
}

export function createGuardSimulation(
  map: GridMap,
  patrolPoints: readonly GridPoint[],
  startCell: GridPoint,
  options: GuardSimulationOptions = {},
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
    lastVisionSeenAtMs: null,
    lastRouteAtMs: 0,
    routeComputations: 0,
    stalledGoalKey: null,
    searchWaypoints: null,
    planIndex: 0,
    searchStartedAtMs: null,
    returnCandidates: null,
    candidateIndex: 0,
    patrolPauseMs: options.patrolPauseMs ?? 0,
    patrolPauseStartedAtMs: null,
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

  const timeSinceLastVisionMs =
    sim.lastVisionSeenAtMs === null ? null : input.timeMs - sim.lastVisionSeenAtMs;
  if (input.visionVisible) {
    sim.lastVisionSeenAtMs = input.timeMs;
  }

  const searchBudgetExceeded =
    sim.searchStartedAtMs !== null && input.timeMs - sim.searchStartedAtMs >= SEARCH_DURATION_MS;

  const perception: GuardPerceptionInput = {
    visionVisible: input.visionVisible,
    soundHeard: input.soundHeard,
    memory: input.memory,
  };
  const arrivalSignal =
    sim.state === "return" ? input.arrived && sim.route !== null : input.arrived;
  const context: GuardTransitionContext = {
    arrivedAtGoal: sim.state === "patrol" ? arrivedEdge : arrivalSignal,
    goalUnreachable: false,
    timeSinceLastVisionMs,
    searchCovered: false,
    searchBudgetExceeded,
    searchUnfeasible: false,
  };

  const resolution = resolveTransition(sim.state, perception, context);
  let consumedArrival = false;
  if (resolution && resolution.to !== sim.state) {
    const target = resolution.to === "investigate" ? lastKnownCell(input.memory) : null;
    emit(sim.state, resolution.to, resolution.cause, target);
    consumedArrival = input.arrived;
    if (sim.state === "search") {
      sim.searchWaypoints = null;
      sim.planIndex = 0;
      sim.searchStartedAtMs = null;
    }
    if (sim.state === "return") {
      if (resolution.to === "patrol") {
        resumePatrolAfterReturn(sim);
      }
      sim.returnCandidates = null;
      sim.candidateIndex = 0;
    }
    sim.stalledGoalKey = null;
    sim.patrolPauseStartedAtMs = null;
    sim.state = resolution.to;
    sim.route = null;
  }

  routeForState(sim, input, perception, consumedArrival ? false : arrivedEdge, emit);

  const patrolPaused = sim.state === "patrol" && sim.patrolPauseStartedAtMs !== null;

  return {
    state: sim.state,
    events,
    routeVersion: sim.routeVersion,
    routeCells: sim.route?.cells ?? null,
    goalCell: sim.route?.goalCell ?? null,
    searchResult: sim.searchResult,
    routeComputations: sim.routeComputations,
    searchWaypoints: sim.searchWaypoints,
    planIndex: sim.planIndex,
    returnCandidates: sim.returnCandidates,
    candidateIndex: sim.candidateIndex,
    patrolPaused,
    patrolGazeCell: patrolPaused ? currentPatrolGoal(sim) : null,
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
    case "pursue":
      routePursue(sim, input, emit);
      return;
    case "search":
      routeSearch(sim, input, perception, arrivedEdge, emit);
      return;
    case "return":
      routeReturn(sim, input, emit);
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
  if (sim.patrolPauseStartedAtMs !== null) {
    if (input.timeMs - sim.patrolPauseStartedAtMs >= sim.patrolPauseMs) {
      sim.patrolPauseStartedAtMs = null;
      attemptPatrolRoute(sim, input, emit);
    }
    return;
  }

  if (arrivedEdge) {
    emit("patrol", "patrol", "arrived", sim.route?.goalCell ?? null);
    sim.patrolIndex = nextPatrolIndex(sim.patrolPoints.length, sim.patrolIndex);
    emit("patrol", "patrol", "patrol-point-selected", currentPatrolGoal(sim));
    if (sim.patrolPauseMs > 0) {
      sim.patrolPauseStartedAtMs = input.timeMs;
      sim.route = null;
      return;
    }
    attemptPatrolRoute(sim, input, emit);
  } else if (!sim.route || !sameCell(currentPatrolGoal(sim), sim.route.goalCell)) {
    attemptPatrolRoute(sim, input, emit);
  }
}

function attemptPatrolRoute(sim: GuardSimulation, input: GuardFrameInput, emit: Emit): void {
  const limit = sim.patrolPoints.length;
  for (let attempt = 0; attempt < limit; attempt += 1) {
    const goal = currentPatrolGoal(sim);
    const result = runSearch(sim, input, input.positionCell, goal);
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
  const result = runSearch(sim, input, input.positionCell, goal);
  if (result.status === "success") {
    sim.route = { goalCell: goal, cells: result.path };
    sim.routeVersion += 1;
    emit("investigate", "investigate", "retargeted", goal);
    return;
  }
  const recovery = resolveTransition(sim.state, perception, {
    arrivedAtGoal: false,
    goalUnreachable: true,
    timeSinceLastVisionMs: null,
    searchCovered: false,
    searchBudgetExceeded: false,
    searchUnfeasible: false,
  });
  if (recovery && recovery.to !== sim.state) {
    emit(sim.state, recovery.to, recovery.cause, goal);
    sim.state = recovery.to;
    sim.route = null;
    routeForState(sim, input, perception, false, emit);
  } else {
    sim.route = null;
  }
}

function routePursue(sim: GuardSimulation, input: GuardFrameInput, emit: Emit): void {
  const goal = lastKnownCell(input.memory);
  if (!goal) {
    sim.route = null;
    return;
  }
  const goalKey = cellKey(goal);
  if (stalledForGoal(sim, goalKey)) {
    return;
  }
  const goalChanged = !sim.route || !sameCell(goal, sim.route.goalCell);
  const overdue = input.timeMs - sim.lastRouteAtMs >= REPLAN_INTERVAL_MS;
  if (!goalChanged && !overdue) {
    return;
  }
  const result = runSearch(sim, input, input.positionCell, goal);
  if (result.status === "success") {
    sim.route = { goalCell: goal, cells: result.path };
    sim.routeVersion += 1;
    sim.stalledGoalKey = null;
    emit("pursue", "pursue", "route-replanned", goal);
    return;
  }
  sim.stalledGoalKey = goalKey;
}

function routeSearch(
  sim: GuardSimulation,
  input: GuardFrameInput,
  perception: GuardPerceptionInput,
  arrivedEdge: boolean,
  emit: Emit,
): void {
  if (sim.searchWaypoints === null) {
    buildSearchPlanOnce(sim, input, perception, emit);
    if (sim.searchWaypoints === null) {
      return;
    }
  }

  const previousGoal = sim.route?.goalCell ?? null;
  if (arrivedEdge && previousGoal && sameCell(previousGoal, currentSearchWaypoint(sim))) {
    emit("search", "search", "search-waypoint", previousGoal);
    sim.planIndex += 1;
    sim.route = null;
  }

  if (sim.planIndex >= sim.searchWaypoints.length) {
    leaveSearch(sim, input, perception, emit, "searchCovered");
    return;
  }

  const target = currentSearchWaypoint(sim);
  if (sim.route && sameCell(sim.route.goalCell, target)) {
    return;
  }

  const result = runSearch(sim, input, input.positionCell, target);
  if (result.status === "success") {
    sim.route = { goalCell: target, cells: result.path };
    sim.routeVersion += 1;
    return;
  }
  leaveSearch(sim, input, perception, emit, "searchUnfeasible");
}

function buildSearchPlanOnce(
  sim: GuardSimulation,
  input: GuardFrameInput,
  perception: GuardPerceptionInput,
  emit: Emit,
): void {
  const lkp = lastKnownCell(input.memory);
  if (!lkp) {
    leaveSearch(sim, input, perception, emit, "searchUnfeasible");
    return;
  }
  const plan = buildSearchPlan(lkp, sim.map, {
    radiusCells: SEARCH_RADIUS_CELLS,
    waypointsMax: SEARCH_WAYPOINTS_MAX,
  });
  sim.searchWaypoints = plan;
  sim.planIndex = 0;
  if (plan.length === 0) {
    leaveSearch(sim, input, perception, emit, "searchUnfeasible");
    return;
  }
  sim.searchStartedAtMs = input.timeMs;
  emit("search", "search", "search-started", null);
}

function leaveSearch(
  sim: GuardSimulation,
  input: GuardFrameInput,
  perception: GuardPerceptionInput,
  emit: Emit,
  reason: "searchCovered" | "searchUnfeasible",
): void {
  const recovery = resolveTransition(sim.state, perception, {
    arrivedAtGoal: false,
    goalUnreachable: false,
    timeSinceLastVisionMs: null,
    searchCovered: reason === "searchCovered",
    searchBudgetExceeded: false,
    searchUnfeasible: reason === "searchUnfeasible",
  });
  if (recovery && recovery.to !== sim.state) {
    emit(sim.state, recovery.to, recovery.cause, null);
    sim.searchWaypoints = null;
    sim.planIndex = 0;
    sim.searchStartedAtMs = null;
    sim.stalledGoalKey = null;
    sim.state = recovery.to;
    sim.route = null;
    routeForState(sim, input, perception, false, emit);
  } else {
    sim.route = null;
  }
}

function routeReturn(sim: GuardSimulation, input: GuardFrameInput, emit: Emit): void {
  if (sim.returnCandidates === null) {
    sim.returnCandidates = orderedReturnCandidates(sim, input.positionCell);
    sim.candidateIndex = 0;
    emit("return", "return", "return-started", firstReturnCandidate(sim));
  }

  for (; ;) {
    if (sim.candidateIndex >= sim.returnCandidates.length) {
      sim.route = null;
      return;
    }
    const target = currentReturnCandidate(sim);
    if (sim.route && sameCell(sim.route.goalCell, target)) {
      return;
    }
    const targetKey = cellKey(target);
    if (stalledForGoal(sim, targetKey)) {
      sim.route = null;
      return;
    }
    const result = runSearch(sim, input, input.positionCell, target);
    if (result.status === "success") {
      sim.route = { goalCell: target, cells: result.path };
      sim.routeVersion += 1;
      sim.stalledGoalKey = null;
      return;
    }
    emit("return", "return", "alternate-patrol-point", target);
    sim.candidateIndex += 1;
    if (sim.candidateIndex >= sim.returnCandidates.length) {
      sim.stalledGoalKey = targetKey;
      sim.route = null;
      return;
    }
  }
}

function orderedReturnCandidates(
  sim: GuardSimulation,
  fromCell: GridPoint,
): readonly GridPoint[] {
  const ranked = sim.patrolPoints.map((point, index) => ({ point, index }));
  ranked.sort((left, right) => {
    const leftDistance = manhattanDistance(fromCell, left.point);
    const rightDistance = manhattanDistance(fromCell, right.point);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return left.index - right.index;
  });
  return ranked.map((entry) => entry.point);
}

function firstReturnCandidate(sim: GuardSimulation): GridPoint {
  if (sim.returnCandidates === null || sim.returnCandidates.length === 0) {
    throw new Error("Return candidates invariant failed: no candidate.");
  }
  const candidate = sim.returnCandidates[0];
  if (!candidate) {
    throw new Error("Return candidates invariant failed: missing first candidate.");
  }
  return candidate;
}

function currentReturnCandidate(sim: GuardSimulation): GridPoint {
  if (sim.returnCandidates === null || sim.returnCandidates.length === 0) {
    throw new Error("Return candidates invariant failed: no candidate.");
  }
  const candidate = sim.returnCandidates[sim.candidateIndex];
  if (!candidate) {
    throw new Error("Return candidates invariant failed: candidate index out of range.");
  }
  return candidate;
}

function resumePatrolAfterReturn(sim: GuardSimulation): void {
  const reached = sim.route?.goalCell ?? null;
  if (!reached) {
    return;
  }
  const reachedIndex = sim.patrolPoints.findIndex((point) => sameCell(point, reached));
  if (reachedIndex === -1) {
    return;
  }
  sim.patrolIndex = nextPatrolIndex(sim.patrolPoints.length, reachedIndex);
}

function currentSearchWaypoint(sim: GuardSimulation): GridPoint {
  if (sim.searchWaypoints === null || sim.searchWaypoints.length === 0) {
    throw new Error("Search plan invariant failed: no waypoint.");
  }
  const waypoint = sim.searchWaypoints[sim.planIndex];
  if (!waypoint) {
    throw new Error("Search plan invariant failed: plan index out of range.");
  }
  return waypoint;
}

function runSearch(
  sim: GuardSimulation,
  input: GuardFrameInput,
  startCell: GridPoint,
  goal: GridPoint,
): SearchResult {
  const result = findPathAStar(sim.map, startCell, goal);
  sim.searchResult = result;
  sim.routeComputations += 1;
  sim.lastRouteAtMs = input.timeMs;
  return result;
}

function stalledForGoal(sim: GuardSimulation, goalKey: string): boolean {
  return sim.stalledGoalKey !== null && sim.stalledGoalKey === goalKey;
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