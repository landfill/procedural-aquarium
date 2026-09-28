import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

function randomGenerator(seed) { return ()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;}; }
export const sandHeight=(x,z)=>.13+.016*Math.sin(x*3+z*4)+.011*Math.cos(x*7-z*5)+.03*(z+1.3);
const noiseGLSL=/* glsl */`
float hash3(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float stoneNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;
export function texturedMaterial(color,kind,optics) {
  const mat=new THREE.MeshStandardMaterial({color,roughness:kind==='sand'?.95:.89,metalness:0});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vNatural;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNatural=position;');
    shader.fragmentShader='varying vec3 vNatural;\n'+noiseGLSL+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float coarse=stoneNoise(vNatural*${kind==='sand'?'3.0':'4.0'});
      float detail=stoneNoise(vNatural*38.0);
      float grain=hash3(floor(vNatural*${kind==='sand'?'780.0':'165.0'}));
      diffuseColor.rgb*=0.70+coarse*0.35+detail*0.2+(grain-0.5)*0.10;
      ${kind==='rock'?'float vein=sin(vNatural.y*22.0+coarse*9.0);diffuseColor.rgb*=0.86+smoothstep(-0.3,0.3,vein)*0.14;':''}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      normal=normalize(normal+vec3(dFdx(detail),dFdy(detail),0.0)*0.35);`);
  };
  mat.customProgramCacheKey=()=>`natural-${kind}`;
  return optics?optics.lightMaterial(mat):mat;
}
function makeLeaf(length,width,curve,rng) {
  const pos=[],uv=[],idx=[];const steps=12;
  for(let i=0;i<=steps;i++){const t=i/steps;const w=Math.sin(Math.PI*t)*width;
    for(let side=-1;side<=1;side++){pos.push(side*w,t*length,curve*t*t+Math.abs(side)*w*.25+Math.sin(t*8)*.015);uv.push((side+1)/2,t);}
    if(i<steps)for(let side=0;side<2;side++){const a=i*3+side;idx.push(a,a+3,a+1,a+1,a+3,a+4);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();return geo;
}
export function buildHabitat(scene,optics) {
  const rng=randomGenerator(5091),plants=[],rockGroups=[];
  const sandGeo=new THREE.PlaneGeometry(6.34,3.54,95,40);sandGeo.rotateX(-Math.PI/2);
  const verts=sandGeo.attributes.position;
  for(let i=0;i<verts.count;i++){const x=verts.getX(i),z=verts.getZ(i);verts.setY(i,sandHeight(x,z));}sandGeo.computeVertexNormals();
  const sand=new THREE.Mesh(sandGeo,texturedMaterial(0x9c9d86,'sand',optics));sand.receiveShadow=true;scene.add(sand);
  const substrate=new THREE.Mesh(new THREE.BoxGeometry(6.34,.14,3.54),texturedMaterial(0xb1a48b,'sand',optics));substrate.position.y=.04;scene.add(substrate);
  const rockMaterial=texturedMaterial(0x74776b,'rock',optics);
  const locations=[[-2.05,.10,-.35,.71,.82,.51],[-1.50,.11,-.64,.40,.52,.43],[-2.5,.10,.35,.42,.30,.34],[1.69,.12,-.38,.63,.48,.40],[2.30,.12,-.07,.35,.63,.4],[1.24,.12,-.65,.32,.25,.29]];
  for(const [x,y,z,sx,sy,sz] of locations){
    const geo=mergeVertices(new THREE.IcosahedronGeometry(1,4)),v=geo.attributes.position;
    for(let i=0;i<v.count;i++){const px=v.getX(i),py=v.getY(i),pz=v.getZ(i);const r=1+.11*Math.sin(px*8+pz*5)*Math.cos(py*9)+.07*Math.sin(pz*17+px*6);v.setXYZ(i,px*r,py*r,pz*r);}geo.computeVertexNormals();
    const rock=new THREE.Mesh(geo,rockMaterial);rock.position.set(x,y+sy*.5,z);rock.scale.set(sx,sy,sz);rock.rotation.set(.12,.5+x*.45,.1);rock.castShadow=true;rock.receiveShadow=true;scene.add(rock);rockGroups.push(rock);
  }
  const pebbleGeo=new THREE.IcosahedronGeometry(1,1),pebbleMat=texturedMaterial(0x9e9780,'rock',optics),pebbles=new THREE.InstancedMesh(pebbleGeo,pebbleMat,340);
  const temp=new THREE.Object3D();
  for(let i=0;i<340;i++){const s=.009+rng()*.025;temp.position.set((rng()-.5)*6.2,.165+rng()*.035,(rng()-.5)*3.45);temp.scale.set(s*(1+rng()),s*.5,s);temp.rotation.set(rng()*3,rng()*6,rng()*3);temp.updateMatrix();pebbles.setMatrixAt(i,temp.matrix);pebbles.setColorAt(i,new THREE.Color().setHSL(.10+rng()*.1,.1+rng()*.12,.35+rng()*.35));}pebbles.receiveShadow=true;scene.add(pebbles);
  function addPlant(index,position) {
    const {x,z}=position,group=new THREE.Group();group.position.set(x,sandHeight(x,z),z);scene.add(group);
    const leaves=[],color=new THREE.Color().setHSL(.27+rng()*.075,.58,.12+rng()*.07);
    const mat=new THREE.MeshPhysicalMaterial({color,roughness:.59,side:THREE.DoubleSide,metalness:.03});
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float vein=1.0-smoothstep(0.012,0.04,abs(vUv.x-0.5));
      float ribs=pow(abs(sin(vUv.y*85.0+abs(vUv.x-0.5)*16.0)),12.0);
      diffuseColor.rgb*=0.7+vUv.y*0.4+vein*0.21+ribs*0.10;`);};
    // UV is enabled explicitly because leaf veins are procedural, without a map.
    mat.defines={USE_UV:''};optics.lightMaterial(mat,{strength:.8});
    for(let j=0;j<17;j++){
      const length=.50+rng()*(index%2?1.7:1.15),width=.035+rng()*.067;
      const leaf=new THREE.Mesh(makeLeaf(length,width,.08+rng()*.35,rng),mat);leaf.rotation.set((rng()-.5)*.7,rng()*Math.PI*2,(rng()-.5)*.8);leaf.position.set((rng()-.5)*.23,0,(rng()-.5)*.22);leaf.receiveShadow=true;leaf.castShadow=true;group.add(leaf);leaves.push({mesh:leaf,rz:leaf.rotation.z,rx:leaf.rotation.x,phase:rng()*6});
    }
    plants.push({group,leaves});
  }
  return {plants,sand,rocks:rockGroups,update(time,positions){while(plants.length<positions.length)addPlant(plants.length,positions[plants.length]);for(let i=0;i<plants.length;i++){const p=plants[i],position=positions[i];p.group.position.set(position.x,sandHeight(position.x,position.z),position.z);for(const l of p.leaves){l.mesh.rotation.z=l.rz+Math.sin(time*.6+l.phase)*.045;l.mesh.rotation.x=l.rx+Math.cos(time*.47+l.phase)*.035;}}}};
}

