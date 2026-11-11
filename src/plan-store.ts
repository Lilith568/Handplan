/**
 * Plan state for Handplan. Plain data, no rendering.
 *
 * The rule the whole app is built around: "today" holds at most three cards.
 * Everything else is either waiting in the inbox, parked in "later", or dropped.
 */

export type Zone = 'inbox' | 'today' | 'later';

export interface Task {
  id: string;
  title: string;
  zone: Zone;
  /** Position inside its zone (0 = first). */
  order: number;
  /** How many mornings this card has come back unfinished. */
  carried: number;
  /** Focus minutes already spent on it. */
  spentSec: number;
}

export interface PlanState {
  day: string;
  tasks: Task[];
  doneToday: number;
  focusMinutes: number;
}

export const TODAY_LIMIT = 3;
const STORAGE_KEY = 'handplan.v1';

const SEED_TITLES = [
  'Reply to the landlord',
  'Finish the report draft',
  'Book the dentist',
  'Review pull request',
  'Call mum back',
  'Plan the week',
  'Pay the invoice',
];

export function dayKey(date = new Date()): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `t${Date.now().toString(36)}${idCounter.toString(36)}`;
}

function seed(): PlanState {
  return {
    day: dayKey(),
    doneToday: 0,
    focusMinutes: 25,
    tasks: SEED_TITLES.map((title, order) => ({
      id: newId(),
      title,
      zone: 'inbox' as Zone,
      order,
      carried: 0,
      spentSec: 0,
    })),
  };
}

export class PlanStore {
  state: PlanState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = this.load();
    this.rollOver();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.save();
    this.listeners.forEach((listener) => listener());
  }

  private load(): PlanState {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PlanState;
        if (parsed && Array.isArray(parsed.tasks)) {
          return parsed;
        }
      }
    } catch {
      // Storage can be unavailable or empty; fall through to a fresh plan.
    }
    return seed();
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Not fatal: the plan simply lives for this session only.
    }
  }

  /**
   * A new morning: whatever was planned or parked yesterday comes back to the
   * inbox so it gets decided again, marked as carried over.
   */
  private rollOver(): void {
    const today = dayKey();
    if (this.state.day === today) {
      return;
    }
    let order = this.inZone('inbox').length;
    for (const task of this.state.tasks) {
      if (task.zone !== 'inbox') {
        task.zone = 'inbox';
        task.order = order;
        task.carried += 1;
        order += 1;
      }
    }
    this.state.day = today;
    this.state.doneToday = 0;
    this.save();
  }

  inZone(zone: Zone): Task[] {
    return this.state.tasks
      .filter((task) => task.zone === zone)
      .sort((a, b) => a.order - b.order);
  }

  get(id: string): Task | undefined {
    return this.state.tasks.find((task) => task.id === id);
  }

  private renumber(zone: Zone): void {
    this.inZone(zone).forEach((task, index) => {
      task.order = index;
    });
  }

  add(title: string): Task | undefined {
    const clean = title.trim().slice(0, 60);
    if (!clean) {
      return undefined;
    }
    const task: Task = {
      id: newId(),
      title: clean,
      zone: 'inbox',
      order: this.inZone('inbox').length,
      carried: 0,
      spentSec: 0,
    };
    this.state.tasks.push(task);
    this.emit();
    return task;
  }

  /**
   * Move a card. Returns false when "today" is already full, which is the one
   * move the app refuses.
   */
  move(id: string, zone: Zone, index?: number): boolean {
    const task = this.get(id);
    if (!task) {
      return false;
    }
    const target = this.inZone(zone).filter((other) => other.id !== id);
    if (zone === 'today' && target.length >= TODAY_LIMIT) {
      return false;
    }
    const from = task.zone;
    const at = Math.max(0, Math.min(index ?? target.length, target.length));
    target.splice(at, 0, task);
    task.zone = zone;
    target.forEach((other, order) => {
      other.order = order;
    });
    if (from !== zone) {
      this.renumber(from);
    }
    this.emit();
    return true;
  }

  remove(id: string): void {
    const task = this.get(id);
    if (!task) {
      return;
    }
    this.state.tasks = this.state.tasks.filter((other) => other.id !== id);
    this.renumber(task.zone);
    this.emit();
  }

  complete(id: string): void {
    if (!this.get(id)) {
      return;
    }
    this.state.doneToday += 1;
    this.remove(id);
  }

  addSpent(id: string, seconds: number): void {
    const task = this.get(id);
    if (task) {
      task.spentSec += seconds;
      this.save();
    }
  }

  reset(): void {
    this.state = seed();
    this.emit();
  }
}
