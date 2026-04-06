import {
  type ElementRenderer,
  ElementRendererExtension,
} from '@blocksuite/affine-block-surface';
import type { GridElementModel } from '@blocksuite/affine-model';

const ACCENT = 'rgba(30, 130, 250,';
const EMPTY_PLUS_COLOR = 'rgba(180, 180, 180, 0.3)';

export const grid: ElementRenderer<GridElementModel> = (
  model,
  ctx,
  _matrix,
  _renderer,
  _rc,
  bound
) => {
  const [originX, originY] = model.deserializedXYWH;
  const dx = originX - bound.x;
  const dy = originY - bound.y;

  ctx.save();
  ctx.globalAlpha *= model.opacity;

  const totalW = model.totalWidth;
  const totalH = model.totalHeight;

  // ── Cell backgrounds + highlights ─────────────────────
  const isDraggingRow = model.draggingRow >= 0;
  const isDraggingCol = model.draggingCol >= 0;

  for (let r = 0; r < model.rows; r++) {
    for (let c = 0; c < model.cols; c++) {
      const cb = model.getCellBound(r, c);
      let cx = cb.x - bound.x;
      let cy = cb.y - bound.y;

      // Offset dragged row/col to follow mouse
      const isThisDraggedRow = isDraggingRow && r === model.draggingRow;
      const isThisDraggedCol = isDraggingCol && c === model.draggingCol;
      if (isThisDraggedRow) cy += model.dragOffset;
      if (isThisDraggedCol) cx += model.dragOffset;

      // Dragged row/col: shadow under offset cells
      if (isThisDraggedRow || isThisDraggedCol) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = model.fillColor !== 'transparent' ? model.fillColor : '#fff';
        ctx.fillRect(cx, cy, cb.w, cb.h);
        ctx.restore();
      }

      // Base fill
      if (model.fillColor !== 'transparent') {
        ctx.fillStyle = model.fillColor;
        ctx.fillRect(cx, cy, cb.w, cb.h);
      }

      // Cell selection (solid blue border)
      const isCellSelected =
        model.selectionMode === 'cell' &&
        model.selectedCell?.row === r &&
        model.selectedCell?.col === c;

      if (isCellSelected) {
        ctx.fillStyle = `${ACCENT} 0.08)`;
        ctx.fillRect(cx, cy, cb.w, cb.h);
        ctx.strokeStyle = `${ACCENT} 0.7)`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(cx + 1, cy + 1, cb.w - 2, cb.h - 2);
      }

      // Hovered cell (dashed border, lighter, skip if selected)
      const hc = model.hoveredCell;
      const isCellHovered = hc && hc.row === r && hc.col === c;
      if (isCellHovered && !isCellSelected) {
        ctx.fillStyle = `${ACCENT} 0.04)`;
        ctx.fillRect(cx, cy, cb.w, cb.h);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = `${ACCENT} 0.35)`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cb.w - 1, cb.h - 1);
        ctx.setLineDash([]);
      }

      // Empty cells: subtle dashed border to indicate they accept content
      if (!model.getChildInCell(r, c) && !isCellSelected && !isCellHovered) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + 4, cy + 4, cb.w - 8, cb.h - 8);
        ctx.setLineDash([]);
      }
    }
  }

  // ── Grid lines ────────────────────────────────────────
  ctx.strokeStyle = model.strokeColor;

  // Outer border (thicker)
  ctx.lineWidth = model.strokeWidth * 2;
  ctx.strokeRect(dx, dy, totalW, totalH);

  // Inner dividers
  ctx.lineWidth = model.strokeWidth;

  const ecw = model.effectiveColWidths;
  const erh = model.effectiveRowHeights;

  let x = 0;
  for (let c = 0; c < model.cols - 1; c++) {
    x += ecw[c];
    const lineX = dx + x + c * model.gap + model.gap / 2;
    ctx.beginPath();
    ctx.moveTo(lineX, dy);
    ctx.lineTo(lineX, dy + totalH);
    ctx.stroke();
  }

  let y = 0;
  for (let r = 0; r < model.rows - 1; r++) {
    y += erh[r];
    const lineY = dy + y + r * model.gap + model.gap / 2;
    ctx.beginPath();
    ctx.moveTo(dx, lineY);
    ctx.lineTo(dx + totalW, lineY);
    ctx.stroke();
  }

  // ── Hovered grid line highlight (resize feedback) ─────
  const hl = model.hoveredLine;
  if (hl) {
    ctx.strokeStyle = `${ACCENT} 0.7)`;
    ctx.lineWidth = 3;
    if (hl.axis === 'row') {
      let ly = 0;
      for (let r = 0; r <= hl.index; r++) ly += erh[r];
      const lineY = dy + ly + hl.index * model.gap + model.gap / 2;
      ctx.beginPath();
      ctx.moveTo(dx, lineY);
      ctx.lineTo(dx + totalW, lineY);
      ctx.stroke();
    } else {
      let lx = 0;
      for (let c = 0; c <= hl.index; c++) lx += ecw[c];
      const lineX = dx + lx + hl.index * model.gap + model.gap / 2;
      ctx.beginPath();
      ctx.moveTo(lineX, dy);
      ctx.lineTo(lineX, dy + totalH);
      ctx.stroke();
    }
  }

  // ── Drag reorder indicator (insertion line between rows/cols) ──
  const dri = model.dragReorderIndicator;
  if (dri) {
    ctx.strokeStyle = `${ACCENT} 0.9)`;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.fillStyle = `${ACCENT} 0.9)`;

    if (dri.axis === 'row') {
      // dri.position is a boundary index (0..rows): 0=before first, rows=after last
      // Clamped to valid cell index for getCellBound
      const clampedRow = Math.min(dri.position, model.rows - 1);
      const cb = model.getCellBound(clampedRow, 0);
      // Top of row if position < rows, bottom of last row if position == rows
      const lineY = dri.position >= model.rows
        ? cb.y - bound.y + cb.h + model.gap / 2
        : cb.y - bound.y - model.gap / 2;

      ctx.beginPath();
      ctx.moveTo(dx - 4, lineY);
      ctx.lineTo(dx + totalW + 4, lineY);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(dx - 4, lineY, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(dx + totalW + 4, lineY, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      const clampedCol = Math.min(dri.position, model.cols - 1);
      const cb = model.getCellBound(0, clampedCol);
      const lineX = dri.position >= model.cols
        ? cb.x - bound.x + cb.w + model.gap / 2
        : cb.x - bound.x - model.gap / 2;

      ctx.beginPath();
      ctx.moveTo(lineX, dy - 4);
      ctx.lineTo(lineX, dy + totalH + 4);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(lineX, dy - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lineX, dy + totalH + 4, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Row/Col grab handles ───────────────────────────────
  const HANDLE_W = 14;
  const HANDLE_DOT_R = 1.5;

  // Row handles (left of grid)
  for (let r = 0; r < model.rows; r++) {
    const cb = model.getCellBound(r, 0);
    const hx = cb.x - bound.x - HANDLE_W - 4;
    const hy = cb.y - bound.y + cb.h / 2 - 8;
    const isHovered = model.hoveredRowHandle === r;
    const isSelected =
      model.selectionMode === 'row' && model.selectedRow === r;

    if (isHovered || isSelected) {
      ctx.fillStyle = isSelected ? `${ACCENT} 0.15)` : `${ACCENT} 0.08)`;
      ctx.beginPath();
      ctx.roundRect(hx, hy, HANDLE_W, 16, 3);
      ctx.fill();
    }

    ctx.fillStyle = isSelected
      ? `${ACCENT} 0.7)`
      : isHovered
        ? `${ACCENT} 0.5)`
        : 'rgba(180,180,180,0.4)';
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        ctx.beginPath();
        ctx.arc(hx + 4 + dc * 6, hy + 4 + dr * 4, HANDLE_DOT_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Column handles (above grid)
  for (let c = 0; c < model.cols; c++) {
    const cb = model.getCellBound(0, c);
    const hx = cb.x - bound.x + cb.w / 2 - 8;
    const hy = cb.y - bound.y - HANDLE_W - 4;
    const isHovered = model.hoveredColHandle === c;
    const isSelected =
      model.selectionMode === 'col' && model.selectedCol === c;

    if (isHovered || isSelected) {
      ctx.fillStyle = isSelected ? `${ACCENT} 0.15)` : `${ACCENT} 0.08)`;
      ctx.beginPath();
      ctx.roundRect(hx, hy, 16, HANDLE_W, 3);
      ctx.fill();
    }

    ctx.fillStyle = isSelected
      ? `${ACCENT} 0.7)`
      : isHovered
        ? `${ACCENT} 0.5)`
        : 'rgba(180,180,180,0.4)';
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        ctx.beginPath();
        ctx.arc(hx + 4 + dc * 4, hy + 4 + dr * 6, HANDLE_DOT_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ── "+" buttons (only in cell/row/col mode — hidden when framework-selected) ──
  const PLUS_R = 12;
  const PLUS_ICON = 5;
  const showPlusButtons = true; // always visible

  // Add Column button (right edge center)
  if (showPlusButtons) {
    const btnX = dx + totalW + PLUS_R + 16;
    const btnY = dy + totalH / 2;
    const hovered = model.hoveredAddButton === 'addCol';

    ctx.fillStyle = hovered ? `${ACCENT} 0.12)` : 'rgba(200,200,200,0.15)';
    ctx.strokeStyle = hovered ? `${ACCENT} 0.5)` : 'rgba(180,180,180,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(btnX, btnY, PLUS_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // "+" icon
    ctx.strokeStyle = hovered ? `${ACCENT} 0.7)` : 'rgba(150,150,150,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(btnX - PLUS_ICON, btnY);
    ctx.lineTo(btnX + PLUS_ICON, btnY);
    ctx.moveTo(btnX, btnY - PLUS_ICON);
    ctx.lineTo(btnX, btnY + PLUS_ICON);
    ctx.stroke();
  }

  // Add Row button (bottom edge center)
  if (showPlusButtons) {
    const btnX = dx + totalW / 2;
    const btnY = dy + totalH + PLUS_R + 16;
    const hovered = model.hoveredAddButton === 'addRow';

    ctx.fillStyle = hovered ? `${ACCENT} 0.12)` : 'rgba(200,200,200,0.15)';
    ctx.strokeStyle = hovered ? `${ACCENT} 0.5)` : 'rgba(180,180,180,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(btnX, btnY, PLUS_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = hovered ? `${ACCENT} 0.7)` : 'rgba(150,150,150,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(btnX - PLUS_ICON, btnY);
    ctx.lineTo(btnX + PLUS_ICON, btnY);
    ctx.moveTo(btnX, btnY - PLUS_ICON);
    ctx.lineTo(btnX, btnY + PLUS_ICON);
    ctx.stroke();
  }

  // ── Row/Col selection highlight ────────────────────────
  if (model.selectionMode === 'row' && model.selectedRow >= 0) {
    const firstCell = model.getCellBound(model.selectedRow, 0);
    const lastCell = model.getCellBound(model.selectedRow, model.cols - 1);
    ctx.fillStyle = `${ACCENT} 0.06)`;
    const sy = firstCell.y - bound.y;
    const sx = firstCell.x - bound.x;
    const sw = lastCell.x + lastCell.w - firstCell.x;
    ctx.fillRect(sx, sy, sw, firstCell.h);
    ctx.strokeStyle = `${ACCENT} 0.6)`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(sx, sy, sw, firstCell.h);

    // "+" buttons: add row above / below (at handle X position)
    const handleX = sx - HANDLE_W - 4 + HANDLE_W / 2; // center of grip handle
    const aboveY = sy - PLUS_R - 3;
    const belowY = sy + firstCell.h + PLUS_R + 3;
    const hoveredAbove = model.hoveredAddButton === 'addRowAbove';
    const hoveredBelow = model.hoveredAddButton === 'addRowBelow';

    // Add row above
    ctx.fillStyle = hoveredAbove ? `${ACCENT} 0.15)` : 'rgba(200,200,200,0.2)';
    ctx.strokeStyle = hoveredAbove ? `${ACCENT} 0.6)` : 'rgba(180,180,180,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(handleX, aboveY, PLUS_R - 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hoveredAbove ? `${ACCENT} 0.8)` : 'rgba(150,150,150,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(handleX - 4, aboveY); ctx.lineTo(handleX + 4, aboveY);
    ctx.moveTo(handleX, aboveY - 4); ctx.lineTo(handleX, aboveY + 4); ctx.stroke();

    // Add row below
    ctx.fillStyle = hoveredBelow ? `${ACCENT} 0.15)` : 'rgba(200,200,200,0.2)';
    ctx.strokeStyle = hoveredBelow ? `${ACCENT} 0.6)` : 'rgba(180,180,180,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(handleX, belowY, PLUS_R - 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hoveredBelow ? `${ACCENT} 0.8)` : 'rgba(150,150,150,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(handleX - 4, belowY); ctx.lineTo(handleX + 4, belowY);
    ctx.moveTo(handleX, belowY - 4); ctx.lineTo(handleX, belowY + 4); ctx.stroke();
  }

  if (model.selectionMode === 'col' && model.selectedCol >= 0) {
    const firstCell = model.getCellBound(0, model.selectedCol);
    const lastCell = model.getCellBound(model.rows - 1, model.selectedCol);
    ctx.fillStyle = `${ACCENT} 0.06)`;
    const sx = firstCell.x - bound.x;
    const sy = firstCell.y - bound.y;
    const sh = lastCell.y + lastCell.h - firstCell.y;
    ctx.fillRect(sx, sy, firstCell.w, sh);
    ctx.strokeStyle = `${ACCENT} 0.6)`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(sx, sy, firstCell.w, sh);

    // "+" buttons: add col left / right (at handle Y position)
    const handleY = sy - HANDLE_W - 4 + HANDLE_W / 2;
    const leftX = sx - PLUS_R - 3;
    const rightX = sx + firstCell.w + PLUS_R + 3;
    const hoveredLeft = model.hoveredAddButton === 'addColLeft';
    const hoveredRight = model.hoveredAddButton === 'addColRight';

    // Add col left
    ctx.fillStyle = hoveredLeft ? `${ACCENT} 0.15)` : 'rgba(200,200,200,0.2)';
    ctx.strokeStyle = hoveredLeft ? `${ACCENT} 0.6)` : 'rgba(180,180,180,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(leftX, handleY, PLUS_R - 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hoveredLeft ? `${ACCENT} 0.8)` : 'rgba(150,150,150,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(leftX - 4, handleY); ctx.lineTo(leftX + 4, handleY);
    ctx.moveTo(leftX, handleY - 4); ctx.lineTo(leftX, handleY + 4); ctx.stroke();

    // Add col right
    ctx.fillStyle = hoveredRight ? `${ACCENT} 0.15)` : 'rgba(200,200,200,0.2)';
    ctx.strokeStyle = hoveredRight ? `${ACCENT} 0.6)` : 'rgba(180,180,180,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(rightX, handleY, PLUS_R - 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hoveredRight ? `${ACCENT} 0.8)` : 'rgba(150,150,150,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(rightX - 4, handleY); ctx.lineTo(rightX + 4, handleY);
    ctx.moveTo(rightX, handleY - 4); ctx.lineTo(rightX, handleY + 4); ctx.stroke();
  }

  // ── Dragged row/col unified border (over everything) ───
  if (isDraggingRow && model.draggingRow >= 0) {
    const firstCb = model.getCellBound(model.draggingRow, 0);
    const lastCb = model.getCellBound(model.draggingRow, model.cols - 1);
    const rx = firstCb.x - bound.x;
    const ry = firstCb.y - bound.y + model.dragOffset;
    const rw = lastCb.x + lastCb.w - firstCb.x;
    const rh = firstCb.h;
    ctx.strokeStyle = `${ACCENT} 0.8)`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(rx, ry, rw, rh);
  }
  if (isDraggingCol && model.draggingCol >= 0) {
    const firstCb = model.getCellBound(0, model.draggingCol);
    const lastCb = model.getCellBound(model.rows - 1, model.draggingCol);
    const rx = firstCb.x - bound.x + model.dragOffset;
    const ry = firstCb.y - bound.y;
    const rw = firstCb.w;
    const rh = lastCb.y + lastCb.h - firstCb.y;
    ctx.strokeStyle = `${ACCENT} 0.8)`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(rx, ry, rw, rh);
  }

  // ── Cell resize handles (drawn LAST = highest z-index) ─
  // Handles sit OUTSIDE the cell edge (|O pattern)
  if (model.selectionMode === 'cell' && model.selectedCell) {
    const sc = model.selectedCell;
    const cb = model.getCellBound(sc.row, sc.col);
    const cx = cb.x - bound.x;
    const cy = cb.y - bound.y;
    const HR = 5;
    const OFF = HR + 1; // offset outside the edge

    ctx.fillStyle = 'white';
    ctx.strokeStyle = `${ACCENT} 0.9)`;
    ctx.lineWidth = 2;

    // Right edge at 72% height → col resize
    ctx.beginPath();
    ctx.arc(cx + cb.w + OFF, cy + cb.h * 0.72, HR, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Bottom edge at 72% width → row resize
    ctx.beginPath();
    ctx.arc(cx + cb.w * 0.72, cy + cb.h + OFF, HR, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  ctx.restore();
};

export const GridElementRendererExtension = ElementRendererExtension(
  'grid',
  grid
);
