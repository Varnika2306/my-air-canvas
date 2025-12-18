import { Point2D, Stroke } from './types';
import { STROKE, GESTURE } from './constants';

// Note: Visual smoothing is handled by quadratic curve rendering, not point storage

export class DrawingCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentStroke: Stroke | null = null;
  private completedStrokes: Stroke[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  startStroke(point: Point2D, color: string): void {
    this.currentStroke = {
      points: [point],
      color,
      width: STROKE.WIDTH,
      closed: false
    };
  }

  addPoint(point: Point2D): void {
    if (!this.currentStroke) return;

    const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
    const dist = this.distance(point, lastPoint);

    // Only add point if it's far enough from the last point
    // Store raw positions - the quadratic curve rendering handles visual smoothing
    if (dist >= STROKE.MIN_POINT_DISTANCE) {
      this.currentStroke.points.push(point);
    }
  }

  private distance(p1: Point2D, p2: Point2D): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  pauseStroke(): void {
    // Stroke remains but we stop adding points
    // The stroke is kept for potential closing
  }

  closeStroke(): Stroke | null {
    if (!this.currentStroke) return null;

    // Check if stroke is long enough
    const length = this.calculateStrokeLength();
    if (length < GESTURE.MIN_STROKE_LENGTH) {
      this.discardStroke();
      return null;
    }

    // Close the path by connecting last point to first
    if (this.currentStroke.points.length > 2) {
      this.currentStroke.closed = true;
      const closedStroke = { ...this.currentStroke };
      this.completedStrokes.push(closedStroke);
      this.currentStroke = null;
      return closedStroke;
    }

    this.discardStroke();
    return null;
  }

  discardStroke(): void {
    this.currentStroke = null;
  }

  private calculateStrokeLength(): number {
    if (!this.currentStroke || this.currentStroke.points.length < 2) return 0;

    let length = 0;
    for (let i = 1; i < this.currentStroke.points.length; i++) {
      length += this.distance(
        this.currentStroke.points[i - 1],
        this.currentStroke.points[i]
      );
    }
    return length;
  }

  getCurrentStroke(): Stroke | null {
    return this.currentStroke;
  }

  clearAll(): void {
    this.currentStroke = null;
    this.completedStrokes = [];
    this.clear();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(): void {
    this.clear();

    // Render completed strokes (faded)
    for (const stroke of this.completedStrokes) {
      this.renderStroke(stroke, 0.3);
    }

    // Render current stroke immediately (even with 1 point)
    if (this.currentStroke && this.currentStroke.points.length >= 1) {
      this.renderStroke(this.currentStroke, 1.0);
    }
  }

  private renderStroke(stroke: Stroke, alpha: number): void {
    if (stroke.points.length === 0) return;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = stroke.color;
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // If only one point, draw a dot
    if (stroke.points.length === 1) {
      this.ctx.beginPath();
      this.ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
      return;
    }

    this.ctx.beginPath();
    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    // Use quadratic curves for smoother lines
    for (let i = 1; i < stroke.points.length - 1; i++) {
      const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
      const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
      this.ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
    }

    // Draw to the last point
    const last = stroke.points[stroke.points.length - 1];
    this.ctx.lineTo(last.x, last.y);

    // If closed, connect back to start
    if (stroke.closed) {
      this.ctx.lineTo(stroke.points[0].x, stroke.points[0].y);
    }

    this.ctx.stroke();
    this.ctx.restore();
  }

  renderClosingAnimation(stroke: Stroke, progress: number): void {
    if (stroke.points.length < 2) return;

    this.clear();

    // Render the stroke with pulsing effect
    const pulseScale = 1 + Math.sin(progress * Math.PI) * 0.1;
    const pulseAlpha = 0.5 + Math.sin(progress * Math.PI * 2) * 0.5;

    this.ctx.save();

    // Draw glow
    this.ctx.globalAlpha = pulseAlpha * 0.3;
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.width * pulseScale * 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.filter = 'blur(8px)';

    this.drawStrokePath(stroke);
    this.ctx.stroke();

    // Draw main stroke
    this.ctx.filter = 'none';
    this.ctx.globalAlpha = 1;
    this.ctx.lineWidth = stroke.width * pulseScale;

    this.drawStrokePath(stroke);
    this.ctx.stroke();

    this.ctx.restore();
  }

  private drawStrokePath(stroke: Stroke): void {
    this.ctx.beginPath();
    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length - 1; i++) {
      const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
      const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
      this.ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
    }

    const last = stroke.points[stroke.points.length - 1];
    this.ctx.lineTo(last.x, last.y);

    if (stroke.closed) {
      this.ctx.closePath();
    }
  }

  removeCompletedStroke(stroke: Stroke): void {
    const index = this.completedStrokes.indexOf(stroke);
    if (index > -1) {
      this.completedStrokes.splice(index, 1);
    }
  }
}
