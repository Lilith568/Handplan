import { createComponent, Types } from '@iwsdk/core';

/** A task card the user can pinch, move and drop into a tray. */
export const Card = createComponent('Card', {
  taskId: { type: Types.String, default: '' },
});

/** A pinchable control (focus "Done"/"Back", workspace handle). */
export const PlanButton = createComponent('PlanButton', {
  action: { type: Types.String, default: '' },
});
