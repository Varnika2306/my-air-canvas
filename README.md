# Air Canvas

A browser-based gesture drawing experience where you draw shapes in the air using hand gestures via your webcam. Completed drawings inflate into soft, 3D balloon-like objects that float in a shared scene.

## Features

- **Gesture-Based Drawing** - Point your index finger to draw in the air
- **3D Balloon Inflation** - Completed shapes transform into puffy, floating 3D objects
- **Real-Time Hand Tracking** - Powered by MediaPipe for responsive hand detection
- **Color Palette** - Choose from 10 pastel colors for your creations
- **Interactive Objects** - Poke, grab, and rotate your balloon creations
- **Camera Preview** - See your hand tracking skeleton in real-time
- **Mouse/Touch Controls** - Orbit and zoom the 3D scene

## How It Works

1. **Draw** - Extend your index finger (keep other fingers curled) to draw
2. **Complete Shape** - Hold an open palm for 0.5 seconds to close and inflate your drawing
3. **Interact** - Pinch to grab and move objects, poke with your finger to squish them
4. **Clear** - Hold a fist for 1 second to clear all objects

## Gesture Controls

| Gesture | Action |
|---------|--------|
| Point (index finger) | Draw in the air |
| Open Palm (hold) | Close shape and inflate to 3D |
| Pinch | Grab and move objects |
| Fist (hold) | Clear all objects |
| Swipe | Remove individual object |

## Installation

```bash
# Clone the repository
git clone https://github.com/janusdesigns/air-canvas-2.git
cd air-canvas-2

# Install dependencies
npm install

# Start development server
npm run dev
```

Then open your browser to the local URL shown in the terminal (usually `http://localhost:5173`).

## Requirements

- Modern browser with WebGL support (Chrome, Firefox, Edge, Safari)
- Webcam access
- Good lighting for hand tracking

## Tech Stack

- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **Three.js** - 3D rendering and scene management
- **MediaPipe Hands** - Real-time hand tracking
- **GSAP** - Smooth animations

## Mouse/Touch Controls

- **Click + Drag** on empty space to orbit the camera
- **Click + Drag** on an object to rotate it
- **Scroll wheel** to zoom in/out
- **Touch** gestures supported on mobile

## Project Structure

```
src/
├── main.ts           # Application entry point
├── handTracking.ts   # MediaPipe hand detection
├── gestureDetector.ts # Gesture recognition logic
├── drawingCanvas.ts  # 2D stroke rendering
├── scene3D.ts        # Three.js scene setup
├── objectManager.ts  # 3D balloon creation and physics
├── handVisualizer.ts # Hand skeleton overlay
├── constants.ts      # Configuration values
└── types.ts          # TypeScript interfaces
```

## Credits

Designed by [Janus Tiu](https://www.instagram.com/janustiu/)

## License

MIT
