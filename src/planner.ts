/**
 * PlannerSystem: the whole Handplan interaction loop.
 *
 *   inbox row  ->  pinch a card  ->  drop on Today (max 3) / Later / Drop
 *   pinch-tap a Today card  ->  focus timer  ->  Done
 *
 * Cards are free-standing entities; every frame the ones not being held ease
 * toward the slot their task currently owns. Dropping is decided by *direction*
 * from the head rather than exact position, so it works the same with a hand
 * ray, a gaze-and-pinch cursor, or a mouse.
 */

import {
  createSystem,
  DistanceGrabbable,
  Grabbed,
  Group,
  Hovered,
  MovementMode,
  Object3D,
  Pressed,
  Quaternion,
  RayInteractable,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { Card, PlanButton } from './card-component.js';
import { PlanStore, TODAY_LIMIT } from './plan-store.js';
import type { Task, Zone } from './plan-store.js';
import { play } from './sound.js';
import {
  cardSignature,
  createCardSurface,
  createSurface,
  drawButton,
  drawCard,
  drawDial,
  drawHeader,
  drawTray,
} from './visuals.js';
import type { Surface } from './visuals.js';

export const planStore = new PlanStore();

type DropTarget = Zone | 'drop' | 'none';

interface CardView {
  taskId: string;
  entity: Entity;
  surface: Surface;
  signature: string;
  scale: number;
  grabbedAt: number;
  grabStart: Vector3;
  held: boolean;
  /** Set when the task is gone and the card is animating out. */
  exit: 'drop' | 'done' | null;
  exitAge: number;
}

// Layout, in metres, in the workspace's own frame (+Z points at the user).
const INBOX_VISIBLE = 5;
const INBOX_Y = 0.27;
const INBOX_Z = -0.2;
const INBOX_STEP = 0.165;
const TRAY_TILT = -1.0;
const TRAY_W = 0.2;
const TRAY_H = 0.35;
const SLOT_TOP = 0.0838;
const SLOT_STEP = 0.0983;
const DROP_ANGLE = 0.27; // ~15 degrees of slack around a tray
const TAP_SECONDS = 0.4;
const TAP_DISTANCE = 0.025;

export class PlannerSystem extends createSystem({
  cards: { required: [Card] },
  heldCards: { required: [Card, Grabbed] },
  hoveredCards: { required: [Card, Hovered] },
  pressedButtons: { required: [PlanButton, Pressed] },
  heldHandle: { required: [PlanButton, Grabbed] },
}) {
  private store = planStore;
  private views = new Map<string, CardView>();
  private root!: Group;
  private trayToday!: Surface;
  private trayLater!: Surface;
  private trayDrop!: Surface;
  private header!: Surface;
  private dial!: Surface;
  private buttonDone!: Surface;
  private buttonMid!: Surface;
  private buttonBack!: Surface;
  private handle!: Surface;
  private handleEntity!: Entity;
  private focusParts: Object3D[] = [];

  private headerText = '';
  private laterCount = -1;
  private flashText = '';
  private flashUntil = 0;
  private clock = 0;
  private snap = true;
  private needsPlacement = true;
  private placementWait = 0;

  private focusId: string | null = null;
  private focusTotal = 0;
  private focusLeft = 0;
  private focusPaused = false;
  private focusSpent = 0;
  private dialSecond = -1;
  private midLabel = '';
  private timeUpPlayed = false;

  // Scratch objects: nothing is allocated per frame.
  private head = new Vector3();
  private forward = new Vector3();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private targetPos = new Vector3();
  private targetQuat = new Quaternion();
  private rootQuat = new Quaternion();
  private slot = new Object3D();
  private handleRest = new Vector3(0, -0.118, 0.172);

  init(): void {
    this.buildWorkspace();
    this.reconcile();

    this.cleanupFuncs.push(
      this.store.subscribe(() => this.reconcile()),
      this.world.visibilityState.subscribe((state) => {
        const flat = state === VisibilityState.NonImmersive;
        const panel = this.world.getSceneObject('welcome-panel');
        if (panel) {
          panel.visible = flat;
        }
        this.needsPlacement = true;
        this.placementWait = flat ? 0 : 0.35;
      }),
    );

    this.queries.heldCards.subscribe('qualify', (entity) => this.onGrab(entity));
    this.queries.heldCards.subscribe('disqualify', (entity) =>
      this.onRelease(entity),
    );
    this.queries.pressedButtons.subscribe('qualify', (entity) => {
      this.onButton(entity.getValue(PlanButton, 'action') ?? '');
    });

    (window as unknown as { __handplan?: unknown }).__handplan = {
      store: this.store,
      system: this,
    };
  }

  // ---------------------------------------------------------------- building

  private addPart(surface: Surface, parent: Entity): Entity {
    return this.world.createTransformEntity(surface.mesh, { parent });
  }

  private buildWorkspace(): void {
    this.root = new Group();
    const rootEntity = this.world.createTransformEntity(this.root);

    this.trayToday = createSurface(TRAY_W, TRAY_H, 400, 700);
    this.trayLater = createSurface(TRAY_W, TRAY_H, 400, 700);
    this.trayDrop = createSurface(TRAY_W, 0.14, 400, 280);
    drawTray(this.trayToday, 'today', 'TODAY  ·  3 max', TODAY_LIMIT);
    drawTray(this.trayLater, 'later', 'LATER', 0);
    drawTray(this.trayDrop, 'drop', 'DROP', 0);

    const trays: Array<[Surface, number, number, number]> = [
      [this.trayToday, 0, 0, 0],
      [this.trayLater, -0.25, 0.03, 0.25],
      [this.trayDrop, 0.25, 0.03, -0.25],
    ];
    for (const [tray, x, z, yaw] of trays) {
      tray.mesh.rotation.order = 'YXZ';
      tray.mesh.position.set(x, 0, z);
      tray.mesh.rotation.set(TRAY_TILT, yaw, 0);
      tray.material.color.setScalar(0.82);
      this.addPart(tray, rootEntity);
    }

    this.header = createSurface(0.52, 0.08, 1040, 160);
    this.header.mesh.position.set(0, 0.405, -0.22);
    this.header.mesh.rotation.x = -0.15;
    this.addPart(this.header, rootEntity);

    this.dial = createSurface(0.17, 0.17, 512, 512);
    this.dial.mesh.position.set(0.15, 0.27, -0.18);
    this.dial.mesh.rotation.x = -0.15;
    this.addPart(this.dial, rootEntity);

    const buttons: Array<[Surface, string, number]> = [];
    this.buttonDone = createSurface(0.115, 0.042, 368, 134, { renderOrder: 3 });
    this.buttonMid = createSurface(0.115, 0.042, 368, 134, { renderOrder: 3 });
    this.buttonBack = createSurface(0.115, 0.042, 368, 134, { renderOrder: 3 });
    buttons.push(
      [this.buttonDone, 'done', -0.135],
      [this.buttonMid, 'mid', 0],
      [this.buttonBack, 'back', 0.135],
    );
    drawButton(this.buttonDone, 'Done', 'primary');
    drawButton(this.buttonBack, 'Back', 'plain');
    for (const [button, action, x] of buttons) {
      button.mesh.position.set(x, 0.14, -0.11);
      button.mesh.rotation.x = -0.4;
      const entity = this.addPart(button, rootEntity);
      entity.addComponent(RayInteractable);
      entity.addComponent(PlanButton, { action });
      this.focusParts.push(button.mesh);
    }
    this.focusParts.push(this.dial.mesh);
    this.setFocusPartsVisible(false);

    // The handle is how you re-seat the whole workspace: pinch it and move.
    this.handle = createSurface(0.13, 0.03, 416, 96, { renderOrder: 3 });
    drawButton(this.handle, 'move', 'plain');
    this.handleEntity = this.world.createTransformEntity(this.handle.mesh);
    this.handleEntity.addComponent(RayInteractable);
    this.handleEntity.addComponent(PlanButton, { action: 'handle' });
    this.handleEntity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
      rotate: false,
      scale: false,
    });
  }

  private setFocusPartsVisible(visible: boolean): void {
    for (const part of this.focusParts) {
      part.visible = visible;
      part.scale.setScalar(visible ? 1 : 0.0001);
    }
  }

  private createView(task: Task): CardView {
    const surface = createCardSurface();
    const entity = this.world.createTransformEntity(surface.mesh);
    entity.addComponent(Card, { taskId: task.id });
    entity.addComponent(RayInteractable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
      rotate: false,
      scale: false,
    });
    surface.mesh.scale.setScalar(0.0001);
    return {
      taskId: task.id,
      entity,
      surface,
      signature: '',
      scale: 0.0001,
      grabbedAt: 0,
      grabStart: new Vector3(),
      held: false,
      exit: null,
      exitAge: 0,
    };
  }

  /** Bring card entities in line with the store after any change. */
  private reconcile(): void {
    const alive = new Set<string>();
    for (const task of this.store.state.tasks) {
      alive.add(task.id);
      let view = this.views.get(task.id);
      if (!view) {
        view = this.createView(task);
        this.views.set(task.id, view);
      }
      const signature = cardSignature(task, task.order);
      if (signature !== view.signature) {
        drawCard(view.surface, task, task.order);
        view.signature = signature;
      }
    }
    for (const view of this.views.values()) {
      if (!alive.has(view.taskId) && view.exit === null) {
        view.exit = 'drop';
      }
    }
    if (this.focusId && !alive.has(this.focusId)) {
      this.endFocus();
    }
  }

  // ------------------------------------------------------------- interaction

  private viewOf(entity: Entity): CardView | undefined {
    const id = entity.getValue(Card, 'taskId');
    return id ? this.views.get(id) : undefined;
  }

  private onGrab(entity: Entity): void {
    const view = this.viewOf(entity);
    if (!view || view.exit) {
      return;
    }
    view.held = true;
    view.grabbedAt = this.clock;
    if (entity.object3D) {
      view.grabStart.copy(entity.object3D.position);
    }
    play('pick');
  }

  private onRelease(entity: Entity): void {
    const view = this.viewOf(entity);
    if (!view || !view.held) {
      return;
    }
    view.held = false;
    const object = entity.object3D;
    const task = this.store.get(view.taskId);
    if (!object || !task || view.exit) {
      return;
    }

    const quick = this.clock - view.grabbedAt < TAP_SECONDS;
    const still = object.position.distanceTo(view.grabStart) < TAP_DISTANCE;
    if (quick && still) {
      if (task.zone === 'today' && !this.focusId) {
        this.startFocus(task.id);
      }
      return;
    }

    const target = this.dropTargetFor(object.position);
    if (target === 'none' || target === task.zone) {
      if (target === 'today') {
        this.store.move(task.id, 'today', this.todayIndexAt(object.position));
      }
      play('drop');
      return;
    }
    if (target === 'drop') {
      view.exit = 'drop';
      this.store.remove(task.id);
      play('drop');
      return;
    }
    // Coming from another tray a card joins the end; only cards already in
    // Today are reordered by where they land.
    if (this.store.move(task.id, target)) {
      play('drop');
    } else {
      this.flash('Today holds three. Swap one out first.');
      play('refuse');
    }
  }

  private onButton(action: string): void {
    if (!this.focusId) {
      return;
    }
    if (action === 'done') {
      const view = this.views.get(this.focusId);
      if (view) {
        view.exit = 'done';
      }
      const id = this.focusId;
      this.endFocus();
      this.store.complete(id);
      play('done');
    } else if (action === 'mid') {
      if (this.focusLeft <= 0) {
        this.focusLeft = 300;
        this.focusTotal = 300;
        this.timeUpPlayed = false;
        this.focusPaused = false;
      } else {
        this.focusPaused = !this.focusPaused;
      }
      this.dialSecond = -1;
    } else if (action === 'back') {
      this.endFocus();
    }
  }

  startFocus(id: string): void {
    this.focusId = id;
    this.focusTotal = this.store.state.focusMinutes * 60;
    this.focusLeft = this.focusTotal;
    this.focusPaused = false;
    this.focusSpent = 0;
    this.dialSecond = -1;
    this.timeUpPlayed = false;
    this.setFocusPartsVisible(true);
    play('start');
  }

  private endFocus(): void {
    if (this.focusId && this.focusSpent > 0) {
      this.store.addSpent(this.focusId, this.focusSpent);
    }
    this.focusId = null;
    this.setFocusPartsVisible(false);
    this.reconcile();
  }

  private flash(text: string): void {
    this.flashText = text;
    this.flashUntil = this.clock + 3;
  }

  // ------------------------------------------------------------------ layout

  /** Where a released card is pointing, judged from the viewer's head. */
  private dropTargetFor(position: Vector3): DropTarget {
    this.camera.getWorldPosition(this.head);
    this.tmp.copy(position).sub(this.head).normalize();
    let best: DropTarget = 'none';
    let bestAngle = DROP_ANGLE;

    const consider = (target: DropTarget, point: Vector3): void => {
      const angle = this.tmp.angleTo(point.sub(this.head).normalize());
      if (angle < bestAngle) {
        bestAngle = angle;
        best = target;
      }
    };
    consider('today', this.trayToday.mesh.getWorldPosition(this.tmp2));
    consider('later', this.trayLater.mesh.getWorldPosition(this.tmp2));
    consider('drop', this.trayDrop.mesh.getWorldPosition(this.tmp2));

    this.root.worldToLocal(this.tmp2.copy(position));
    const half = ((INBOX_VISIBLE - 1) / 2) * INBOX_STEP;
    const x = Math.max(-half, Math.min(half, this.tmp2.x));
    this.tmp2.set(x, INBOX_Y, INBOX_Z + x * x * 0.9);
    consider('inbox', this.root.localToWorld(this.tmp2));
    return best;
  }

  private todayIndexAt(position: Vector3): number {
    this.trayToday.mesh.worldToLocal(this.tmp2.copy(position));
    const index = Math.round((SLOT_TOP - this.tmp2.y) / SLOT_STEP);
    return Math.max(0, Math.min(TODAY_LIMIT - 1, index));
  }

  /** Compute the resting pose for a task's card into targetPos/targetQuat. */
  private targetFor(task: Task): number {
    const slot = this.slot;
    slot.rotation.order = 'YXZ';
    let scale = 1;

    if (this.focusId === task.id) {
      slot.position.set(-0.085, 0.27, -0.15);
      slot.rotation.set(-0.15, 0.12, 0);
      scale = 1.45;
      this.root.localToWorld(this.targetPos.copy(slot.position));
      slot.updateMatrix();
      this.targetQuat.copy(this.rootQuat).multiply(slot.quaternion);
      return scale;
    }

    if (task.zone === 'inbox') {
      const count = Math.min(
        INBOX_VISIBLE,
        this.store.state.tasks.reduce(
          (n, other) => n + (other.zone === 'inbox' ? 1 : 0),
          0,
        ),
      );
      const shown = Math.min(task.order, INBOX_VISIBLE - 1);
      const depth = Math.max(0, task.order - (INBOX_VISIBLE - 1));
      const x = (shown - (count - 1) / 2) * INBOX_STEP;
      slot.position.set(
        x + depth * 0.004,
        INBOX_Y + depth * 0.005,
        INBOX_Z + x * x * 0.9 - depth * 0.004,
      );
      slot.rotation.set(-0.2, -x * 1.3, 0);
      if (this.focusId) {
        scale = 0.0001;
      }
      this.root.localToWorld(this.targetPos.copy(slot.position));
      slot.updateMatrix();
      this.targetQuat.copy(this.rootQuat).multiply(slot.quaternion);
      return scale;
    }

    const tray = task.zone === 'today' ? this.trayToday : this.trayLater;
    const shown = Math.min(task.order, TODAY_LIMIT - 1);
    const depth = Math.max(0, task.order - (TODAY_LIMIT - 1));
    this.targetPos.set(
      depth * 0.004,
      SLOT_TOP - shown * SLOT_STEP - 0.012 + depth * 0.004,
      0.006 + depth * 0.002,
    );
    tray.mesh.localToWorld(this.targetPos);
    tray.mesh.getWorldQuaternion(this.targetQuat);
    return scale;
  }

  /** Seat the workspace in front of the viewer. */
  private place(distance: number, drop: number): void {
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 0.0001) {
      this.forward.set(0, 0, -1);
    }
    this.forward.normalize();
    this.root.position
      .copy(this.head)
      .addScaledVector(this.forward, distance);
    this.root.position.y = this.head.y - drop;
    this.root.rotation.set(0, Math.atan2(-this.forward.x, -this.forward.z), 0);
    this.root.updateMatrixWorld(true);
    this.snap = true;
  }

  private updateHeader(): void {
    const tasks = this.store.state.tasks;
    let inbox = 0;
    let today = 0;
    for (const task of tasks) {
      if (task.zone === 'inbox') {
        inbox += 1;
      } else if (task.zone === 'today') {
        today += 1;
      }
    }
    const done = this.store.state.doneToday;
    let title: string;
    let sub: string;
    if (this.clock < this.flashUntil) {
      title = this.flashText;
      sub = 'Drag a Today card to Later to make room.';
    } else if (this.focusId) {
      title = 'One thing.';
      sub = 'Pinch Done when it is finished.';
    } else if (inbox > 0 && today < TODAY_LIMIT) {
      title = `Morning triage  ·  ${inbox} to sort`;
      sub = 'Pinch a card. Drop it on Today, Later or Drop.';
    } else if (inbox > 0) {
      title = `Today is set  ·  ${inbox} left to park`;
      sub = 'Later or Drop for the rest.';
    } else if (today > 0) {
      title = `Plan set  ·  ${done} done, ${today} to go`;
      sub = 'Pinch a Today card to start a focus timer.';
    } else {
      title = `All clear  ·  ${done} done today`;
      sub = 'Add tasks from the browser page, then come back.';
    }
    const later = tasks.length - inbox - today;
    if (later !== this.laterCount) {
      this.laterCount = later;
      drawTray(this.trayLater, 'later', later > 0 ? `LATER  ·  ${later}` : 'LATER', 0);
    }
    const text = `${title}\n${sub}`;
    if (text !== this.headerText) {
      this.headerText = text;
      drawHeader(this.header, title, sub);
    }
  }

  // ------------------------------------------------------------------ update

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    this.clock += dt;

    if (this.needsPlacement) {
      this.placementWait -= dt;
      if (this.placementWait <= 0) {
        const flat =
          this.world.visibilityState.peek() === VisibilityState.NonImmersive;
        if (flat) {
          this.place(0.66, 0.3);
        } else {
          this.place(0.52, 0.34);
        }
        this.needsPlacement = false;
      }
    }

    // Workspace follows its handle while the handle is pinched.
    const handleObject = this.handleEntity.object3D;
    if (handleObject) {
      if (this.queries.heldHandle.entities.size > 0) {
        this.root.getWorldQuaternion(this.rootQuat);
        this.tmp.copy(this.handleRest).applyQuaternion(this.rootQuat);
        this.root.position.copy(handleObject.position).sub(this.tmp);
        this.camera.getWorldPosition(this.head);
        this.root.rotation.set(
          0,
          Math.atan2(
            this.head.x - this.root.position.x,
            this.head.z - this.root.position.z,
          ),
          0,
        );
        this.root.updateMatrixWorld(true);
      } else {
        this.root.updateMatrixWorld(true);
        this.root.getWorldQuaternion(this.rootQuat);
        this.root.localToWorld(this.tmp.copy(this.handleRest));
        handleObject.position.copy(this.tmp);
        this.slot.rotation.order = 'YXZ';
        this.slot.rotation.set(TRAY_TILT, 0, 0);
        handleObject.quaternion.copy(this.rootQuat).multiply(this.slot.quaternion);
      }
    }
    this.root.getWorldQuaternion(this.rootQuat);

    // Focus timer.
    if (this.focusId) {
      if (!this.focusPaused && this.focusLeft > 0) {
        this.focusLeft = Math.max(0, this.focusLeft - dt);
        this.focusSpent += dt;
      }
      if (this.focusLeft <= 0 && !this.timeUpPlayed) {
        this.timeUpPlayed = true;
        play('timeup');
      }
      const second = Math.ceil(this.focusLeft) + (this.focusPaused ? 100000 : 0);
      if (second !== this.dialSecond) {
        this.dialSecond = second;
        drawDial(this.dial, Math.ceil(this.focusLeft), this.focusTotal, this.focusPaused);
        const label =
          this.focusLeft <= 0 ? '+5 min' : this.focusPaused ? 'Resume' : 'Pause';
        if (label !== this.midLabel) {
          this.midLabel = label;
          drawButton(this.buttonMid, label, 'plain');
        }
      }
    }

    // Light up the tray a held card is pointing at.
    let pointed: DropTarget = 'none';
    for (const entity of this.queries.heldCards.entities) {
      if (entity.object3D) {
        pointed = this.dropTargetFor(entity.object3D.position);
      }
    }
    this.trayToday.material.color.setScalar(pointed === 'today' ? 1.25 : 0.82);
    this.trayLater.material.color.setScalar(pointed === 'later' ? 1.25 : 0.82);
    this.trayDrop.material.color.setScalar(pointed === 'drop' ? 1.25 : 0.82);

    // Ease every resting card toward its slot.
    const ease = this.snap ? 1 : 1 - Math.exp(-12 * dt);
    for (const view of this.views.values()) {
      const object = view.entity.object3D;
      if (!object) {
        continue;
      }
      if (view.exit) {
        view.exitAge += dt;
        const goal =
          view.exit === 'drop'
            ? this.trayDrop.mesh.getWorldPosition(this.tmp)
            : this.tmp.copy(object.position).setY(object.position.y + 0.02);
        object.position.lerp(goal, 1 - Math.exp(-10 * dt));
        view.scale += (0.0001 - view.scale) * (1 - Math.exp(-9 * dt));
        object.scale.setScalar(view.scale);
        if (view.exitAge > 0.45) {
          view.surface.texture.dispose();
          view.surface.material.dispose();
          view.surface.mesh.geometry.dispose();
          view.entity.dispose();
          this.views.delete(view.taskId);
        }
        continue;
      }
      if (view.held) {
        continue;
      }
      const task = this.store.get(view.taskId);
      if (!task) {
        continue;
      }
      let scale = this.targetFor(task);
      if (scale > 0.5 && view.entity.hasComponent(Hovered)) {
        scale *= 1.06;
      }
      object.position.lerp(this.targetPos, ease);
      object.quaternion.slerp(this.targetQuat, ease);
      view.scale += (scale - view.scale) * ease;
      object.scale.setScalar(view.scale);
    }
    this.snap = false;

    this.updateHeader();
  }
}
