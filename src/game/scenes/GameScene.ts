import Phaser from "phaser";
import {
  GUARD_START,
  GRID_HEIGHT,
  GRID_WIDTH,
  LAB_MAP,
  PATROL_POINTS,
  PLAYER_START,
  TILE_SIZE,
} from "../../application/simulation/labLevel";
import {
  initialPerceptionState,
  updatePerceptionSimulation,
  withSoundEvent,
  type PerceptionSimulationState,
} from "../../application/simulation/perceptionSimulation";
import {
  createGuardSimulation,
  PATROL_PAUSE_MS,
  updateGuardSimulation,
  type GuardFrameOutput,
  type GuardSimulation,
} from "../../application/simulation/guardSimulation";
import { cellCenter, isWalkable, worldToCell } from "../../domain/model/grid";
import type { Vector2 } from "../../domain/model/vector";
import { advanceAlongPath } from "../../domain/navigation/pathFollower";
import { VISION_LOST_GRACE_MS, type GuardState } from "../../domain/behavior/guardState";
import { timeSinceLastPerception } from "../../domain/perception/memory";
import type { VisionReason, VisionResult } from "../../domain/perception/perception";
import {
  resolveVisionFeedback,
  visionSector,
  type VisionFeedbackState,
} from "../visual/visionFeedback";
import {
  effectProgress,
  emptyGuardEffectState,
  guardFacingAngle,
  guardStatePresentation,
  GUARD_SEARCH_SCAN_PERIOD_MS,
  motionVisual,
  pulsePhase,
  updateGuardEffect,
  type GuardEffectState,
} from "../visual/guardPresentation";
import {
  coverFlash,
  resolveCover,
  type CoverState,
} from "../visual/coverState";

const PLAYER_SPEED = 190;
const GUARD_SPEED = 115;
const VISION_RANGE = 220;
const FIELD_OF_VIEW = Math.PI / 2;
const PATROL_GAZE_SWEEP_RADIANS = Math.PI * 2;
const SOUND_RADIUS = 190;
const SOUND_DURATION_MS = 800;
const GUARD_STATE_LABELS: Readonly<Record<GuardState, string>> = {
  patrol: "PATRULLANDO",
  investigate: "INVESTIGANDO",
  pursue: "PERSIGUIENDO",
  search: "BUSCANDO",
  return: "REGRESANDO",
};
const VISION_LABELS: Readonly<Record<VisionReason, string>> = {
  visible: "VISIBLE",
  "out-of-range": "FUERA DE RANGO",
  "outside-cone": "FUERA DEL CONO",
  occluded: "OCLUIDO",
  "invalid-facing": "DIRECCION INVALIDA",
};

const VISION_FEEDBACK_STYLES: Readonly<Record<
  VisionFeedbackState,
  { readonly fill: number; readonly stroke: number; readonly alpha: number }
>> = {
  normal: { fill: 0x6b8afd, stroke: 0x9eb4c2, alpha: 0.16 },
  grace: { fill: 0xe5b454, stroke: 0xffd98a, alpha: 0.16 },
  detection: { fill: 0x73c991, stroke: 0xd7f5e0, alpha: 0.22 },
};
const COVER_LABELS: Readonly<Record<CoverState, string>> = {
  visible: "VISIBLE",
  cubierto: "CUBIERTO",
  expuesto: "EXPUESTO",
};
const COVER_FRAME_COLOR = 0xb9a7ff;

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private guard!: Phaser.GameObjects.Arc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveUp!: Phaser.Input.Keyboard.Key;
  private moveDown!: Phaser.Input.Keyboard.Key;
  private moveLeft!: Phaser.Input.Keyboard.Key;
  private moveRight!: Phaser.Input.Keyboard.Key;
  private reset!: Phaser.Input.Keyboard.Key;
  private emitSound!: Phaser.Input.Keyboard.Key;
  private telemetryKey!: Phaser.Input.Keyboard.Key;
  private navigationGraphics!: Phaser.GameObjects.Graphics;
  private perceptionGraphics!: Phaser.GameObjects.Graphics;
  private guardFxGraphics!: Phaser.GameObjects.Graphics;
  private lastKnownMarker!: Phaser.GameObjects.Arc;
  private navigationHud!: Phaser.GameObjects.Text;
  private telemetryHud!: Phaser.GameObjects.Text;
  private guardFacing: Vector2 = { x: -1, y: 0 };
  private guardWaypoints: readonly Vector2[] = [];
  private nextWaypoint = 0;
  private appliedRouteVersion = 0;
  private guardArrived = false;
  private patrolPauseStartedAtMs: number | null = null;
  private patrolPauseBaseAngle = 0;
  private guardEffectState: GuardEffectState = emptyGuardEffectState();
  private guardCover: CoverState = "expuesto";
  private coverStartMs: number | null = null;
  private telemetryVisible = false;
  private perceptionState: PerceptionSimulationState = initialPerceptionState();
  private guardSession!: GuardSimulation;

  public constructor() {
    super("GameScene");
  }

  public create(): void {
    this.guardFacing = { x: -1, y: 0 };
    this.guardWaypoints = [];
    this.nextWaypoint = 0;
    this.appliedRouteVersion = 0;
    this.guardArrived = false;
    this.patrolPauseStartedAtMs = null;
    this.patrolPauseBaseAngle = 0;
    this.guardEffectState = emptyGuardEffectState();
    this.guardCover = "expuesto";
    this.coverStartMs = null;
    this.telemetryVisible = false;
    this.perceptionState = initialPerceptionState();
    this.guardSession = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START, {
      patrolPauseMs: PATROL_PAUSE_MS,
    });
    this.cameras.main.setBackgroundColor("#10161c");
    this.drawGrid();

    const walls = this.physics.add.staticGroup();
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        if (!isWalkable(LAB_MAP, { x, y })) {
          const center = cellCenter({ x, y }, TILE_SIZE);
          const wall = this.add.rectangle(center.x, center.y, TILE_SIZE, TILE_SIZE, 0x27333d);
          wall.setStrokeStyle(1, 0x3a4c58);
          walls.add(wall);
        }
      }
    }

    const spawn = cellCenter(PLAYER_START, TILE_SIZE);
    this.player = this.add.rectangle(spawn.x, spawn.y, 20, 20, 0xe5b454);
    this.player.setStrokeStyle(2, 0xffd98a);
    this.player.setDepth(4);
    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, walls);

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error("Keyboard input is unavailable.");
    }

    this.cursors = keyboard.createCursorKeys();
    this.moveUp = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.moveDown = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.moveLeft = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.moveRight = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.reset = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.emitSound = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.telemetryKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);

    this.perceptionGraphics = this.add.graphics().setDepth(1);
    this.navigationGraphics = this.add.graphics().setDepth(2);
    const guardPosition = cellCenter(GUARD_START, TILE_SIZE);
    this.guard = this.add
      .circle(guardPosition.x, guardPosition.y, 11, 0x6b8afd)
      .setStrokeStyle(2, 0xb9c5ff)
      .setDepth(4);
    this.guardFxGraphics = this.add.graphics().setDepth(4);
    this.lastKnownMarker = this.add
      .circle(0, 0, 7, 0x000000, 0)
      .setStrokeStyle(2, 0xe16969)
      .setDepth(5)
      .setVisible(false);

    this.add
      .text(16, 14, "H4 / MAQUINA DE ESTADOS", {
        color: "#9eb4c2",
        fontFamily: "monospace",
        fontSize: "14px",
      })
      .setDepth(10);

    this.navigationHud = this.add
      .text(GRID_WIDTH * TILE_SIZE - 16, 14, "", {
        align: "right",
        backgroundColor: "#10161ccc",
        color: "#d9e4ea",
        fontFamily: "monospace",
        fontSize: "13px",
        padding: { x: 8, y: 6 },
      })
      .setOrigin(1, 0)
      .setDepth(10);

    this.telemetryHud = this.add
      .text(16, GRID_HEIGHT * TILE_SIZE - 14, "", {
        align: "left",
        backgroundColor: "#10161ccc",
        color: "#e5b454",
        fontFamily: "monospace",
        fontSize: "12px",
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0, 1)
      .setDepth(10);

    this.stepGuard(0, 0);
  }

  public update(time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.reset)) {
      this.scene.restart();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.emitSound)) {
      this.perceptionState = withSoundEvent(this.perceptionState, {
        position: { x: this.player.x, y: this.player.y },
        radius: SOUND_RADIUS,
        emittedAtMs: time,
        durationMs: SOUND_DURATION_MS,
      });
    }

    if (Phaser.Input.Keyboard.JustDown(this.telemetryKey)) {
      this.telemetryVisible = !this.telemetryVisible;
    }

    const horizontal = Number(this.cursors.right.isDown || this.moveRight.isDown)
      - Number(this.cursors.left.isDown || this.moveLeft.isDown);
    const vertical = Number(this.cursors.down.isDown || this.moveDown.isDown)
      - Number(this.cursors.up.isDown || this.moveUp.isDown);
    const velocity = new Phaser.Math.Vector2(horizontal, vertical);

    if (velocity.lengthSq() > 0) {
      velocity.normalize().scale(PLAYER_SPEED);
    }

    this.playerBody.setVelocity(velocity.x, velocity.y);
    this.stepGuard(time, delta);
  }

  private stepGuard(time: number, delta: number): void {
    this.applyPatrolGazeSweep(time);
    const observer = { x: this.guard.x, y: this.guard.y };
    const target = { x: this.player.x, y: this.player.y };
    const frame = updatePerceptionSimulation(this.perceptionState, {
      map: LAB_MAP,
      tileSize: TILE_SIZE,
      observer,
      facing: this.guardFacing,
      target,
      visionRange: VISION_RANGE,
      fieldOfViewRadians: FIELD_OF_VIEW,
      timeMs: time,
    });
    this.perceptionState = frame.state;

    const cover = resolveCover(frame.vision.visible, frame.vision.reason);
    this.guardCover = cover;
    if (cover === "cubierto") {
      if (this.coverStartMs === null) {
        this.coverStartMs = time;
      }
    } else {
      this.coverStartMs = null;
    }
    const coverFlashIntensity = coverFlash(cover, this.coverStartMs ?? time, time);

    const outcome = updateGuardSimulation(this.guardSession, {
      timeMs: time,
      positionCell: worldToCell(observer, TILE_SIZE),
      arrived: this.guardArrived,
      visionVisible: frame.vision.visible,
      soundHeard: frame.soundHeard,
      memory: frame.state.memory,
    });

    if (outcome.routeVersion !== this.appliedRouteVersion) {
      this.guardWaypoints = outcome.routeCells
        ? outcome.routeCells.map((cell) => cellCenter(cell, TILE_SIZE))
        : [];
      this.nextWaypoint = 0;
      this.appliedRouteVersion = outcome.routeVersion;
    }

    let moved = false;
    if (this.guardWaypoints.length > 0) {
      const movement = advanceAlongPath(
        { x: this.guard.x, y: this.guard.y },
        this.guardWaypoints,
        this.nextWaypoint,
        GUARD_SPEED * delta / 1000,
      );
      this.nextWaypoint = movement.nextWaypoint;
      this.guard.setPosition(movement.position.x, movement.position.y);
      this.guardArrived = movement.completed;
      if (movement.direction) {
        this.guardFacing = movement.direction;
        moved = true;
      }
    } else {
      this.guardArrived = false;
    }

    this.trackPatrolPause(outcome, time);

    this.updateGuardPresentation(time, outcome, moved, coverFlashIntensity);
    this.drawNavigation(outcome);
    this.drawPerception(this.resolveVisionFeedbackState(frame.vision.visible, time));
    this.updateTelemetry(time, frame.vision, frame.soundHeard, outcome, this.guardCover);
  }

  private applyPatrolGazeSweep(time: number): void {
    const startedAt = this.patrolPauseStartedAtMs;
    if (startedAt === null) {
      return;
    }
    const elapsed = Math.min(Math.max(time - startedAt, 0), PATROL_PAUSE_MS);
    const progress = elapsed / PATROL_PAUSE_MS;
    const angle = this.patrolPauseBaseAngle + progress * PATROL_GAZE_SWEEP_RADIANS;
    this.guardFacing = { x: Math.cos(angle), y: Math.sin(angle) };
  }

  private trackPatrolPause(outcome: GuardFrameOutput, time: number): void {
    if (!outcome.patrolPaused) {
      this.patrolPauseStartedAtMs = null;
      return;
    }
    if (this.patrolPauseStartedAtMs !== null) {
      return;
    }
    this.patrolPauseStartedAtMs = time;
    const gaze = outcome.patrolGazeCell;
    if (gaze) {
      const target = cellCenter(gaze, TILE_SIZE);
      this.patrolPauseBaseAngle = Math.atan2(target.y - this.guard.y, target.x - this.guard.x);
    } else {
      this.patrolPauseBaseAngle = 0;
    }
  }

  private updateGuardPresentation(
    time: number,
    outcome: GuardFrameOutput,
    moving: boolean,
    coverFlashIntensity: number,
  ): void {
    const presentation = guardStatePresentation(outcome.state);
    this.guardEffectState = updateGuardEffect(this.guardEffectState, outcome.events, time);
    const motion = motionVisual(moving, outcome.state);
    const facingAngle = guardFacingAngle(this.guardFacing);
    const forwardX = Math.cos(facingAngle);
    const forwardY = Math.sin(facingAngle);
    const pulsePeriod = presentation.pulsePeriodMs;

    const breath = 1 + 0.03 * Math.sin(2 * Math.PI * pulsePhase(time, pulsePeriod));
    let pop = 1;

    this.guardFxGraphics.setPosition(this.guard.x, this.guard.y);
    this.guardFxGraphics.clear();

    const effect = this.guardEffectState.effect;
    if (effect && this.guardEffectState.startedAtMs !== null) {
      const progress = effectProgress(time, this.guardEffectState.startedAtMs, effect.durationMs);
      pop = 1 + 0.12 * (1 - progress);
      this.guardFxGraphics.lineStyle(2, presentation.accent, 0.75 * (1 - progress));
      this.guardFxGraphics.strokeCircle(0, 0, 14 + 16 * progress);
    }

    this.guard.setScale(breath * pop);

    const ringAlpha = 0.35 + 0.3 * Math.sin(2 * Math.PI * pulsePhase(time, pulsePeriod));
    this.guardFxGraphics.lineStyle(presentation.ringWidth, presentation.accent, ringAlpha);
    this.guardFxGraphics.strokeCircle(0, 0, 15);

    if (presentation.scanRadius) {
      const scan = pulsePhase(time, GUARD_SEARCH_SCAN_PERIOD_MS);
      this.guardFxGraphics.lineStyle(1.5, 0x73c991, 0.6 * (1 - scan * 0.6));
      this.guardFxGraphics.strokeCircle(0, 0, 6 + 22 * scan);
    }

    const perpendicularX = -forwardY;
    const perpendicularY = forwardX;
    const half = 3.2;
    this.guardFxGraphics.fillStyle(0xd9e4ea, 0.85);
    this.guardFxGraphics.fillTriangle(
      forwardX * 14.5,
      forwardY * 14.5,
      forwardX * 3 + perpendicularX * half,
      forwardY * 3 + perpendicularY * half,
      forwardX * 3 - perpendicularX * half,
      forwardY * 3 - perpendicularY * half,
    );

    if (motion.streak) {
      const length = 8 + 5 * motion.streakGain;
      const tailStart = 13;
      const tailEnd = tailStart + length;
      this.guardFxGraphics.lineStyle(1.5 + motion.streakGain, presentation.accent, 0.65);
      this.guardFxGraphics.lineBetween(
        -forwardX * tailStart,
        -forwardY * tailStart,
        -forwardX * tailEnd,
        -forwardY * tailEnd,
      );
    }

    if (coverFlashIntensity > 0) {
      const half = 18;
      const corner = 7;
      this.guardFxGraphics.lineStyle(2, COVER_FRAME_COLOR, coverFlashIntensity);
      this.guardFxGraphics.beginPath();
      this.guardFxGraphics.moveTo(-half, -half + corner);
      this.guardFxGraphics.lineTo(-half, -half);
      this.guardFxGraphics.lineTo(-half + corner, -half);
      this.guardFxGraphics.moveTo(half - corner, -half);
      this.guardFxGraphics.lineTo(half, -half);
      this.guardFxGraphics.lineTo(half, -half + corner);
      this.guardFxGraphics.moveTo(half, half - corner);
      this.guardFxGraphics.lineTo(half, half);
      this.guardFxGraphics.lineTo(half - corner, half);
      this.guardFxGraphics.moveTo(-half + corner, half);
      this.guardFxGraphics.lineTo(-half, half);
      this.guardFxGraphics.lineTo(-half, half - corner);
      this.guardFxGraphics.strokePath();
    }
  }

  private drawGrid(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x1b252d, 1);

    for (let x = 0; x <= GRID_WIDTH; x += 1) {
      graphics.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
    }
    for (let y = 0; y <= GRID_HEIGHT; y += 1) {
      graphics.lineBetween(0, y * TILE_SIZE, GRID_WIDTH * TILE_SIZE, y * TILE_SIZE);
    }
  }

  private drawNavigation(outcome: GuardFrameOutput): void {
    const graphics = this.navigationGraphics;
    graphics.clear();

    const result = outcome.searchResult;
    if (result) {
      graphics.fillStyle(0x3b819c, 0.22);
      for (const point of result.explored) {
        graphics.fillRect(
          point.x * TILE_SIZE + 3,
          point.y * TILE_SIZE + 3,
          TILE_SIZE - 6,
          TILE_SIZE - 6,
        );
      }

      const path = outcome.routeCells ?? result.path;
      const firstPoint = path[0];
      if (firstPoint) {
        const firstCenter = cellCenter(firstPoint, TILE_SIZE);
        graphics.lineStyle(4, 0x62d0e8, 0.9);
        graphics.beginPath();
        graphics.moveTo(firstCenter.x, firstCenter.y);
        for (const point of path.slice(1)) {
          const center = cellCenter(point, TILE_SIZE);
          graphics.lineTo(center.x, center.y);
        }
        graphics.strokePath();
      }
    }

    for (const point of PATROL_POINTS) {
      const center = cellCenter(point, TILE_SIZE);
      graphics.fillStyle(0x9eb4c2, 0.5);
      graphics.fillCircle(center.x, center.y, 4);
      graphics.lineStyle(1, 0x9eb4c2, 0.9);
      graphics.strokeCircle(center.x, center.y, 4);
    }

    if (outcome.goalCell) {
      const center = cellCenter(outcome.goalCell, TILE_SIZE);
      graphics.lineStyle(2, 0xe5b454, 0.9);
      graphics.strokeCircle(center.x, center.y, 7);
    }

    if (outcome.searchWaypoints) {
      outcome.searchWaypoints.forEach((waypoint, index) => {
        const center = cellCenter(waypoint, TILE_SIZE);
        if (index === outcome.planIndex) {
          graphics.fillStyle(0x73c991, 0.85);
          graphics.fillRect(center.x - 5, center.y - 5, 10, 10);
        } else if (index < outcome.planIndex) {
          graphics.fillStyle(0x9eb4c2, 0.4);
          graphics.fillRect(center.x - 5, center.y - 5, 10, 10);
        } else {
          graphics.lineStyle(1, 0x73c991, 0.9);
          graphics.strokeRect(center.x - 5, center.y - 5, 10, 10);
        }
      });
    }

    if (outcome.returnCandidates) {
      outcome.returnCandidates.forEach((candidate, index) => {
        const center = cellCenter(candidate, TILE_SIZE);
        if (index === outcome.candidateIndex) {
          graphics.fillStyle(0xe5a439, 0.85);
          graphics.fillCircle(center.x, center.y, 5);
        } else {
          graphics.lineStyle(1, 0xe5a439, 0.9);
          graphics.strokeCircle(center.x, center.y, 5);
        }
      });
    }
  }

  private resolveVisionFeedbackState(visible: boolean, time: number): VisionFeedbackState {
    const memory = this.perceptionState.memory;
    const lastVisionAgeMs = memory.source === "vision"
      ? timeSinceLastPerception(memory, time)
      : null;
    return resolveVisionFeedback({
      visible,
      lastVisionAgeMs,
      graceMs: VISION_LOST_GRACE_MS,
    });
  }

  private drawPerception(feedback: VisionFeedbackState): void {
    this.perceptionGraphics.clear();
    const sector = visionSector(this.guardFacing, FIELD_OF_VIEW);
    const style = VISION_FEEDBACK_STYLES[feedback];
    this.perceptionGraphics.fillStyle(style.fill, style.alpha);
    this.perceptionGraphics.beginPath();
    this.perceptionGraphics.moveTo(this.guard.x, this.guard.y);
    this.perceptionGraphics.arc(
      this.guard.x,
      this.guard.y,
      VISION_RANGE,
      sector.startAngle,
      sector.endAngle,
    );
    this.perceptionGraphics.closePath();
    this.perceptionGraphics.fillPath();

    this.perceptionGraphics.lineStyle(feedback === "detection" ? 2 : 1, style.stroke, 0.7);
    this.perceptionGraphics.beginPath();
    this.perceptionGraphics.arc(
      this.guard.x,
      this.guard.y,
      VISION_RANGE,
      sector.startAngle,
      sector.endAngle,
    );
    this.perceptionGraphics.strokePath();
    this.perceptionGraphics.beginPath();
    this.perceptionGraphics.moveTo(this.guard.x, this.guard.y);
    this.perceptionGraphics.lineTo(
      this.guard.x + Math.cos(sector.startAngle) * VISION_RANGE,
      this.guard.y + Math.sin(sector.startAngle) * VISION_RANGE,
    );
    this.perceptionGraphics.moveTo(this.guard.x, this.guard.y);
    this.perceptionGraphics.lineTo(
      this.guard.x + Math.cos(sector.endAngle) * VISION_RANGE,
      this.guard.y + Math.sin(sector.endAngle) * VISION_RANGE,
    );
    this.perceptionGraphics.strokePath();

    if (this.perceptionState.soundEvent) {
      this.perceptionGraphics.lineStyle(2, 0xe5b454, 0.8);
      this.perceptionGraphics.strokeCircle(
        this.perceptionState.soundEvent.position.x,
        this.perceptionState.soundEvent.position.y,
        this.perceptionState.soundEvent.radius,
      );
    }

    const lastKnown = this.perceptionState.memory.lastKnownPosition;
    this.lastKnownMarker.setVisible(lastKnown !== null);
    if (lastKnown) {
      this.lastKnownMarker.setPosition(lastKnown.x, lastKnown.y);
    }
  }

  private updateTelemetry(
    time: number,
    vision: VisionResult,
    soundHeard: boolean,
    outcome: GuardFrameOutput,
    cover: CoverState,
  ): void {
    const age = timeSinceLastPerception(this.perceptionState.memory, time);
    const memory = age === null
      ? "memoria -"
      : `memoria ${this.perceptionState.memory.source} ${(age / 1000).toFixed(1)}s`;
    const sound = this.perceptionState.soundEvent
      ? (soundHeard ? "OIDO" : "FUERA DE RANGO")
      : "-";
    const result = outcome.searchResult;
    const nav = result
      ? `A* ${result.status} | costo ${result.totalCost ?? "-"} | expandidos ${result.expandedNodes}`
      : "A* -";
    const goal = outcome.goalCell
      ? `@(${outcome.goalCell.x},${outcome.goalCell.y})`
      : "@-";
    const lastEvent = outcome.events.length > 0
      ? outcome.events[outcome.events.length - 1]
      : null;
    const lastLine = lastEvent
      ? `ultimo ${lastEvent.cause}${lastEvent.target ? ` @(${lastEvent.target.x},${lastEvent.target.y})` : ""}`
      : "ultimo -";
    const searchLine = outcome.searchWaypoints
      ? `plan ${Math.min(outcome.planIndex, outcome.searchWaypoints.length)}/${outcome.searchWaypoints.length} waypoints`
      : "plan -";
    const returnLine = outcome.returnCandidates
      ? `retorno incidencia ${Math.min(outcome.candidateIndex + 1, outcome.returnCandidates.length)}/${outcome.returnCandidates.length}`
      : "retorno -";

    this.navigationHud.setText([
      `${GUARD_STATE_LABELS[outcome.state]} ${goal}`,
      `rutas calculadas ${outcome.routeComputations}`,
      searchLine,
      returnLine,
      nav,
      lastLine,
      `vision ${VISION_LABELS[vision.reason]}`,
      `cobertura ${COVER_LABELS[cover]}`,
      `sonido ${sound}`,
      memory,
    ]);

    this.renderTelemetryOverlay();
  }

  private renderTelemetryOverlay(): void {
    if (!this.telemetryVisible) {
      this.telemetryHud.setText("");
      return;
    }
    const lines = this.guardSession.log.events.map((event) => {
      const target = event.target ? ` @(${event.target.x},${event.target.y})` : "";
      return `t${event.timeMs.toFixed(0)} ${event.from}->${event.to} ${event.cause}${target}`;
    });
    this.telemetryHud.setText(lines.length > 0 ? lines : ["(sin eventos)"]);
  }
}