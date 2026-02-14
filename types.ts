import React from 'react';

export interface Dimensions {
  length: number; // x axis in visual
  width: number;  // z axis in visual
  height: number; // y axis in visual
}

export interface ContainerConfig extends Dimensions {
  name: string;
  maxWeight: number;
}

export interface SubItem {
  id: string;
  drawingNo: string;
  subDrawingNo: string;
  dimensions: Dimensions;
  relativePosition: [number, number, number]; // Position relative to the group parent
  color: string;
  weight: number;
}

export interface CargoItem {
  id: string;
  drawingNo: string; // Main Drawing No
  subDrawingNo?: string; // Sub Drawing No (Added for individual tracking)
  dimensions: Dimensions; // The bounding box of the whole group
  position: [number, number, number]; // [x, y, z] in mm
  color: string;
  weight: number;
  selected: boolean;
  isValid: boolean; // False if colliding
  subItems?: SubItem[]; // If present, this is a composite group (now mostly unused/optional)
  isGroup?: boolean;
}

export interface ImportedRow {
  mainDrawingNo: string;
  subDrawingNo: string;
  length: number;
  width: number;
  height: number;
  quantity: number;
  weight: number;
}

// Augment the global JSX namespace to include the Three.js elements used by React Three Fiber
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Allow any element to prevent type errors for HTML and unknown R3F elements
      [elemName: string]: any;
    }
  }
}