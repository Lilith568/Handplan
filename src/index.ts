import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PanelSystem } from './panel.js';
import { PlannerSystem, planStore } from './planner.js';
import { unlockAudio } from './sound.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(PlannerSystem);
  world.registerSystem(PanelSystem);

  // The flat page is where tasks get typed; the headset is where they get sorted.
  const bar = document.getElementById('add-bar') as HTMLFormElement | null;
  const input = document.getElementById('add-input') as HTMLInputElement | null;
  const reset = document.getElementById('reset-button');
  bar?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input && planStore.add(input.value)) {
      input.value = '';
    }
  });
  reset?.addEventListener('click', () => planStore.reset());
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  world.visibilityState.subscribe((state) => {
    if (bar) {
      bar.style.display =
        state === VisibilityState.NonImmersive ? 'flex' : 'none';
    }
  });
});
