// Screen size (CSS px) shared with screen-space fat lines (three's LineMaterial needs it
// to turn a pixel width into clip-space offsets). The viewport keeps it current on resize.
import * as THREE from 'three';
export const LINE_RESOLUTION = new THREE.Vector2(1, 1);
