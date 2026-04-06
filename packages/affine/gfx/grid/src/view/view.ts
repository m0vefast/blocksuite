import { GridElementModel } from '@blocksuite/affine-model';
import { Bound } from '@blocksuite/global/gfx';
import {
  type BoxSelectionContext,
  GfxElementModelView,
  GfxPrimitiveElementModel,
  GfxViewInteractionExtension,
} from '@blocksuite/std/gfx';

import { expandCellToFit, layoutGrid } from './layout.js';

export class GridView extends GfxElementModelView<GridElementModel> {
  static override type = 'grid';

  _layoutRunning = false;

  private _setLayoutMethod() {
    this.model.setLayoutMethod(() => {
      this._layoutRunning = true;
      layoutGrid(this.model);
      this._layoutRunning = false;
    });
  }

  override onCreated(): void {
    this._setLayoutMethod();

    // Layout is called inside each structural method's transact for undo atomicity.
    // The only reactive trigger is for grid POSITION changes (framework drag-move).
    this.disposable.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'xywh') {
          this.model.layout();
        }
      })
    );

    // Clean up orphaned Y.Map entries when a child is deleted externally
    // Surface elements:
    this.disposable.add(
      this.surface.elementRemoved.subscribe(({ id }) => {
        if (this.model.children.has(id)) {
          this.model.removeChild({ id } as any);
        }
      })
    );
    // Block elements (edgeless-text, YouTube embed, etc.):
    this.disposable.add(
      this.model.surface.store.slots.blockUpdated.subscribe(({ type, id }) => {
        if (type === 'delete' && this.model.children.has(id)) {
          this.model.removeChild({ id } as any);
        }
      })
    );

    // Watch child element SIZE changes → auto-expand cell to fit.
    // Skip changes caused by our own layout (which stretches elements to fill cells).
    const checkChildSizeChange = (id: string) => {
      if (this._layoutRunning) return; // Skip changes from layout itself
      if (!this.model.children.has(id)) return;

      const element = this.model.getChildById(id);
      if (!element) return;

      const detail = this.model.children.get(id);
      if (!detail) return;

      const elBound = element.elementBound;
      expandCellToFit(
        this.model,
        detail.row,
        detail.col,
        elBound.w,
        elBound.h
      );
    };

    // Watch surface element changes (shapes, canvas text, etc.)
    this.disposable.add(
      this.surface.elementUpdated.subscribe(({ id, props, local }) => {
        if (!local || !('xywh' in props)) return;
        checkChildSizeChange(id);
      })
    );

    // Watch block element changes (edgeless-text, YouTube embed, etc.)
    this.disposable.add(
      this.model.surface.store.slots.blockUpdated.subscribe(({ type, id }) => {
        if (type === 'update') {
          checkChildSizeChange(id);
        }
      })
    );

    // Disable connector attachment on grid children.
    // Block elements: writable `connectable` property.
    // Surface elements: getter — shadow with defineProperty.
    const setConnectable = (id: string, value: boolean) => {
      const el = this.model.getChildById(id);
      if (!el) return;
      if (el instanceof GfxPrimitiveElementModel) {
        if (value) {
          // Remove the shadow property, restoring the prototype getter (returns true)
          delete (el as any).connectable;
        } else {
          Object.defineProperty(el, 'connectable', { value: false, configurable: true });
        }
      } else {
        (el as any).connectable = value;
      }
    };
    for (const id of this.model.children.keys()) {
      setConnectable(id, false);
    }
    this.disposable.add(
      this.model.children.observe((evt: any) => {
        for (const key of evt.keysChanged) {
          if (this.model.children.has(key)) {
            setConnectable(key, false);
          } else {
            // Child removed from grid — restore connectable
            setConnectable(key, true);
          }
        }
      })
    );

    // Initial layout
    this.model.layout();
  }

  override onBoxSelected(context: BoxSelectionContext) {
    const { box } = context;
    const bound = new Bound(box.x, box.y, box.w, box.h);
    return bound.contains(this.model.elementBound);
  }
}

export const GridInteraction = GfxViewInteractionExtension<GridView>(
  GridView.type,
  {
    // Enable all 8 resize handles (4 corners + 4 edges)
    resizeConstraint: {
      minWidth: 60,
      minHeight: 40,
    },

    // Proportional resize: distribute delta across colWidths/rowHeights
    handleResize: ({ model }) => {
      const grid = model as unknown as GridElementModel;
      let origW: number;
      let origH: number;
      let origColWidths: number[];
      let origRowHeights: number[];

      return {
        onResizeStart() {
          origW = grid.totalWidth;
          origH = grid.totalHeight;
          origColWidths = [...grid.colWidths];
          origRowHeights = [...grid.rowHeights];
        },
        onResizeMove(ctx) {
          const newW = ctx.newBound.w;
          const newH = ctx.newBound.h;

          const scaleX = origW > 0 ? newW / origW : 1;
          const scaleY = origH > 0 ? newH / origH : 1;

          const newColWidths = origColWidths.map(w =>
            Math.max(20, Math.round(w * scaleX))
          );
          const newRowHeights = origRowHeights.map(h =>
            Math.max(20, Math.round(h * scaleY))
          );

          // Preview via @local — no Yjs write during drag
          grid.previewColWidths = newColWidths;
          grid.previewRowHeights = newRowHeights;
          grid.layout();
        },
        onResizeEnd() {
          // Clear preview
          const finalColWidths = grid.previewColWidths ?? grid.colWidths;
          const finalRowHeights = grid.previewRowHeights ?? grid.rowHeights;
          grid.previewColWidths = null;
          grid.previewRowHeights = null;

          // Single Yjs commit
          grid.surface.store.transact(() => {
            grid.colWidths = [...finalColWidths];
            grid.rowHeights = [...finalRowHeights];
            grid.syncXYWH();
            grid.layout();
          });
        },
      };
    },

    handleSelection: () => ({
      onSelect(context) {
        // Always use default selection (editing: false).
        // This keeps both resize handles AND toolbar visible in all modes.
        return context.default(context);
      },
    }),
  }
);
