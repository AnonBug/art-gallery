import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {assetPath} from './asset-path.mjs';
import data from './data/sculptures.json';

export const sculptures=data.map(s=>({...s,model:assetPath(s.model,import.meta.env.BASE_URL)}));
export type Sculpture=typeof sculptures[number];
export function sculptureFor(id:string){const s=sculptures.find(s=>s.id===id);if(!s)throw new Error(`Unknown sculpture: ${id}`);return s;}
const cache=new Map<string,Promise<THREE.Group>>();
const listeners=new Map<string,Set<(loaded:number,total:number)=>void>>();

/** One immutable, centred asset shared by hall and inspection viewer. No runtime CDN. */
export function loadSculpture(id:string,onProgress?:(loaded:number,total:number)=>void){
 const sculpture=sculptureFor(id);
 const progressListeners=listeners.get(id)??new Set<(loaded:number,total:number)=>void>();listeners.set(id,progressListeners);
 if(onProgress)progressListeners.add(onProgress);
 if(!cache.has(id)){
  const draco=new DRACOLoader();draco.setDecoderPath(assetPath('/assets/draco/',import.meta.env.BASE_URL));draco.setWorkerLimit(2);
  const loader=new GLTFLoader();loader.setDRACOLoader(draco);
  const promise=new Promise<THREE.Group>((resolve,reject)=>{
   loader.load(sculpture.model,gltf=>{
    const group=new THREE.Group(),model=gltf.scene;group.add(model);
    const stone=new THREE.MeshStandardMaterial({color:0xe9dfcc,roughness:.78,metalness:0});
    model.traverse(object=>{if(object instanceof THREE.Mesh){if(!gltf.parser.json.materials?.length)object.material=stone;object.geometry.computeBoundingSphere();}});
    // GLB is Y-up. Centre horizontally and place its lowest point on the pedestal.
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=sculpture.height/size.y;model.scale.multiplyScalar(scale);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
    group.name=id;group.userData={height:sculpture.height};resolve(group);
   },event=>{for(const listener of progressListeners)listener(event.loaded,event.total||sculpture.bytes);},reject);
  }).catch(error=>{cache.delete(id);throw error;}).finally(()=>{draco.dispose();progressListeners.clear();});
  cache.set(id,promise);
 }
 return cache.get(id)!.finally(()=>{if(onProgress)progressListeners.delete(onProgress);});
}
