import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Text } from '@react-three/drei';
import { ContainerConfig, CargoItem } from '../types';
import { CargoBox } from './CargoBox';
import * as THREE from 'three';
import { translations, Language } from '../utils/i18n';

interface SceneProps {
  container: ContainerConfig;
  items: CargoItem[];
  showLabels?: boolean;
  cameraLocked?: boolean;
  isItemDragging: boolean;
  onItemDragStateChange: (isDragging: boolean) => void;
  onSelectItem: (id: string) => void;
  onUpdateItem: (id: string, pos: [number, number, number]) => void;
  lang: Language;
}

export const Scene: React.FC<SceneProps> = ({ 
  container, 
  items, 
  showLabels = false, 
  cameraLocked = false,
  isItemDragging,
  onItemDragStateChange,
  onSelectItem, 
  onUpdateItem,
  lang
}) => {
  const t = translations[lang];

  // Container wireframe points
  const { length: l, height: h, width: w } = container;
  
  // Create a line geometry for the container
  const ContainerFrame = () => {
    return (
      <group>
        {/* Floor */}
        <mesh position={[l/2, 0, w/2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[l, w]} />
          <meshBasicMaterial color="#374151" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
        
        {/* Wireframe Box */}
        <lineSegments position={[l/2, h/2, w/2]}>
          <edgesGeometry args={[new THREE.BoxGeometry(l, h, w)]} />
          <lineBasicMaterial color="#ffffff" linewidth={2} />
        </lineSegments>

        {/* Walls (semi-transparent for context) */}
        {/* Back Wall (Width x Height) at x=0 */}
        <mesh position={[0, h/2, w/2]} rotation={[0, Math.PI/2, 0]}>
           <planeGeometry args={[w, h]} />
           <meshBasicMaterial color="#9ca3af" transparent opacity={0.1} side={THREE.DoubleSide} />
        </mesh>
         {/* Side Wall (Length x Height) at z=0 */}
         <mesh position={[l/2, h/2, 0]}>
           <planeGeometry args={[l, h]} />
           <meshBasicMaterial color="#9ca3af" transparent opacity={0.1} side={THREE.DoubleSide} />
        </mesh>

        {/* Labels for Container Sides */}
        <Text position={[l/2, -200, w + 200]} rotation={[-Math.PI/2, 0, 0]} fontSize={400} color="gray">
           {t.containerLabel}
        </Text>
      </group>
    );
  };

  return (
    <Canvas
      shadows
      camera={{ position: [-4000, 4000, 8000], fov: 45, near: 10, far: 50000 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#1f2937']} />
      
      <ambientLight intensity={0.5} />
      <directionalLight position={[5000, 10000, 2000]} intensity={1.5} castShadow />
      <pointLight position={[0, 2000, 0]} intensity={0.5} />

      <group position={[-l/2, 0, -w/2]}>
        <ContainerFrame />
        
        {items.map(item => (
          <CargoBox 
            key={item.id} 
            item={item} 
            containerDims={container}
            allItems={items}
            showLabel={showLabels}
            onSelect={onSelectItem}
            onUpdate={onUpdateItem}
            onDragChange={onItemDragStateChange}
            lang={lang}
          />
        ))}
        
        {/* Large Grid to cover Staging Area */}
        <Grid 
          position={[l/2, -5, w + 4000]} // Shifted towards Z to cover staging
          args={[l * 2, w * 8]} 
          sectionSize={1000} 
          cellSize={200} 
          sectionColor="#4b5563" 
          cellColor="#374151" 
          infiniteGrid 
          fadeDistance={25000}
        />

        {/* Staging Area Label */}
        <Text position={[l/2, 10, w + 1500]} rotation={[-Math.PI/2, 0, 0]} fontSize={500} color="#60a5fa" fillOpacity={0.5}>
           {t.stagingArea}
        </Text>
      </group>

      {/* Disable OrbitControls if manual camera lock is ON or if an item is being dragged */}
      <OrbitControls makeDefault enabled={!cameraLocked && !isItemDragging} />
      <Environment preset="city" />
    </Canvas>
  );
};