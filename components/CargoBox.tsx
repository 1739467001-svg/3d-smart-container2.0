
import React, { useState, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import { CargoItem, Dimensions } from '../types';
import { checkCollisionWithCoords, getSnappingPosition } from '../utils/packingAlgorithm';
import { translations, Language } from '../utils/i18n';

interface CargoBoxProps {
  item: CargoItem;
  containerDims: Dimensions;
  allItems: CargoItem[];
  showLabel?: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, newPos: [number, number, number]) => void;
  onDragChange: (isDragging: boolean) => void;
  lang: Language;
}

export const CargoBox: React.FC<CargoBoxProps> = ({ 
  item, 
  containerDims, 
  allItems, 
  showLabel = false,
  onSelect, 
  onUpdate,
  onDragChange,
  lang
}) => {
  const { camera, raycaster, gl } = useThree();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const t = translations[lang];
  const groupRef = useRef<THREE.Group>(null);
  const coordTextRef = useRef<any>(null); 
  
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)); 
  const dragOffset = useRef(new THREE.Vector3());
  
  const centerX = item.position[0] + item.dimensions.length / 2;
  const centerY = item.position[1] + item.dimensions.height / 2;
  const centerZ = item.position[2] + item.dimensions.width / 2;

  useFrame(() => {
    if (groupRef.current) {
        groupRef.current.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                const baseColor = isDragging ? '#fbbf24' : item.color;
                child.material.color.set(baseColor);
                child.material.emissive.set(isHovered || item.selected ? '#ffffff' : '#000000');
                child.material.emissiveIntensity = isHovered || item.selected ? 0.2 : 0;
                child.material.roughness = 0.4;
                child.material.metalness = 0.2;
            }
        });
    }

    if (isDragging && groupRef.current && coordTextRef.current) {
        const x = groupRef.current.position.x - item.dimensions.length / 2;
        const y = groupRef.current.position.y - item.dimensions.height / 2;
        const z = groupRef.current.position.z - item.dimensions.width / 2;
        coordTextRef.current.text = `POS: ${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}`;
    }
  });

  const handlePointerDown = (e: any) => {
    e.stopPropagation(); 
    e.target.setPointerCapture(e.pointerId);
    onSelect(item.id);
    setIsDragging(true);
    onDragChange(true); 

    if (groupRef.current) {
        dragOffset.current.copy(e.point).sub(groupRef.current.position);
    }

    if (e.shiftKey) {
        const normal = new THREE.Vector3();
        camera.getWorldDirection(normal);
        normal.y = 0; 
        normal.normalize();
        dragPlane.current.setFromNormalAndCoplanarPoint(normal, e.point);
    } else {
        const currentCenterY = item.position[1] + item.dimensions.height / 2;
        dragPlane.current.set(new THREE.Vector3(0, 1, 0), -currentCenterY);
    }
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging) return;
    e.stopPropagation();

    raycaster.setFromCamera(new THREE.Vector2(
        (e.clientX / gl.domElement.clientWidth) * 2 - 1,
        -(e.clientY / gl.domElement.clientHeight) * 2 + 1
    ), camera);

    const targetPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, targetPoint);

    if (targetPoint) {
        const rawCenter = new THREE.Vector3().copy(targetPoint).sub(dragOffset.current);
        let rawCornerX = rawCenter.x - item.dimensions.length / 2;
        let rawCornerY = rawCenter.y - item.dimensions.height / 2;
        let rawCornerZ = rawCenter.z - item.dimensions.width / 2;

        if (e.shiftKey) {
            rawCornerX = item.position[0];
            rawCornerZ = item.position[2];
        } else {
            rawCornerY = item.position[1]; 
        }

        const snap = 5;
        let candidateX = Math.round(rawCornerX / snap) * snap;
        let candidateY = Math.round(rawCornerY / snap) * snap;
        let candidateZ = Math.round(rawCornerZ / snap) * snap;

        const [snappedX, snappedY, snappedZ] = getSnappingPosition(
            [candidateX, candidateY, candidateZ], 
            item.dimensions, 
            allItems, 
            item.id,
            150
        );

        const checkValid = (x: number, y: number, z: number) => {
            return !checkCollisionWithCoords({ x, y, z, l: item.dimensions.length, h: item.dimensions.height, w: item.dimensions.width, id: item.id }, allItems, containerDims);
        };

        let finalPos: [number, number, number] | null = checkValid(snappedX, snappedY, snappedZ) ? [snappedX, snappedY, snappedZ] : null;

        if (!finalPos && !e.shiftKey) {
             finalPos = checkValid(snappedX, item.position[1], item.position[2]) ? [snappedX, item.position[1], item.position[2]] : null;
             if (!finalPos) finalPos = checkValid(item.position[0], item.position[1], snappedZ) ? [item.position[0], item.position[1], snappedZ] : null;
        }

        if (finalPos && groupRef.current) {
            groupRef.current.position.set(
                finalPos[0] + item.dimensions.length / 2,
                finalPos[1] + item.dimensions.height / 2,
                finalPos[2] + item.dimensions.width / 2
            );
        }
    }
  };

  const handlePointerUp = (e: any) => {
    if (!isDragging) return;
    e.stopPropagation();
    e.target.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    onDragChange(false); 

    if (groupRef.current) {
        onUpdate(item.id, [
          groupRef.current.position.x - item.dimensions.length / 2,
          groupRef.current.position.y - item.dimensions.height / 2,
          groupRef.current.position.z - item.dimensions.width / 2
        ]);
    }
  };
  
  const borderColor = item.selected ? "#ffffff" : "#000000";
  
  return (
    <group>
        {isDragging && groupRef.current && (
           <group>
             <mesh position={[groupRef.current.position.x, 2, groupRef.current.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
               <planeGeometry args={[item.dimensions.length, item.dimensions.width]} />
               <meshBasicMaterial color="#3b82f6" transparent opacity={0.3} />
             </mesh>
             {groupRef.current.position.y > item.dimensions.height && (
                 <line>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" count={2} array={new Float32Array([
                            groupRef.current.position.x, groupRef.current.position.y, groupRef.current.position.z,
                            groupRef.current.position.x, 0, groupRef.current.position.z
                          ])} itemSize={3} />
                    </bufferGeometry>
                    <lineBasicMaterial color="#fbbf24" opacity={0.4} transparent />
                 </line>
             )}
           </group>
        )}

        <group
           ref={groupRef}
           position={[centerX, centerY, centerZ]}
           onPointerDown={handlePointerDown}
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
           onPointerOver={() => { document.body.style.cursor = 'grab'; setIsHovered(true); }}
           onPointerOut={() => { document.body.style.cursor = 'auto'; setIsHovered(false); }}
        >
            <mesh castShadow receiveShadow>
               <boxGeometry args={[item.dimensions.length, item.dimensions.height, item.dimensions.width]} />
               <meshStandardMaterial color={item.color} />
            </mesh>

            <lineSegments>
                <edgesGeometry args={[new THREE.BoxGeometry(item.dimensions.length, item.dimensions.height, item.dimensions.width)]} />
                <lineBasicMaterial color={borderColor} linewidth={item.selected ? 2 : 1} transparent={!item.selected} opacity={item.selected ? 1 : 0.3} />
            </lineSegments>

            {isDragging && (
                <group position={[-item.dimensions.length / 2, item.dimensions.height/2 + 300, 0]}>
                    <Text ref={coordTextRef} fontSize={280} color="#fbbf24" anchorX="left" anchorY="bottom" font="https://cdn.jsdelivr.net/npm/inter-ui@3.19.3/Inter%20(web)/Inter-Bold.woff" outlineWidth={12} outlineColor="#000">
                        {`${Math.round(item.position[0])}, ${Math.round(item.position[1])}, ${Math.round(item.position[2])}`}
                    </Text>
                </group>
            )}

          {isHovered && !isDragging && (
            <Html distanceFactor={4500} position={[0, item.dimensions.height/2 + 400, 0]}>
              <div className="bg-[#111] text-[#eee] p-5 rounded-[1.5rem] border border-blue-500/50 shadow-[0_25px_60px_rgba(0,0,0,0.8)] min-w-[240px] pointer-events-none select-none backdrop-blur-3xl">
                   <div className="text-[10px] uppercase font-black text-blue-400 mb-2 tracking-[0.3em]">{t.partDetail}</div>
                   <div className="font-black text-base mb-1 leading-none">{item.subDrawingNo || item.drawingNo}</div>
                   <div className="text-[9px] text-gray-500 font-bold mb-4 tracking-widest opacity-60">{item.drawingNo}</div>
                   <div className="flex justify-between items-center text-[11px] font-mono bg-black/50 px-4 py-3 rounded-2xl border border-white/5">
                      <span className="text-gray-400">{item.dimensions.length}×{item.dimensions.width}×{item.dimensions.height}</span>
                      <span className="text-white font-black">{item.weight}kg</span>
                   </div>
                   <div className="mt-4 text-[9px] text-gray-700 font-black uppercase tracking-widest text-center italic">
                      Hold SHIFT to adjust lift height
                   </div>
              </div>
            </Html>
          )}
        </group>
    </group>
  );
};
