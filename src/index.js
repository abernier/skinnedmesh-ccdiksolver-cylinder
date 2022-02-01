import "./styles.css";
import * as THREE from "three";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";

const _matrix = new Matrix4();
const _vector = new Vector3();
function getPosition(bone, matrixWorldInv) {
  return _vector
    .setFromMatrixPosition(bone.matrixWorld)
    .applyMatrix4(matrixWorldInv);
}
function setPositionOfBoneToAttributeArray(array, index, bone, matrixWorldInv) {
  const v = getPosition(bone, matrixWorldInv);

  array[index * 3 + 0] = v.x;
  array[index * 3 + 1] = v.y;
  array[index * 3 + 2] = v.z;
}
class CCDIKHelper extends Object3D {
  constructor(mesh, iks = []) {
    super();

    this.root = mesh;
    this.iks = iks;

    this.matrix.copy(mesh.matrixWorld);
    this.matrixAutoUpdate = false;

    this.sphereGeometry = new SphereGeometry(0.25, 16, 8);

    this.targetSphereMaterial = new MeshBasicMaterial({
      color: new Color(0xff8888),
      depthTest: false,
      depthWrite: false,
      transparent: true
    });

    this.effectorSphereMaterial = new MeshBasicMaterial({
      color: new Color(0x88ff88),
      depthTest: false,
      depthWrite: false,
      transparent: true
    });

    this.linkSphereMaterial = new MeshBasicMaterial({
      color: new Color(0x8888ff),
      depthTest: false,
      depthWrite: false,
      transparent: true
    });

    this.lineMaterial = new LineBasicMaterial({
      color: new Color(0xff0000),
      depthTest: false,
      depthWrite: false,
      transparent: true
    });

    this._init();
  }

  /**
   * Updates IK bones visualization.
   */
  updateMatrixWorld(force) {
    const mesh = this.root;

    if (this.visible) {
      let offset = 0;

      const iks = this.iks;
      const bones = mesh.skeleton.bones;

      _matrix.copy(mesh.matrixWorld).invert();

      for (let i = 0, il = iks.length; i < il; i++) {
        const ik = iks[i];

        const targetBone = bones[ik.target];
        const effectorBone = bones[ik.effector];

        const targetMesh = this.children[offset++];
        const effectorMesh = this.children[offset++];

        targetMesh.position.copy(getPosition(targetBone, _matrix));
        effectorMesh.position.copy(getPosition(effectorBone, _matrix));

        for (let j = 0, jl = ik.links.length; j < jl; j++) {
          const link = ik.links[j];
          const linkBone = bones[link.index];

          const linkMesh = this.children[offset++];

          linkMesh.position.copy(getPosition(linkBone, _matrix));
        }

        const line = this.children[offset++];
        const array = line.geometry.attributes.position.array;

        setPositionOfBoneToAttributeArray(array, 0, targetBone, _matrix);
        setPositionOfBoneToAttributeArray(array, 1, effectorBone, _matrix);

        for (let j = 0, jl = ik.links.length; j < jl; j++) {
          const link = ik.links[j];
          const linkBone = bones[link.index];
          setPositionOfBoneToAttributeArray(array, j + 2, linkBone, _matrix);
        }

        line.geometry.attributes.position.needsUpdate = true;
      }
    }

    this.matrix.copy(mesh.matrixWorld);

    super.updateMatrixWorld(force);
  }

  // private method

  _init() {
    const scope = this;
    const iks = this.iks;

    function createLineGeometry(ik) {
      const geometry = new BufferGeometry();
      const vertices = new Float32Array((2 + ik.links.length) * 3);
      geometry.setAttribute("position", new BufferAttribute(vertices, 3));

      return geometry;
    }

    function createTargetMesh() {
      return new Mesh(scope.sphereGeometry, scope.targetSphereMaterial);
    }

    function createEffectorMesh() {
      return new Mesh(scope.sphereGeometry, scope.effectorSphereMaterial);
    }

    function createLinkMesh() {
      return new Mesh(scope.sphereGeometry, scope.linkSphereMaterial);
    }

    function createLine(ik) {
      return new Line(createLineGeometry(ik), scope.lineMaterial);
    }

    for (let i = 0, il = iks.length; i < il; i++) {
      const ik = iks[i];

      this.add(createTargetMesh());
      this.add(createEffectorMesh());

      for (let j = 0, jl = ik.links.length; j < jl; j++) {
        this.add(createLinkMesh());
      }

      this.add(createLine(ik));
    }
  }
}

console.clear();
window.THREE = THREE;

let gui;
const state = {};

let container;
let camera, scene, renderer;

let mesh,
  bones = [],
  skeletonHelper;
let IKSolver;

async function init() {
  container = document.createElement("div");
  document.body.appendChild(container);

  gui = new GUI();

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    200
  );
  camera.position.z = 30;
  camera.position.y = 30;

  // const ambientLight = new THREE.AmbientLight(0xffffff);
  // ambientLight.position.set(0.5, 1, 0.25);
  // scene.add(ambientLight);

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  renderer = window.renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });
  onWindowResize();
  container.appendChild(renderer.domElement);

  const gridHelper = new THREE.GridHelper(10, 10);
  scene.add(gridHelper);

  let controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 1;
  controls.maxDistance = 10500;

  window.addEventListener("resize", onWindowResize);

  renderer.setAnimationLoop(render);
}
init();

function onWindowResize() {
  renderer.setPixelRatio(window.devicePixelRatio);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

//

function render(timestamp, frame) {
  if (bones.length >= 6) {
    // mesh.skeleton.bones[1].position.x += 0.01;
    // mesh.skeleton.bones[5].position.z += 0.01 * Math.cos(timestamp / 1000);
  }
  IKSolver?.update();

  renderer.render(scene, camera);
}

//
// thenInit ---------
//

function thenInit() {
  const segmentHeight = 8;
  const segmentCount = 3;
  const height = segmentHeight * segmentCount;
  const halfHeight = height * 0.5;

  const sizing = {
    segmentHeight,
    segmentCount,
    height,
    halfHeight
  };

  function createGeometry() {
    const geometry = new THREE.CylinderGeometry(
      5, // radiusTop
      5, // radiusBottom
      sizing.height, // height
      8, // radiusSegments
      sizing.segmentCount * 1, // heightSegments
      true // openEnded
    );

    const position = geometry.attributes.position;
    console.log("position", position);

    const vertex = new THREE.Vector3();

    //
    // skin weights/indices
    //
    // see https://github.com/mrdoob/three.js/pull/7719/files
    const skinIndices = [];
    const skinWeights = [];

    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      // console.log("v", vertex);

      const y = vertex.y + sizing.halfHeight;

      const skinIndex = Math.floor(y / sizing.segmentHeight);
      const skinWeight = (y % sizing.segmentHeight) / sizing.segmentHeight;

      skinIndices.push(skinIndex, skinIndex + 1, 0, 0);
      skinWeights.push(1 - skinWeight, skinWeight, 0, 0);
    }

    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(skinIndices, 4)
    );
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(skinWeights, 4)
    );

    return geometry;
  }

  function createBones() {
    let rootBone = new THREE.Bone();
    rootBone.name = "root bone";
    rootBone.position.y = -sizing.halfHeight;
    bones.push(rootBone);

    let prevBone = new THREE.Bone();
    prevBone.name = "bone0";
    prevBone.position.y = 0;
    rootBone.add(prevBone);
    bones.push(prevBone);

    for (let i = 0; i < sizing.segmentCount; i++) {
      const bone = new THREE.Bone();
      bone.position.y = sizing.segmentHeight;
      bones.push(bone);
      bone.name = `bone${i + 1}`;
      prevBone.add(bone);
      prevBone = bone;
    }

    const targetBone = new THREE.Bone();
    targetBone.name = "target bone";
    targetBone.position.y = 33;
    rootBone.add(targetBone);
    bones.push(targetBone);

    return bones;
  }

  function createMesh(geometry, bones) {
    const material = new THREE.MeshPhongMaterial({
      color: 0x156289,
      emissive: 0x072534,
      side: THREE.DoubleSide,
      flatShading: true,
      wireframe: true
    });

    const mesh = new THREE.SkinnedMesh(geometry, material);
    const skeleton = new THREE.Skeleton(bones);

    mesh.add(bones[0]);

    mesh.bind(skeleton);

    // skeletonHelper = new THREE.SkeletonHelper(mesh);
    // skeletonHelper.material.linewidth = 2;
    // scene.add(skeletonHelper);

    return mesh;
  }

  function setupDatGui() {
    let folder = gui.addFolder("General Options");

    const bones = mesh.skeleton.bones;

    bones
      .filter((bone) => bone.name === "target bone")
      .forEach(function (bone) {
        folder = gui.addFolder(bone.name);

        const delta = sizing.height;

        folder.add(
          bone.position,
          "x",
          -delta + bone.position.x,
          delta + bone.position.x
        );
        folder.add(
          bone.position,
          "y",
          -delta + bone.position.y,
          delta + bone.position.y
        );
        folder.add(
          bone.position,
          "z",
          -delta + bone.position.z,
          delta + bone.position.z
        );

        // folder.add(bone.rotation, "x", -Math.PI * 0.5, Math.PI * 0.5);
        // folder.add(bone.rotation, "y", -Math.PI * 0.5, Math.PI * 0.5);
        // folder.add(bone.rotation, "z", -Math.PI * 0.5, Math.PI * 0.5);

        // folder.add(bone.scale, "x", 0, 2);
        // folder.add(bone.scale, "y", 0, 2);
        // folder.add(bone.scale, "z", 0, 2);

        folder.controllers[0].name("position.x");
        folder.controllers[1].name("position.y");
        folder.controllers[2].name("position.z");

        // folder.controllers[3].name("rotation.x");
        // folder.controllers[4].name("rotation.y");
        // folder.controllers[5].name("rotation.z");

        // folder.controllers[6].name("scale.x");
        // folder.controllers[7].name("scale.y");
        // folder.controllers[8].name("scale.z");
      });

    folder.add(mesh, "pose");

    folder.add(IKSolver, "update");
  }

  const geometry = createGeometry();
  bones = createBones();
  mesh = createMesh(geometry, bones);
  // mesh.position.y = sizing.height / 2;

  mesh.scale.multiplyScalar(1);
  scene.add(mesh);

  console.log("bones", mesh.skeleton.bones);
  const iks = [
    {
      target: 5,
      effector: 4,
      links: [{ index: 3 }, { index: 2 }, { index: 1 }],
      iteration: 15
      // minAngle: 0,
      // maxAngle: 1
    }
  ];
  IKSolver = new CCDIKSolver(mesh, iks);
  window.IKSolver = IKSolver;
  scene.add(new CCDIKHelper(mesh, iks));

  setupDatGui();
}

thenInit();
