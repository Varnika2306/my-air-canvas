import { HandTracker } from './handTracking';
import { GestureDetector } from './gestureDetector';
import { DrawingCanvas } from './drawingCanvas';
import { HandVisualizer } from './handVisualizer';
import { Scene3D } from './scene3D';
import { ObjectManager } from './objectManager';
import { HandLandmarks, GestureState, BalloonObject, Stroke } from './types';
import { COLOR_ARRAY, GESTURE, TIMING } from './constants';

class AirCanvas {
  // Core components
  private handTracker: HandTracker;
  private gestureDetector: GestureDetector;
  private drawingCanvas: DrawingCanvas;
  private handVisualizer: HandVisualizer;
  private scene3D: Scene3D;
  private objectManager: ObjectManager;

  // DOM elements
  private loadingOverlay: HTMLElement;
  private statusMessage: HTMLElement;
  private colorIndicator: HTMLElement;
  private objectCounter: HTMLElement;

  // State
  private isDrawing = false;
  private currentColorIndex = 0;
  private lastGestureState: GestureState | null = null;
  private currentLandmarks: HandLandmarks | null = null;
  private palmHoldStart = 0;
  private fistHoldStart = 0;
  private handDetected = false;
  private lastFrameTime = 0;
  private grabbedObject: BalloonObject | null = null;

  constructor() {
    // Get DOM elements
    const videoElement = document.getElementById('webcam') as HTMLVideoElement;
    const sceneCanvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
    const drawCanvas = document.getElementById('draw-canvas') as HTMLCanvasElement;
    const handCanvas = document.getElementById('hand-canvas') as HTMLCanvasElement;

    this.loadingOverlay = document.getElementById('loading-overlay')!;
    this.statusMessage = document.getElementById('status-message')!;
    this.colorIndicator = document.getElementById('color-indicator')!;
    this.objectCounter = document.getElementById('object-counter')!;

    // Initialize components
    this.handTracker = new HandTracker(videoElement);
    this.gestureDetector = new GestureDetector();
    this.drawingCanvas = new DrawingCanvas(drawCanvas);
    this.handVisualizer = new HandVisualizer(handCanvas);
    this.scene3D = new Scene3D(sceneCanvas);
    this.objectManager = new ObjectManager(
      this.scene3D,
      window.innerWidth,
      window.innerHeight
    );

    // Set initial size
    this.resize();

    // Update color indicator
    this.updateColorIndicator();

    // Bind event listeners
    window.addEventListener('resize', () => this.resize());

    // Start the application
    this.init();
  }

  private async init(): Promise<void> {
    try {
      // Start hand tracking
      await this.handTracker.start((landmarks) => this.onHandResults(landmarks));

      // Hide loading overlay
      this.loadingOverlay.classList.add('hidden');

      // Start animation loop
      this.animate();
    } catch (error) {
      console.error('Failed to initialize:', error);
      this.showStatus('Camera access denied. Please allow camera access and refresh.');
    }
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.handTracker.setCanvasSize(width, height);
    this.drawingCanvas.resize(width, height);
    this.handVisualizer.resize(width, height);
    this.scene3D.resize(width, height);
    this.objectManager.updateSize(width, height);
  }

  private onHandResults(landmarks: HandLandmarks | null): void {
    const wasDetected = this.handDetected;
    this.handDetected = landmarks !== null;
    this.currentLandmarks = landmarks;

    // Show/hide hand detection message
    if (!this.handDetected && wasDetected) {
      this.showStatus('Show your hand to begin');
    } else if (this.handDetected && !wasDetected) {
      this.hideStatus();
    }

    if (!landmarks) {
      // Pause drawing if hand leaves
      if (this.isDrawing) {
        this.isDrawing = false;
      }
      return;
    }

    // Detect gesture
    const gestureState = this.gestureDetector.detect(landmarks);

    // Handle gesture
    this.handleGesture(gestureState, landmarks);

    this.lastGestureState = gestureState;
  }

  private handleGesture(state: GestureState, landmarks: HandLandmarks): void {
    const indexTip = this.gestureDetector.getIndexTip(landmarks);

    switch (state.current) {
      case 'draw':
        this.handleDraw(indexTip);
        break;

      case 'pinch':
        this.handlePinch(landmarks);
        break;

      case 'palm':
        this.handlePalm(state);
        break;

      case 'fist':
        this.handleFist(state);
        break;

      case 'swipe':
        this.handleSwipe(indexTip);
        break;

      default:
        // Release grabbed object if gesture changes
        if (this.grabbedObject) {
          this.objectManager.releaseObject(this.grabbedObject);
          this.grabbedObject = null;
        }
        break;
    }

    // Reset timers if gesture changed
    if (this.lastGestureState && state.current !== this.lastGestureState.current) {
      this.palmHoldStart = 0;
      this.fistHoldStart = 0;
    }
  }

  private handleDraw(position: { x: number; y: number }): void {
    // Check if poking an object
    const hitObject = this.objectManager.getObjectAtPosition(position.x, position.y);
    if (hitObject) {
      this.objectManager.pokeObject(hitObject);
      return;
    }

    if (!this.isDrawing) {
      // Start new stroke
      this.isDrawing = true;
      const color = COLOR_ARRAY[this.currentColorIndex];
      this.drawingCanvas.startStroke(position, color);
    } else {
      // Continue stroke
      this.drawingCanvas.addPoint(position);
    }
  }

  private handlePinch(landmarks: HandLandmarks): void {
    const pinchCenter = this.gestureDetector.getPinchCenter(landmarks);

    if (this.isDrawing) {
      // Pause drawing but keep stroke
      this.isDrawing = false;
      this.drawingCanvas.pauseStroke();
    }

    // Check if grabbing an object
    if (!this.grabbedObject) {
      const hitObject = this.objectManager.getObjectAtPosition(pinchCenter.x, pinchCenter.y);
      if (hitObject) {
        this.grabbedObject = hitObject;
        this.objectManager.grabObject(hitObject);
      }
    } else {
      // Move grabbed object
      this.objectManager.moveGrabbedObject(this.grabbedObject, pinchCenter.x, pinchCenter.y);
    }
  }

  private handlePalm(_state: GestureState): void {
    // Release any grabbed object
    if (this.grabbedObject) {
      this.objectManager.releaseObject(this.grabbedObject);
      this.grabbedObject = null;
    }

    // Track palm hold time
    if (this.palmHoldStart === 0) {
      this.palmHoldStart = performance.now();
    }

    const holdDuration = performance.now() - this.palmHoldStart;

    if (holdDuration >= GESTURE.PALM_HOLD_TIME) {
      // Close and inflate current stroke
      this.closeAndInflate();
      this.palmHoldStart = 0;
    }
  }

  private handleFist(_state: GestureState): void {
    // Track fist hold time
    if (this.fistHoldStart === 0) {
      this.fistHoldStart = performance.now();
    }

    const holdDuration = performance.now() - this.fistHoldStart;

    if (holdDuration >= GESTURE.FIST_HOLD_TIME) {
      // Clear all objects
      this.clearAll();
      this.fistHoldStart = 0;
    } else if (holdDuration > 200) {
      // Show progress
      const progress = holdDuration / GESTURE.FIST_HOLD_TIME;
      this.showStatus(`Clearing... ${Math.round(progress * 100)}%`);
    }
  }

  private handleSwipe(position: { x: number; y: number }): void {
    // Check if swiping on an object
    const hitObject = this.objectManager.getObjectAtPosition(position.x, position.y);
    if (hitObject) {
      this.objectManager.removeObject(hitObject);
      this.updateObjectCounter();
    }
  }

  private async closeAndInflate(): Promise<void> {
    const stroke = this.drawingCanvas.closeStroke();

    if (!stroke) {
      this.showStatus('Draw a larger shape', 1000);
      return;
    }

    this.isDrawing = false;

    // Animate the closing
    const startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / (TIMING.STROKE_CLOSE_PULSE * 1000), 1);

      this.drawingCanvas.renderClosingAnimation(stroke, progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Create 3D balloon
        this.createBalloon(stroke);
      }
    };
    animate();
  }

  private async createBalloon(stroke: Stroke): Promise<void> {
    try {
      await this.objectManager.createFromStroke(stroke);

      // Clear the stroke from drawing canvas
      this.drawingCanvas.removeCompletedStroke(stroke);
      this.drawingCanvas.clear();

      // Cycle to next color
      this.currentColorIndex = (this.currentColorIndex + 1) % COLOR_ARRAY.length;
      this.updateColorIndicator();

      // Update counter
      this.updateObjectCounter();
    } catch (error) {
      console.error('Failed to create balloon:', error);
      this.showStatus('Failed to create shape', 2000);
    }
  }

  private async clearAll(): Promise<void> {
    this.showStatus('Clearing all...');
    this.drawingCanvas.clearAll();
    await this.objectManager.clearAll();
    this.hideStatus();
    this.updateObjectCounter();
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const deltaTime = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 0.016;
    this.lastFrameTime = now;

    // Update 3D objects
    this.objectManager.update(deltaTime, now / 1000);

    // Render 3D scene
    this.scene3D.render();

    // Render drawing canvas
    this.drawingCanvas.render();

    // Render hand visualization
    const gestureState = this.lastGestureState || {
      current: 'none' as const,
      previous: 'none' as const,
      duration: 0,
      velocity: { x: 0, y: 0 },
      confidence: 0
    };
    this.handVisualizer.render(
      this.currentLandmarks,
      gestureState,
      COLOR_ARRAY[this.currentColorIndex],
      deltaTime
    );
  }

  private showStatus(message: string, duration?: number): void {
    this.statusMessage.textContent = message;
    this.statusMessage.classList.add('visible');

    if (duration) {
      setTimeout(() => this.hideStatus(), duration);
    }
  }

  private hideStatus(): void {
    this.statusMessage.classList.remove('visible');
  }

  private updateColorIndicator(): void {
    this.colorIndicator.style.backgroundColor = COLOR_ARRAY[this.currentColorIndex];
  }

  private updateObjectCounter(): void {
    const count = this.objectManager.getObjectCount();
    this.objectCounter.textContent = `Objects: ${count}/10`;
  }
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new AirCanvas();
});
