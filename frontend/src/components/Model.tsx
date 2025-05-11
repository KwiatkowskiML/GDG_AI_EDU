// src/components/Model.tsx
import React, { Suspense, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber"; // Added useFrame
import { useGLTF, Html, Stats } from "@react-three/drei";
// import GUI from 'lil-gui'; // Removed lil-gui
import * as THREE from "three";

const MODEL_PATH = "/avatar.glb"; // Ensure this is in public/avatar.glb

// Interface for the animation controller props
interface MouthAnimationControllerProps {
  blendshapeMesh: THREE.Mesh | THREE.SkinnedMesh | null;
  talking: boolean; // To start/stop animation
}

// Component to handle mouth animation
function MouthAnimationController({
  blendshapeMesh,
  talking,
}: MouthAnimationControllerProps) {
  const openCloseSpeed = 0.05; // How fast the mouth opens/closes
  const maxOpen = 0.8; // How much the mouth opens (0 to 1)
  let currentOpen = 0;
  let direction = 1; // 1 for opening, -1 for closing

  useFrame(() => {
    if (
      !talking ||
      !blendshapeMesh ||
      !blendshapeMesh.morphTargetDictionary ||
      !(blendshapeMesh as any).morphTargetInfluences
    ) {
      // If not talking or mesh not ready, ensure mouth is closed (or at its base state)
      if (
        blendshapeMesh &&
        blendshapeMesh.morphTargetDictionary &&
        (blendshapeMesh as any).morphTargetInfluences
      ) {
        const mouthOpenIndex =
          blendshapeMesh.morphTargetDictionary["mouthOpen"]; // Common name
        const jawOpenIndex = blendshapeMesh.morphTargetDictionary["jawOpen"]; // Another common name
        const influences = (blendshapeMesh as any)
          .morphTargetInfluences as number[];
        if (mouthOpenIndex !== undefined && influences[mouthOpenIndex] !== 0)
          influences[mouthOpenIndex] = 0;
        if (jawOpenIndex !== undefined && influences[jawOpenIndex] !== 0)
          influences[jawOpenIndex] = 0;
      }
      currentOpen = 0; // Reset animation state
      direction = 1;
      return;
    }

    // Find the index for 'mouthOpen' or 'jawOpen' blendshape
    // You might need to adjust these names based on your model's actual blendshape names
    const mouthOpenIndex = blendshapeMesh.morphTargetDictionary["mouthOpen"];
    const jawOpenIndex = blendshapeMesh.morphTargetDictionary["jawOpen"]; // Ready Player Me uses jawOpen
    const targetIndex =
      jawOpenIndex !== undefined ? jawOpenIndex : mouthOpenIndex;

    if (targetIndex === undefined) {
      // console.warn("Blendshape 'mouthOpen' or 'jawOpen' not found on the model for animation.");
      return;
    }

    const influences = (blendshapeMesh as any)
      .morphTargetInfluences as number[];

    // Animate
    currentOpen += openCloseSpeed * direction;

    if (currentOpen >= maxOpen) {
      currentOpen = maxOpen;
      direction = -1; // Start closing
    } else if (currentOpen <= 0) {
      currentOpen = 0;
      direction = 1; // Start opening
      // Optional: Add a slight pause when closed by skipping a few frames or using a timer
    }

    influences[targetIndex] = currentOpen;
  });

  return null; // This component doesn't render anything itself
}

interface LoadedModelProps {
  modelUrl: string;
  onGltfRootLoad: (gltfRootGroup: THREE.Group) => void;
  onMeshIdentified: (mesh: THREE.Mesh | THREE.SkinnedMesh) => void;
}

function LoadedModel({
  modelUrl,
  onGltfRootLoad,
  onMeshIdentified,
}: LoadedModelProps) {
  const { scene: gltfRoot, parser } = useGLTF(modelUrl);
  const [identifiedMesh, setIdentifiedMesh] = useState<
    THREE.Mesh | THREE.SkinnedMesh | null
  >(null);

  useEffect(() => {
    if (gltfRoot) {
      gltfRoot.scale.setScalar(10);
      gltfRoot.position.y = -17;
      gltfRoot.rotation.x = -0.2;
      onGltfRootLoad(gltfRoot);
    }
  }, [gltfRoot, onGltfRootLoad]);

  useEffect(() => {
    if (!gltfRoot || !parser) return;
    let bestMatch: THREE.Mesh | THREE.SkinnedMesh | null = null;
    const priorityMeshNames = [
      "Wolf3D_Head",
      "Wolf3D_Avatar",
      "RPM_Head",
      "RPM_Avatar",
      "head",
      "face",
    ];
    let firstSkinnedMeshWithMorphs: THREE.SkinnedMesh | null = null;
    let firstMeshWithMorphs: THREE.Mesh | null = null;
    gltfRoot.traverse((child) => {
      const node = child as any;
      if (node.morphTargetDictionary) {
        if (node.isSkinnedMesh) {
          if (
            priorityMeshNames.some((name) =>
              node.name.toLowerCase().includes(name.toLowerCase())
            )
          ) {
            if (
              !bestMatch ||
              (bestMatch.name && bestMatch.name.toLowerCase().includes("teeth"))
            ) {
              bestMatch = node as THREE.SkinnedMesh;
            }
          }
          if (!firstSkinnedMeshWithMorphs)
            firstSkinnedMeshWithMorphs = node as THREE.SkinnedMesh;
        } else if (node.isMesh) {
          if (
            priorityMeshNames.some((name) =>
              node.name.toLowerCase().includes(name.toLowerCase())
            )
          ) {
            if (!bestMatch) bestMatch = node as THREE.Mesh;
          }
          if (!firstMeshWithMorphs) firstMeshWithMorphs = node as THREE.Mesh;
        }
      }
    });
    if (bestMatch) setIdentifiedMesh(bestMatch);
    else if (firstSkinnedMeshWithMorphs)
      setIdentifiedMesh(firstSkinnedMeshWithMorphs);
    else if (firstMeshWithMorphs) setIdentifiedMesh(firstMeshWithMorphs);
    else {
      console.warn(
        "No suitable mesh with morph targets found in the model."
      ); /* ... */
    }
  }, [gltfRoot, parser]);

  useEffect(() => {
    if (identifiedMesh) {
      // console.log(`Using mesh "${identifiedMesh.name}" for blendshapes.`);
      onMeshIdentified(identifiedMesh);
    }
  }, [identifiedMesh, onMeshIdentified]);

  useEffect(() => {
    if (
      identifiedMesh &&
      identifiedMesh.morphTargetDictionary &&
      !identifiedMesh.morphTargetInfluences
    ) {
      const numMorphs = Object.keys(
        identifiedMesh.morphTargetDictionary
      ).length;
      (identifiedMesh as any).morphTargetInfluences = new Array(numMorphs).fill(
        0
      );
    }
  }, [identifiedMesh]);

  return <primitive object={gltfRoot} dispose={null} />;
}

interface ModelProps {
  isPlayingServerAudio: boolean; // New prop to control animation
}

const Model: React.FC<ModelProps> = ({ isPlayingServerAudio }) => {
  const [blendshapeMesh, setBlendshapeMesh] = useState<
    THREE.Mesh | THREE.SkinnedMesh | null
  >(null);
  // const [isTalking, setIsTalking] = useState(true);

  const cameraPosition: [number, number, number] = [0, 1.0, 7.5];
  const cameraFov = 30;

  return (
    <div className="w-full h-full relative bg-transparent">
      {" "}
      {/* Ensured transparent bg */}
      <Canvas
        camera={{ position: cameraPosition, fov: cameraFov }}
        shadows
        gl={{
          antialias: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          alpha: true, // Crucial for transparent background
        }}
        style={{ background: "transparent" }} // Redundant if div is transparent but safe
        onCreated={({ camera, scene }) => {
          // Ensure canvas background is also transparent IF needed, usually R3F handles this with gl.alpha=true
          // scene.background = null; // Only if you explicitly set a scene background earlier
          camera.lookAt(0, 0, 0); // Adjust lookAt target based on your model's center
          camera.updateProjectionMatrix();
        }}
      >
        <ambientLight intensity={1.5} /> {/* Slightly increased */}
        <directionalLight
          castShadow
          position={[5, 8, 10]}
          intensity={2.0} // Slightly increased
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={30} // Adjusted to be a bit tighter if model isn't huge
          shadow-camera-left={-10} // Adjusted
          shadow-camera-top={10} // Adjusted
          shadow-camera-right={10} // Adjusted
          shadow-camera-bottom={-10} // Adjusted
        />
        <Suspense
          fallback={
            <Html center>
              <div className="text-slate-700 text-lg font-medium p-4 bg-white/50 rounded-lg backdrop-blur-sm">
                Loading Avatar...
              </div>
            </Html>
          }
        >
          <LoadedModel
            modelUrl={MODEL_PATH}
            onGltfRootLoad={() => {}}
            onMeshIdentified={setBlendshapeMesh}
          />
          {blendshapeMesh && (
            <MouthAnimationController
              blendshapeMesh={blendshapeMesh}
              talking={isPlayingServerAudio}
            />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
};

export default Model;
