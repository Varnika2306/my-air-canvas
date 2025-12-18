import { HandTracker } from './handTracking';
import { GestureDetector } from './gestureDetector';
import { DrawingCanvas } from './drawingCanvas';
import { HandVisualizer } from './handVisualizer';
import { Scene3D } from './scene3D';
import { ObjectManager } from './objectManager';
import { HandLandmarks, GestureState, BalloonObject, Stroke } from './types';
import { GESTURE, TIMING } from './constants';

class AirCanvas {
  // Core components
  private handTracker: HandTracker;
  private gestureDetector: GestureDetector;
  private drawingCanvas: DrawingCanvas;
  private handVisualizer: HandVisualizer;
  private scene3D: Scene3D;
  private objectManager: ObjectManager;

  // Preview components
  private previewVideo: HTMLVideoElement;
  private previewCanvas: HTMLCanvasElement;
  private previewCtx: CanvasRenderingContext2D;

  // DOM elements
  private loadingOverlay: HTMLElement;
  private statusMessage: HTMLElement;
  private colorSwatches: NodeListOf<HTMLElement>;

  // State
  private isDrawing = false;
  private currentColor = '#FFB3BA';
  private lastGestureState: GestureState | null = null;
  private currentLandmarks: HandLandmarks | null = null;
  private palmHoldStart = 0;
  private fistHoldStart = 0;
  private handDetected = false;
  private lastFrameTime = 0;
  private grabbedObject: BalloonObject | null = null;
  private lastPinchPosition: { x: number; y: number } | null = null;

  // Mouse controls state
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private selectedObject: BalloonObject | null = null;

  constructor() {
    // Get DOM elements
    const videoElement = document.getElementById('webcam') as HTMLVideoElement;
    const sceneCanvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
    const drawCanvas = document.getElementById('draw-canvas') as HTMLCanvasElement;
    const handCanvas = document.getElementById('hand-canvas') as HTMLCanvasElement;

    // Preview elements
    this.previewVideo = document.getElementById('preview-video') as HTMLVideoElement;
    this.previewCanvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
    this.previewCtx = this.previewCanvas.getContext('2d')!;

    this.loadingOverlay = document.getElementById('loading-overlay')!;
    this.statusMessage = document.getElementById('status-message')!;
    this.colorSwatches = document.querySelectorAll('.color-swatch');

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

    // Setup event listeners
    this.setupEventListeners();

    // Start the application
    this.init();
  }

  private setupEventListeners(): void {
    // Window resize
    window.addEventListener('resize', () => this.resize());

    // Color palette clicks
    this.colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        this.colorSwatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.currentColor = swatch.dataset.color || '#FFB3BA';
      });
    });

    // Mouse controls for 3D scene
    const sceneCanvas = document.getElementById('scene-canvas')!;

    sceneCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    sceneCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    sceneCanvas.addEventListener('mouseup', () => this.onMouseUp());
    sceneCanvas.addEventListener('mouseleave', () => this.onMouseUp());
    sceneCanvas.addEventListener('wheel', (e) => this.onWheel(e));

    // Touch support
    sceneCanvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
    sceneCanvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
    sceneCanvas.addEventListener('touchend', () => this.onMouseUp());

    // Click to select objects
    sceneCanvas.addEventListener('click', (e) => this.onSceneClick(e));
  }

  private onMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    // Check if clicking on an object
    const hitObject = this.objectManager.getObjectAtPosition(e.clientX, e.clientY);
    if (hitObject) {
      this.selectedObject = hitObject;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;

    if (this.selectedObject) {
      // Rotate the selected object
      this.objectManager.rotateObject(this.selectedObject, deltaX * 0.01, deltaY * 0.01);
    } else {
      // Orbit the camera
      this.scene3D.orbitCamera(deltaX * 0.005, deltaY * 0.005);
    }

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  private onMouseUp(): void {
    this.isDragging = false;
    this.selectedObject = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.scene3D.zoomCamera(e.deltaY * 0.001);
  }

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;

      const hitObject = this.objectManager.getObjectAtPosition(
        e.touches[0].clientX,
        e.touches[0].clientY
      );
      if (hitObject) {
        this.selectedObject = hitObject;
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.isDragging || e.touches.length !== 1) return;

    const deltaX = e.touches[0].clientX - this.lastMouseX;
    const deltaY = e.touches[0].clientY - this.lastMouseY;

    if (this.selectedObject) {
      this.objectManager.rotateObject(this.selectedObject, deltaX * 0.01, deltaY * 0.01);
    } else {
      this.scene3D.orbitCamera(deltaX * 0.005, deltaY * 0.005);
    }

    this.lastMouseX = e.touches[0].clientX;
    this.lastMouseY = e.touches[0].clientY;
  }

  private onSceneClick(e: MouseEvent): void {
    const hitObject = this.objectManager.getObjectAtPosition(e.clientX, e.clientY);
    if (hitObject) {
      this.objectManager.selectObject(hitObject);
    }
  }

  private async init(): Promise<void> {
    try {
      // Start hand tracking
      await this.handTracker.start((landmarks) => this.onHandResults(landmarks));

      // Setup camera preview
      this.setupCameraPreview();

      // Hide loading overlay
      this.loadingOverlay.classList.add('hidden');

      // Start animation loop
      this.animate();
    } catch (error) {
      console.error('Failed to initialize:', error);
      this.showStatus('Camera access denied. Please allow camera access and refresh.');
    }
  }

  private setupCameraPreview(): void {
    // Get the video stream from the hand tracker and display in preview
    const webcam = document.getElementById('webcam') as HTMLVideoElement;
    if (webcam.srcObject) {
      this.previewVideo.srcObject = webcam.srcObject;
      this.previewVideo.play();
    }

    // Set preview canvas size
    this.previewCanvas.width = 280;
    this.previewCanvas.height = 210;
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

    // Render hand tracking on preview canvas
    this.renderPreviewOverlay(landmarks);

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

  private renderPreviewOverlay(landmarks: HandLandmarks | null): void {
    this.previewCtx.clearRect(0, 0, 280, 210);

    if (!landmarks) return;

    // Scale landmarks to preview size
    const scaleX = 280 / window.innerWidth;
    const scaleY = 210 / window.innerHeight;

    // Draw hand skeleton connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    this.previewCtx.strokeStyle = '#bee17d';
    this.previewCtx.lineWidth = 2;

    for (const [from, to] of connections) {
      const start = landmarks.landmarks[from];
      const end = landmarks.landmarks[to];

      this.previewCtx.beginPath();
      this.previewCtx.moveTo(start.x * scaleX, start.y * scaleY);
      this.previewCtx.lineTo(end.x * scaleX, end.y * scaleY);
      this.previewCtx.stroke();
    }

    // Draw joints
    this.previewCtx.fillStyle = '#bee17d';
    for (const lm of landmarks.landmarks) {
      this.previewCtx.beginPath();
      this.previewCtx.arc(lm.x * scaleX, lm.y * scaleY, 3, 0, Math.PI * 2);
      this.previewCtx.fill();
    }
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
        this.handlePalm();
        break;

      case 'fist':
        this.handleFist();
        break;

      case 'swipe':
        this.handleSwipe(indexTip);
        break;

      default:
        // Release grabbed object if gesture changes
        if (this.grabbedObject) {
          this.objectManager.releaseObject(this.grabbedObject);
          this.grabbedObject = null;
          this.lastPinchPosition = null;
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
      this.drawingCanvas.startStroke(position, this.currentColor);
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
        this.lastPinchPosition = pinchCenter;
      }
    } else {
      // Move and rotate grabbed object based on hand movement
      if (this.lastPinchPosition) {
        const deltaX = pinchCenter.x - this.lastPinchPosition.x;
        const deltaY = pinchCenter.y - this.lastPinchPosition.y;

        // Move the object
        this.objectManager.moveGrabbedObject(this.grabbedObject, pinchCenter.x, pinchCenter.y);

        // Rotate based on movement
        this.objectManager.rotateObject(this.grabbedObject, deltaX * 0.02, deltaY * 0.02);
      }
      this.lastPinchPosition = pinchCenter;
    }
  }

  private handlePalm(): void {
    // Release any grabbed object
    if (this.grabbedObject) {
      this.objectManager.releaseObject(this.grabbedObject);
      this.grabbedObject = null;
      this.lastPinchPosition = null;
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

  private handleFist(): void {
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
    // Clear the stroke from drawing canvas FIRST before creating 3D object
    this.drawingCanvas.removeCompletedStroke(stroke);
    this.drawingCanvas.clear();

    try {
      await this.objectManager.createFromStroke(stroke);
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
      this.currentColor,
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
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new AirCanvas();
});
