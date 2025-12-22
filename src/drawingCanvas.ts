import { Point2D, Stroke } from './types';
import { STROKE, GESTURE } from './constants';

// Light smoothing for responsiveness - smoothness comes from curve rendering
const SMOOTHING_FACTOR = 0.15;  // Very light smoothing for fast response

export class DrawingCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentStroke: Stroke | null = null;
  private completedStrokes: Stroke[] = [];
  private livePosition: Point2D | null = null;  // Real-time finger position
  private smoothedPosition: Point2D | null = null;  // Smoothed position for rendering

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

    // Apply light smoothing for responsiveness
    const smoothedPoint = this.smoothPoint(point);
    this.livePosition = point;
    this.smoothedPosition = smoothedPoint;

    const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
    const dist = this.distance(smoothedPoint, lastPoint);

    // Capture points frequently for smoother curves
    if (dist >= STROKE.MIN_POINT_DISTANCE) {
      this.currentStroke.points.push(smoothedPoint);
    }
  }

  // Light EMA smoothing - just enough to reduce jitter
  private smoothPoint(point: Point2D): Point2D {
    if (!this.smoothedPosition) {
      return point;
    }

    return {
      x: this.smoothedPosition.x + (point.x - this.smoothedPosition.x) * (1 - SMOOTHING_FACTOR),
      y: this.smoothedPosition.y + (point.y - this.smoothedPosition.y) * (1 - SMOOTHING_FACTOR)
    };
  }

  // Update live position without adding a point (for real-time tracking)
  updateLivePosition(point: Point2D): void {
    this.livePosition = point;
    this.smoothedPosition = this.smoothPoint(point);
  }

  clearLivePosition(): void {
    this.livePosition = null;
    this.smoothedPosition = null;
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

    // Render current stroke with live extension to finger position
    if (this.currentStroke && this.currentStroke.points.length >= 1) {
      this.renderStrokeWithLiveExtension(this.currentStroke, 1.0);
    }
  }

  private renderStrokeWithLiveExtension(stroke: Stroke, alpha: number): void {
    if (stroke.points.length === 0) return;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = stroke.color;
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Build points array including live position
    let points = [...stroke.points];
    if (this.smoothedPosition) {
      points.push(this.smoothedPosition);
    }

    // If only one point, draw a dot
    if (points.length === 1) {
      this.ctx.beginPath();
      this.ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
      return;
    }

    // Use Catmull-Rom spline for ultra-smooth curves
    this.drawCatmullRomSpline(points);
    this.ctx.stroke();
    this.ctx.restore();
  }

  // Catmull-Rom spline interpolation for smooth curves
  private drawCatmullRomSpline(points: Point2D[]): void {
    if (points.length < 2) return;

    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      this.ctx.lineTo(points[1].x, points[1].y);
      return;
    }

    // Tension parameter (0.5 = Catmull-Rom)
    const tension = 0.5;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      // Number of segments between points (more = smoother)
      const segments = 8;

      for (let t = 1; t <= segments; t++) {
        const s = t / segments;
        const s2 = s * s;
        const s3 = s2 * s;

        // Catmull-Rom basis functions
        const x = 0.5 * (
          (2 * p1.x) +
          (-p0.x + p2.x) * s +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3
        );

        const y = 0.5 * (
          (2 * p1.y) +
          (-p0.y + p2.y) * s +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3
        );

        this.ctx.lineTo(x, y);
      }
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

    // Use Catmull-Rom spline for smooth curves
    let points = [...stroke.points];
    if (stroke.closed) {
      points.push(stroke.points[0]);  // Close the loop
    }
    this.drawCatmullRomSpline(points);
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
    let points = [...stroke.points];
    if (stroke.closed) {
      points.push(stroke.points[0]);  // Close the loop
    }
    this.drawCatmullRomSpline(points);
  }

  removeCompletedStroke(stroke: Stroke): void {
    const index = this.completedStrokes.indexOf(stroke);
    if (index > -1) {
      this.completedStrokes.splice(index, 1);
    }
  }
}
