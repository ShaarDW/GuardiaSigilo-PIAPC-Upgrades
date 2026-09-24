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
  updateGuardSimulation,
  type GuardFrameOutput,
  type GuardSimulation,
} from "../../application/simulation/guardSimulation";
import { cellCenter, isWalkable, worldToCell } from "../../domain/model/grid";
import type { Vector2 } from "../../domain/model/vector";
import { advanceAlongPath } from "../../domain/navigation/pathFollower";
import type { GuardState } from "../../domain/behavior/guardState";
import { timeSinceLastPerception } from "../../domain/perception/memory";
import type { VisionReason, VisionResult } from "../../domain/perception/perception";

const PLAYER_SPEED = 190;
const GUARD_SPEED = 115;
const VISION_RANGE = 220;
const FIELD_OF_VIEW = Math.PI / 2;
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
  private lastKnownMarker!: Phaser.GameObjects.Arc;
  private navigationHud!: Phaser.GameObjects.Text;
  private telemetryHud!: Phaser.GameObjects.Text;
  private guardFacing: Vector2 = { x: -1, y: 0 };
  private guardWaypoints: readonly Vector2[] = [];
  private nextWaypoint = 0;
  private appliedRouteVersion = 0;
  private guardArrived = false;
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
    this.telemetryVisible = false;
    this.perceptionState = initialPerceptionState();
    this.guardSession = createGuardSimulation(LAB_MAP, PATROL_POINTS, GUARD_START);
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
      }
    } else {
      this.guardArrived = false;
    }

    this.drawNavigation(outcome);
    this.drawPerception(frame.vision);
    this.updateTelemetry(time, frame.vision, frame.soundHeard, outcome);
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
  }

  private drawPerception(vision: VisionResult): void {
    this.perceptionGraphics.clear();
    const facingAngle = Math.atan2(this.guardFacing.y, this.guardFacing.x);
    const halfFieldOfView = FIELD_OF_VIEW / 2;
    this.perceptionGraphics.fillStyle(vision.visible ? 0x73c991 : 0x6b8afd, 0.16);
    this.perceptionGraphics.beginPath();
    this.perceptionGraphics.moveTo(this.guard.x, this.guard.y);
    this.perceptionGraphics.arc(
      this.guard.x,
      this.guard.y,
      VISION_RANGE,
      facingAngle - halfFieldOfView,
      facingAngle + halfFieldOfView,
    );
    this.perceptionGraphics.closePath();
    this.perceptionGraphics.fillPath();

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

    this.navigationHud.setText([
      `${GUARD_STATE_LABELS[outcome.state]} ${goal}`,
      nav,
      lastLine,
      `vision ${VISION_LABELS[vision.reason]}`,
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