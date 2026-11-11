/**
 * Canvas-drawn surfaces for Handplan: cards, trays, header, focus dial, buttons.
 * Everything is drawn to a 2D canvas and shown as an unlit texture so text
 * stays crisp in passthrough regardless of room lighting.
 */

import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import type { Task } from './plan-store.js';

export const CARD_W = 0.15;
export const CARD_H = 0.094;

const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';
const PAPER = '#f6f1e6';
const INK = '#1d1b18';
const MUTED = '#6f6a60';
const ACCENT: Record<string, string> = {
  inbox: '#8a8478',
  today: '#e0a100',
  later: '#4f7cac',
};

export interface Surface {
  mesh: Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  material: MeshBasicMaterial;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createSurface(
  width: number,
  height: number,
  pxW: number,
  pxH: number,
  options: { cutout?: boolean; renderOrder?: number } = {},
): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: !options.cutout,
    alphaTest: options.cutout ? 0.5 : 0,
    depthWrite: Boolean(options.cutout),
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(width, height), material);
  mesh.renderOrder = options.renderOrder ?? 0;
  return { mesh, canvas, ctx, texture, material };
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) {
    lines.push(line);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

/** Signature that changes whenever a card needs to be redrawn. */
export function cardSignature(task: Task, slot: number): string {
  return `${task.title}|${task.zone}|${task.carried}|${slot}|${Math.floor(task.spentSec / 60)}`;
}

export function createCardSurface(): Surface {
  return createSurface(CARD_W, CARD_H, 512, 320, { cutout: true, renderOrder: 2 });
}

export function drawCard(surface: Surface, task: Task, slot: number): void {
  const { ctx, canvas } = surface;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  roundRect(ctx, 6, 6, w - 12, h - 12, 30);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(29,27,24,0.25)';
  ctx.stroke();

  // Accent strip tells you at a glance which tray a card belongs to.
  ctx.save();
  roundRect(ctx, 6, 6, w - 12, h - 12, 30);
  ctx.clip();
  ctx.fillStyle = ACCENT[task.zone] ?? ACCENT.inbox;
  ctx.fillRect(6, 6, 22, h - 12);
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.textBaseline = 'top';
  ctx.font = `600 50px ${FONT}`;
  const lines = wrap(ctx, task.title, w - 96, 3);
  lines.forEach((line, index) => {
    ctx.fillText(line, 56, 44 + index * 60);
  });

  ctx.font = `500 30px ${FONT}`;
  ctx.fillStyle = MUTED;
  const notes: string[] = [];
  if (task.zone === 'today') {
    notes.push(`No. ${slot + 1}`);
  }
  if (task.carried > 0) {
    notes.push(task.carried === 1 ? 'carried over' : `carried ${task.carried}x`);
  }
  if (task.spentSec >= 60) {
    notes.push(`${Math.floor(task.spentSec / 60)} min in`);
  }
  ctx.fillText(notes.join('  ·  '), 56, h - 66);
  surface.texture.needsUpdate = true;
}

export type TrayKind = 'today' | 'later' | 'drop';

export function drawTray(
  surface: Surface,
  kind: TrayKind,
  label: string,
  slots: number,
): void {
  const { ctx, canvas } = surface;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 6, 6, w - 12, h - 12, 36);
  ctx.fillStyle = 'rgba(18,20,24,0.62)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle =
    kind === 'today' ? '#e0a100' : kind === 'later' ? '#4f7cac' : '#b4533a';
  ctx.stroke();

  ctx.fillStyle = '#f2efe8';
  ctx.font = `700 34px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(label, 34, 26);

  if (slots > 0) {
    // Empty slot outlines make the three-card limit visible before you hit it.
    const top = 84;
    const slotH = (h - top - 26) / slots;
    ctx.setLineDash([14, 12]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(242,239,232,0.35)';
    for (let i = 0; i < slots; i += 1) {
      roundRect(ctx, 30, top + i * slotH + 6, w - 60, slotH - 12, 22);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  surface.texture.needsUpdate = true;
}

export function drawHeader(surface: Surface, title: string, sub: string): void {
  const { ctx, canvas } = surface;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 4, 4, w - 8, h - 8, 40);
  ctx.fillStyle = 'rgba(18,20,24,0.72)';
  ctx.fill();
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fafaf7';
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(title, 40, 24);
  ctx.fillStyle = '#c9c5bb';
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText(sub, 40, 86);
  surface.texture.needsUpdate = true;
}

export function drawDial(
  surface: Surface,
  remainingSec: number,
  totalSec: number,
  paused: boolean,
): void {
  const { ctx, canvas } = surface;
  const size = canvas.width;
  const c = size / 2;
  const radius = size * 0.4;
  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(c, c, radius + 30, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(18,20,24,0.72)';
  ctx.fill();

  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(242,239,232,0.18)';
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.stroke();

  const left = Math.max(0, remainingSec);
  const fraction = totalSec > 0 ? left / totalSec : 0;
  if (fraction > 0.001) {
    ctx.strokeStyle = left === 0 ? '#b4533a' : '#e0a100';
    ctx.beginPath();
    ctx.arc(
      c,
      c,
      radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(1, fraction),
    );
    ctx.stroke();
  }

  const minutes = Math.floor(left / 60);
  const seconds = Math.floor(left % 60);
  ctx.fillStyle = '#fafaf7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 112px ${FONT}`;
  ctx.fillText(`${minutes}:${`${seconds}`.padStart(2, '0')}`, c, c - 6);
  ctx.font = `500 36px ${FONT}`;
  ctx.fillStyle = '#c9c5bb';
  ctx.fillText(
    left === 0 ? 'time is up' : paused ? 'paused' : 'focus',
    c,
    c + 78,
  );
  ctx.textAlign = 'left';
  surface.texture.needsUpdate = true;
}

export function drawButton(
  surface: Surface,
  label: string,
  tone: 'primary' | 'plain',
): void {
  const { ctx, canvas } = surface;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 4, 4, w - 8, h - 8, h / 2 - 4);
  ctx.fillStyle = tone === 'primary' ? '#e0a100' : 'rgba(18,20,24,0.78)';
  ctx.fill();
  if (tone === 'plain') {
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(242,239,232,0.45)';
    ctx.stroke();
  }
  ctx.fillStyle = tone === 'primary' ? '#1d1b18' : '#fafaf7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(label, w / 2, h / 2 + 2);
  ctx.textAlign = 'left';
  surface.texture.needsUpdate = true;
}
