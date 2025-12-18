import * as THREE from 'three';
import { SCENE } from './constants';

export class Scene3D {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private ambientLight!: THREE.AmbientLight;
  private directionalLight!: THREE.DirectionalLight;
  private clock: THREE.Clock;

  constructor(canvas: HTMLCanvasElement) {
    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      SCENE.CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      SCENE.CAMERA_NEAR,
      SCENE.CAMERA_FAR
    );
    this.camera.position.z = SCENE.CAMERA_Z;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Setup lighting
    this.setupLighting();

    // Clock for animations
    this.clock = new THREE.Clock();
  }

  private setupLighting(): void {
    // Ambient light for soft overall illumination
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambientLight);

    // Main directional light for shadows
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(5, 10, 7);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.near = 0.1;
    this.directionalLight.shadow.camera.far = 50;
    this.directionalLight.shadow.camera.left = -10;
    this.directionalLight.shadow.camera.right = 10;
    this.directionalLight.shadow.camera.top = 10;
    this.directionalLight.shadow.camera.bottom = -10;
    this.directionalLight.shadow.bias = -0.0001;
    this.scene.add(this.directionalLight);

    // Soft fill light from below
    const fillLight = new THREE.DirectionalLight(0xc9b8ff, 0.3);
    fillLight.position.set(-3, -5, 3);
    this.scene.add(fillLight);

    // Rim light for edge definition
    const rimLight = new THREE.DirectionalLight(0xffd4e5, 0.4);
    rimLight.position.set(-5, 3, -5);
    this.scene.add(rimLight);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  remove(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  getDeltaTime(): number {
    return this.clock.getDelta();
  }

  getElapsedTime(): number {
    return this.clock.getElapsedTime();
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  // Convert screen coordinates to 3D world position
  screenToWorld(screenX: number, screenY: number, z: number = 0): THREE.Vector3 {
    const vector = new THREE.Vector3();

    // Normalize screen coordinates to -1 to 1
    vector.x = (screenX / window.innerWidth) * 2 - 1;
    vector.y = -(screenY / window.innerHeight) * 2 + 1;
    vector.z = 0.5;

    // Unproject from screen to world
    vector.unproject(this.camera);

    // Calculate direction from camera
    const dir = vector.sub(this.camera.position).normalize();

    // Calculate distance to z plane
    const distance = (z - this.camera.position.z) / dir.z;

    // Calculate final position
    const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));

    return pos;
  }

  // Create a balloon-like material
  createBalloonMaterial(color: string): THREE.MeshStandardMaterial {
    const threeColor = new THREE.Color(color);

    return new THREE.MeshStandardMaterial({
      color: threeColor,
      roughness: 0.4,
      metalness: 0.0,
      envMapIntensity: 0.5,
      side: THREE.DoubleSide
    });
  }

  // Raycast to find objects at screen position
  raycastObjects(
    screenX: number,
    screenY: number,
    objects: THREE.Object3D[]
  ): THREE.Intersection[] {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );

    raycaster.setFromCamera(mouse, this.camera);
    return raycaster.intersectObjects(objects, true);
  }
}
