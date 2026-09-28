import * as THREE from 'three';

const profiles = [
  {height:.235,width:.115,length:1.0,color:0xe77916},
  {height:.29,width:.095,length:1.05,color:0x126bc1},
  {height:.345,width:.088,length:.90,color:0xf4c71c},
  {height:.30,width:.07,length:.88,color:0xbac5bf},
];
function bodyGeometry(type) {
  const p=profiles[type],points=[],uv=[],indices=[],segments=52,rings=36;
  for(let i=0;i<=segments;i++) {
    const u=i/segments, x=(u-.5)*p.length;
    // Narrow caudal peduncle, muscular middle and a tapered, blunt mouth.
    const radius=Math.pow(Math.sin(Math.PI*(.065+u*.92)),.88)*(0.6+u*.62);
    const taper=u<.2?.37+u*3.15:1;
    for(let j=0;j<=rings;j++){
      const angle=j/rings*Math.PI*2;
      const y=Math.cos(angle)*p.height*radius*taper;
      const z=Math.sin(angle)*p.width*radius*taper;
      points.push(x,y,z);uv.push(u,j/rings);
      if(i<segments&&j<rings){const a=i*(rings+1)+j,b=a+rings+1;indices.push(a,a+1,b,b,a+1,b+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function fishSkin(type,clock,lightMaterial) {
  const mat=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.38,metalness:.12,clearcoat:.55,clearcoatRoughness:.27});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.uSwim=clock;
    shader.vertexShader='uniform float uSwim; varying vec3 vFishLocal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vFishLocal=position;
      float bend=pow(clamp(-position.x+0.20,0.0,1.0),2.0);
      transformed.z+=sin(uSwim*6.5+position.x*5.0)*bend*0.14;`);
    shader.fragmentShader='varying vec3 vFishLocal;\n'+shader.fragmentShader;
    const colors=[
      `vec3 skin=mix(vec3(0.68,0.17,0.012),vec3(1.0,0.43,0.035),smoothstep(-0.2,0.15,p.y));
       float stripe=min(abs(p.x-0.27+0.09*sin(p.y*10.0)),min(abs(p.x+0.07+0.04*sin(p.y*13.0)),abs(p.x+0.4)));
       skin=mix(skin,vec3(0.055,0.035,0.02),1.0-smoothstep(0.052,0.064,stripe));
       skin=mix(skin,vec3(0.93,0.94,0.86),1.0-smoothstep(0.033,0.043,stripe));`,
      `vec3 skin=mix(vec3(0.015,0.10,0.4),vec3(0.025,0.38,0.94),smoothstep(-0.28,0.25,p.y));
       float bluePatch=pow((p.x+0.08)/0.35,2.0)+pow((p.y-0.06)/0.135,2.0);
       float inner=pow((p.x+0.08)/0.20,2.0)+pow((p.y-0.075)/0.06,2.0);
       float mark=(1.0-smoothstep(0.8,1.15,bluePatch))*smoothstep(0.85,1.15,inner);
       skin=mix(skin,vec3(0.012,0.025,0.052),mark);
       skin=mix(skin,vec3(0.92,0.7,0.03),1.0-smoothstep(-0.42,-0.33,p.x));`,
      `vec3 skin=mix(vec3(0.85,0.48,0.007),vec3(1.0,0.86,0.04),smoothstep(-0.3,0.17,p.y));
       skin+=vec3(0.10,0.08,0.015)*exp(-pow(p.y*5.0,2.0));`,
      `vec3 skin=mix(vec3(0.35,0.42,0.41),vec3(0.82,0.87,0.82),smoothstep(-0.24,0.2,p.y));
       float bands=abs(sin(p.x*17.0+p.y*1.5));
       skin=mix(skin,vec3(0.04,0.065,0.06),1.0-smoothstep(0.2,0.36,bands));`,
    ][type];
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 p=vFishLocal;
      ${colors}
      float row=floor(p.y*85.0);
      vec2 scales=vec2(p.x*88.0+mod(row,2.0)*0.5,p.y*85.0);
      float scaleEdge=smoothstep(0.30,0.47,length(fract(scales)-0.5));
      skin*=0.92+0.08*scaleEdge;
      diffuseColor.rgb*=skin;`);
  };
  mat.customProgramCacheKey=()=>`fish-skin-${type}`;
  return lightMaterial?lightMaterial(mat,{strength:.6}):mat;
}
// A ribbed membrane fan. Its rays are geometry, not a painted image.
function finShape(points,color,opacity=.64) {
  const vertices=[],uv=[],indices=[];
  const root=new THREE.Vector3(...points[0]);
  for(let i=1;i<points.length-1;i++) {
    const start=vertices.length/3;
    vertices.push(...root.toArray(),...points[i],...points[i+1]);
    uv.push(0,0,1,i/(points.length-1),1,(i+1)/(points.length-1));
    indices.push(start,start+1,start+2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const material=new THREE.MeshPhysicalMaterial({color,side:THREE.DoubleSide,transparent:true,opacity,depthWrite:false,roughness:.45,metalness:.08});
  const group=new THREE.Group();const mesh=new THREE.Mesh(g,material);group.add(mesh);
  const lines=[];for(let i=1;i<points.length;i++)lines.push(...root.toArray(),...points[i]);
  const rays=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3)),new THREE.LineBasicMaterial({color,transparent:true,opacity:.65}));group.add(rays);return group;
}
export function makeFish3D(type,lightMaterial) {
  const root=new THREE.Group(),clock={value:0},profile=profiles[type];
  const body=new THREE.Mesh(bodyGeometry(type),fishSkin(type,clock,lightMaterial));body.castShadow=true;body.receiveShadow=true;root.add(body);
  const tailColor=type===1?0xf7cf1c:type===3?0x8dafa6:profile.color;
  const tailPoints=[[0,0,0]];
  for(let i=0;i<=18;i++){const a=-1.08+i/18*2.16;tailPoints.push([-.13-.22*Math.cos(a),Math.sin(a)*.27,Math.sin(i*.8)*.004]);}
  const tail=finShape(tailPoints,tailColor,.8);tail.position.x=-profile.length*.48;root.add(tail);
  const dorsal=[[.28,profile.height*.7,0]];
  for(let i=0;i<=18;i++){const x=.28-i*.038,h=type===3?.53:type===2?.22:.095;dorsal.push([x,profile.height*.82+Math.sin(i/18*Math.PI)*h,0]);}
  root.add(finShape(dorsal,type===0?0x3e2b15:tailColor,.68));
  const ventral=dorsal.map(([x,y,z])=>[x,-y*.88,z]);root.add(finShape(ventral,tailColor,.52));
  const pectorals=[];
  for(const side of [-1,1]) {
    const fin=finShape([[0,0,0],[-.06,-.03,side*.06],[-.15,-.13,side*.14],[-.21,-.10,side*.17],[-.22,-.04,side*.12],[-.13,.025,side*.08]],type===1?0x3d8dbf:0xe5c486,.34);
    fin.position.set(.13,-.045,side*profile.width*.9);root.add(fin);pectorals.push(fin);
    const eyeGroup=new THREE.Group();eyeGroup.position.set(profile.length*.36,.055,side*profile.width*.64);
    const iris=new THREE.Mesh(new THREE.SphereGeometry(.032,16,12),new THREE.MeshPhysicalMaterial({color:type===3?0xc98c3d:0xb8a755,roughness:.22,metalness:.3}));iris.scale.set(1,1,.43);eyeGroup.add(iris);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(.022,16,12),new THREE.MeshPhysicalMaterial({color:0x030909,roughness:.08,clearcoat:1}));pupil.position.z=side*.013;pupil.scale.z=.6;eyeGroup.add(pupil);
    const sparkle=new THREE.Mesh(new THREE.SphereGeometry(.006,8,6),new THREE.MeshBasicMaterial({color:0xe5fcf0}));sparkle.position.set(.003,.008,side*.027);eyeGroup.add(sparkle);root.add(eyeGroup);
    const gillPoints=[];for(let i=0;i<=15;i++){const a=-1.2+i/15*2.4;gillPoints.push(new THREE.Vector3(.18-.042*Math.cos(a),Math.sin(a)*profile.height*.68,side*(profile.width*.89-Math.abs(Math.sin(a))*.02)));}
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(gillPoints),new THREE.LineBasicMaterial({color:0x3e452d,transparent:true,opacity:.4})));
  }
  const mouth=new THREE.Mesh(new THREE.TorusGeometry(.022,.004,5,14),new THREE.MeshStandardMaterial({color:0x645540,roughness:.5}));mouth.rotation.y=Math.PI/2;mouth.position.set(profile.length*.51,-.035,0);root.add(mouth);
  if(type===3){for(const side of [-1,1]){const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(.12,-.18,side*.02),new THREE.Vector3(.02,-.53,side*.02),new THREE.Vector3(-.18,-.70,side*.035)]);root.add(new THREE.Mesh(new THREE.TubeGeometry(curve,15,.005,4,false),new THREE.MeshStandardMaterial({color:0xc9d6c5,roughness:.5})));}}
  root.userData.animate=(time,speed=1)=>{clock.value=time;tail.rotation.y=Math.sin(time*6.5)*.26*speed;tail.position.z=Math.sin(time*6.5-2.4)*.047;pectorals.forEach((fin,i)=>fin.rotation.y=Math.sin(time*8+i)*.30);};
  root.userData.body=body;
  return root;
}

// One reusable offscreen renderer avoids creating a WebGL context per card.
let preview;
export function drawFishPreview(canvas,type) {
  if(!preview){const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(340,156);renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xdbefff,0x635b3e,2.5));const sun=new THREE.DirectionalLight(0xfff3d5,3);sun.position.set(1,3,4);scene.add(sun);
    const camera=new THREE.PerspectiveCamera(32,340/156,.1,10);camera.position.set(0,.1,2.6);camera.lookAt(-.1,0,0);preview={renderer,scene,camera,fish:new Map()};}
  for(const fish of preview.fish.values())fish.visible=false;
  if(!preview.fish.has(type)){const fish=makeFish3D(type);fish.rotation.y=-.17;preview.scene.add(fish);preview.fish.set(type,fish);}
  preview.fish.get(type).visible=true;preview.renderer.render(preview.scene,preview.camera);canvas.width=340;canvas.height=156;canvas.getContext('2d').drawImage(preview.renderer.domElement,0,0);
}

