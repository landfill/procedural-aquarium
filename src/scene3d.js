import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, feedFish, clean, canPlacePlant, placePlant } from './game.js';
import { makeOptics } from './optics.js';
import { makeFish3D } from './fish3d.js';
import { buildHabitat, texturedMaterial } from './habitat.js';

const WIDTH=6.4,DEPTH=3.6,LEVEL=3.05,HEIGHT=3.3;
export class Aquarium {
  constructor(canvas,state,onSelect,onEat) {
    this.canvas=canvas;this.state=state;this.onEat=onEat;this.food=[];this.ripples=[];this.fishMeshes=new Map();this.time=0;this.waveScale=0.65;this.reflection=1;this.selected=null;this.dragged=false;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x233a40);this.scene.fog=new THREE.FogExp2(0x233a40,.025);
    this.camera=new THREE.PerspectiveCamera(35,1,.1,80);
    this.camera.position.set(3.8,5.9,9.5);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,1.6,0);this.controls.enableDamping=true;this.controls.dampingFactor=.07;this.controls.enablePan=false;this.controls.minDistance=7;this.controls.maxDistance=19;this.controls.minPolarAngle=.35;this.controls.maxPolarAngle=Math.PI*.49;this.controls.minAzimuthAngle=-Math.PI*.46;this.controls.maxAzimuthAngle=Math.PI*.46;this.controls.update();
    let start=null;canvas.addEventListener('pointerdown',e=>{start=[e.clientX,e.clientY];this.dragged=false;});canvas.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)this.dragged=true;});canvas.addEventListener('pointerup',()=>{start=null;});
    const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.40;room.dispose();pmrem.dispose();
    this.ambient=new THREE.HemisphereLight(0xcdefff,0x635b41,1.25);this.scene.add(this.ambient);
    this.sun=new THREE.DirectionalLight(0xfff3cc,3.9);this.sun.position.set(-2.4,9,-3.6);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.5,far:18});this.sun.shadow.bias=-.0006;this.sun.shadow.normalBias=.035;this.sun.shadow.radius=3;this.scene.add(this.sun);
    this.fill=new THREE.DirectionalLight(0x8adee3,1.3);this.fill.position.set(4,3,-4);this.scene.add(this.fill);
    this.optics=makeOptics(this.renderer,WIDTH,DEPTH,LEVEL);
    this.buildTank();this.habitat=buildHabitat(this.scene,this.optics);this.habitat.update(0,state.plantPositions);
    this.buildParticles();this.raycaster=new THREE.Raycaster();this.ndc=new THREE.Vector2();
    this.plantPreview=new THREE.Group();
    this.previewMaterial=new THREE.MeshBasicMaterial({color:0x99e0aa,transparent:true,opacity:.60,side:THREE.DoubleSide,depthWrite:false});
    const rootRing=new THREE.Mesh(new THREE.RingGeometry(.17,.22,40),this.previewMaterial);rootRing.rotation.x=-Math.PI/2;rootRing.position.y=.018;this.plantPreview.add(rootRing);
    const leafGeometry=new THREE.SphereGeometry(1,10,8);
    for(let i=0;i<3;i++){const leaf=new THREE.Mesh(leafGeometry,this.previewMaterial);leaf.scale.set(.035,.25+i*.07,.025);leaf.position.set((i-1)*.08,.23+i*.07,0);leaf.rotation.z=(i-1)*-.28;this.plantPreview.add(leaf);}
    this.plantPreview.traverse(o=>o.renderOrder=12);this.plantPreview.visible=false;this.scene.add(this.plantPreview);
    const ringGeo=new THREE.TorusGeometry(.52,.007,5,64),ringMat=new THREE.MeshBasicMaterial({color:0xd4e9bc,transparent:true,opacity:.65,depthWrite:false});this.selectionRing=new THREE.Mesh(ringGeo,ringMat);this.selectionRing.visible=false;this.scene.add(this.selectionRing);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;canvas.dispatchEvent(new CustomEvent('rendererror',{detail:'3D 화면 연결이 끊겼어요. 잠시 기다리거나 새로고침해주세요.'}));});
    canvas.addEventListener('webglcontextrestored',()=>location.reload());
  }
  buildTank() {
    const scene=this.scene;
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshStandardMaterial({color:0x283c40,roughness:.62,metalness:.05}));ground.rotation.x=-Math.PI/2;ground.position.y=-.24;ground.receiveShadow=true;scene.add(ground);
    const base=new THREE.Mesh(new THREE.BoxGeometry(6.56,.18,DEPTH+.16),new THREE.MeshStandardMaterial({color:0x203337,roughness:.29,metalness:.35}));base.position.y=-.115;base.castShadow=true;base.receiveShadow=true;scene.add(base);
    const glassMat=new THREE.MeshPhysicalMaterial({color:0xc8fff2,transparent:true,opacity:.095,roughness:.06,metalness:.15,clearcoat:1,side:THREE.DoubleSide,depthWrite:false});
    const backGlass=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH,HEIGHT),glassMat);backGlass.position.set(0,HEIGHT/2,-DEPTH/2-.018);scene.add(backGlass);
    this.waterGroup=new THREE.Group();scene.add(this.waterGroup);
    const topGeo=new THREE.PlaneGeometry(WIDTH-.04,DEPTH-.04,200,112);topGeo.rotateX(-Math.PI/2);const surface=new THREE.Mesh(topGeo,this.optics.waterMaterial(true));surface.position.y=LEVEL;surface.renderOrder=5;this.waterGroup.add(surface);
    const front=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH,HEIGHT),this.optics.waterMaterial(false));front.position.set(0,HEIGHT/2,DEPTH/2);front.renderOrder=6;this.waterGroup.add(front);
    for(const side of [-1,1]){const face=new THREE.Mesh(new THREE.PlaneGeometry(DEPTH,HEIGHT),this.optics.waterMaterial(false));face.rotation.y=side*Math.PI/2;face.position.set(side*WIDTH/2,HEIGHT/2,0);face.renderOrder=6;this.waterGroup.add(face);}
    const edgeMat=new THREE.MeshPhysicalMaterial({color:0x96c9bd,roughness:.1,metalness:.28,transparent:true,opacity:.57,depthWrite:false});
    for(const x of [-WIDTH/2,WIDTH/2])for(const z of [-DEPTH/2,DEPTH/2]){const edge=new THREE.Mesh(new THREE.BoxGeometry(.022,HEIGHT,.022),edgeMat);edge.position.set(x,HEIGHT/2,z);edge.renderOrder=9;scene.add(edge);}
    for(const y of [0,HEIGHT])for(const z of [-DEPTH/2,DEPTH/2]){const edge=new THREE.Mesh(new THREE.BoxGeometry(WIDTH+.04,.023,.027),edgeMat);edge.position.set(0,y,z);edge.renderOrder=9;scene.add(edge);}
    for(const y of [0,HEIGHT])for(const x of [-WIDTH/2,WIDTH/2]){const edge=new THREE.Mesh(new THREE.BoxGeometry(.024,.023,DEPTH),edgeMat);edge.position.set(x,y,0);edge.renderOrder=9;scene.add(edge);}
    // Clear glass above the waterline, with a thin meniscus highlight.
    const topGlass=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH,HEIGHT-LEVEL),glassMat);topGlass.position.set(0,(HEIGHT+LEVEL)/2,DEPTH/2+.004);topGlass.renderOrder=8;scene.add(topGlass);
    const meniscus=new THREE.Mesh(new THREE.BoxGeometry(WIDTH,.009,.009),new THREE.MeshBasicMaterial({color:0xc4eee0,transparent:true,opacity:.38}));meniscus.position.set(0,LEVEL,DEPTH/2+.005);meniscus.renderOrder=9;
    // A physically present slim aquarium light, generated from primitives.
    const lamp=new THREE.Group();const casing=new THREE.Mesh(new THREE.BoxGeometry(5.25,.075,.24),new THREE.MeshStandardMaterial({color:0x132328,metalness:.8,roughness:.27}));lamp.add(casing);
    const led=new THREE.Mesh(new THREE.PlaneGeometry(5.05,.16),new THREE.MeshBasicMaterial({color:0xe8ffe8}));led.rotation.x=Math.PI/2;led.position.y=-.04;lamp.add(led);lamp.position.set(0,3.73,-1.15);scene.add(lamp);this.led=led;
    for(const x of [-2.35,2.35]){const support=new THREE.Mesh(new THREE.CylinderGeometry(.013,.013,.44,8),new THREE.MeshStandardMaterial({color:0x627a78,metalness:.8,roughness:.25}));support.position.set(x,3.5,-1.15);scene.add(support);}
  }
  buildParticles(){
    const vertices=[];this.particleSeeds=[];
    for(let i=0;i<110;i++){const seed={x:Math.random(),y:Math.random(),z:Math.random()};this.particleSeeds.push(seed);vertices.push((seed.x-.5)*6,seed.y*LEVEL,(seed.z-.5)*2.4);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    this.particles=new THREE.Points(geo,new THREE.PointsMaterial({color:0xd8efcc,size:.012,transparent:true,opacity:.32,depthWrite:false}));this.scene.add(this.particles);
    const bubbleGeo=new THREE.SphereGeometry(.018,8,6),bubbleMat=new THREE.MeshPhysicalMaterial({color:0xc5eeed,transparent:true,opacity:.25,metalness:.3,roughness:.06,depthWrite:false});this.bubbles=new THREE.InstancedMesh(bubbleGeo,bubbleMat,24);this.scene.add(this.bubbles);this.dummy=new THREE.Object3D();
    this.foodGeo=new THREE.SphereGeometry(.017,7,6);this.foodMat=new THREE.MeshStandardMaterial({color:0xbc8341,roughness:.95});
  }
  resize(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;if(!this.w||!this.h)return;this.renderer.setSize(this.w,this.h,false);this.camera.aspect=this.w/this.h;
    // A taller FOV keeps the full tank in view on narrow screens.
    this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(17.5))*Math.max(1,1.55/this.camera.aspect)));this.camera.updateProjectionMatrix();const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.optics.resize(size.x,size.y);}
  world(f){return new THREE.Vector3((f.x-.5)*5.65,LEVEL-.24-f.y*2.57,(f.z-.5)*(DEPTH-.52));}
  project(x,y,z){const p=this.world({x,y,z}).project(this.camera);return[(p.x*.5+.5)*this.w,(-p.y*.5+.5)*this.h];}
  pointAt(px,py){
    this.ndc.set(px/this.w*2-1,1-py/this.h*2);this.raycaster.setFromCamera(this.ndc,this.camera);
    const p=new THREE.Vector3(),hit=this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-LEVEL),p);
    if(hit&&Math.abs(p.x)<WIDTH/2&&Math.abs(p.z)<DEPTH/2)return{x:clamp(p.x/5.65+.5,.05,.95),z:clamp(p.z/(DEPTH-.52)+.5,.04,.96)};
    this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),p);
    return{x:clamp(p.x/5.65+.5,.06,.94),z:.5};
  }
  setWaterView(enabled){
    this.camera.position.set(...(enabled?[3.5,8.4,7.8]:[3.8,5.9,9.5]));
    this.controls.target.set(0,1.6,0);this.controls.update();
  }
  floorPlacement(px,py){
    this.ndc.set(px/this.w*2-1,1-py/this.h*2);this.raycaster.setFromCamera(this.ndc,this.camera);this.scene.updateMatrixWorld(true);
    const ground=this.raycaster.intersectObject(this.habitat.sand)[0];
    if(!ground)return null;
    const p={x:ground.point.x,y:ground.point.y,z:ground.point.z};
    const rock=this.raycaster.intersectObjects(this.habitat.rocks)[0];
    p.valid=!(rock&&rock.distance<ground.distance)&&canPlacePlant(this.state,p);
    p.reason=rock&&rock.distance<ground.distance?'돌 위에는 심을 수 없어요. 모래 바닥을 골라주세요.':'유리벽과 다른 수초에서 조금 떨어진 곳을 골라주세요.';
    return p;
  }
  previewPlantAt(px,py){const p=this.floorPlacement(px,py);this.plantPreview.visible=!!p;if(p){this.plantPreview.position.set(p.x,p.y,p.z);this.previewMaterial.color.setHex(p.valid?0x99e0aa:0xe09877);}return p;}
  hidePlantPreview(){this.plantPreview.visible=false;}
  plantAt(px,py){
    const p=this.floorPlacement(px,py);
    if(!p)return{ok:false,message:'어항 안의 모래 바닥을 클릭해주세요.'};
    if(!p.valid)return{ok:false,message:p.reason};
    if(!placePlant(this.state,p))return{ok:false,message:this.state.plants>=12?'수초는 최대 12포기까지 심을 수 있어요.':'40 코인이 필요해요.'};
    this.habitat.update(this.time,this.state.plantPositions);this.hidePlantPreview();return{ok:true,position:{x:p.x,z:p.z}};
  }
  changeWater(){
    if(!clean(this.state,this.food.length>0))return false;
    const removed=this.food.length;for(const food of this.food)this.scene.remove(food.mesh);
    this.food.length=0;this.particles.geometry.setDrawRange(0,0);this.ripple(.5,.5);
    return{removed};
  }
  hit(px,py){this.ndc.set(px/this.w*2-1,1-py/this.h*2);this.raycaster.setFromCamera(this.ndc,this.camera);const hits=this.raycaster.intersectObjects([...this.fishMeshes.values()],true);for(const hit of hits){let o=hit.object;while(o&&!o.userData.fishId)o=o.parent;if(o)return this.state.fish.find(f=>f.id===o.userData.fishId);}return null;}
  drop(x=.5,z=.5){if(this.food.length>35)return false;for(let i=0;i<8;i++){const f={x:clamp(x+(Math.random()-.5)*.10,.04,.96),y:-.04+Math.random()*.02,z:clamp(z+(Math.random()-.5)*.16,.08,.92),age:0};f.mesh=new THREE.Mesh(this.foodGeo,this.foodMat);this.scene.add(f.mesh);this.food.push(f);}this.ripple(x,z);return true;}
  ripple(x,z){this.ripples.unshift({wx:(x-.5)*5.65,wz:(z-.5)*(DEPTH-.52),age:0});this.ripples=this.ripples.slice(0,8);}
  update(dt){
    this.time+=dt;
    for(const food of this.food){food.y+=dt*.035;food.age+=dt;food.x+=Math.sin(food.age*1.6)*dt*.003;food.mesh.position.copy(this.world(food));}
    for(const f of this.state.fish){
      if(!this.fishMeshes.has(f.id)){const mesh=makeFish3D(f.type,this.optics.lightMaterial);mesh.userData.fishId=f.id;mesh.userData.heading=f.direction>0?0:Math.PI;this.scene.add(mesh);this.fishMeshes.set(f.id,mesh);}
      const mesh=this.fishMeshes.get(f.id),before=this.world(f);
      let target=null,distance=100;
      if(f.hunger<99)for(const food of this.food){const d=this.world(food).distanceTo(before);if(d<distance){target=food;distance=d;}}
      if(target){const speed=dt*.54/Math.max(distance,.02);f.x+=(target.x-f.x)*speed;f.y+=(target.y-f.y)*speed;f.z+=(target.z-f.z)*speed;if(distance<.13){this.food.splice(this.food.indexOf(target),1);this.scene.remove(target.mesh);feedFish(this.state,f);this.onEat();}}
      else{
        f.x+=f.direction*dt*(.024+f.z*.008);
        f.y+=(.40+Math.sin(this.time*.22+f.phase)*.21-f.y)*dt*.20;
        f.z+=Math.sin(this.time*.22+f.phase*2)*dt*.033;
        if(f.x>.93)f.direction=-1;if(f.x<.07)f.direction=1;
      }
      for(const other of this.state.fish){if(other===f)continue;const dx=f.x-other.x,dy=f.y-other.y,dz=f.z-other.z;const distance=Math.hypot(dx*5.65,dy*2.57,dz*(DEPTH-.52));if(distance>.001&&distance<.75){const repulsion=(.75-distance)*dt*.7/distance;f.x+=dx*repulsion;f.y+=dy*repulsion;f.z+=dz*repulsion;}}
      f.x=clamp(f.x,.045,.955);f.y=clamp(f.y,-.025,.88);f.z=clamp(f.z,.07,.93);
      const world=this.world(f),delta=world.clone().sub(before);
      if(delta.lengthSq()>.00000001){const heading=Math.atan2(-delta.z,delta.x);let diff=heading-mesh.userData.heading;diff=Math.atan2(Math.sin(diff),Math.cos(diff));mesh.userData.heading+=diff*Math.min(1,dt*2.8);mesh.rotation.y=mesh.userData.heading;mesh.rotation.z=THREE.MathUtils.lerp(mesh.rotation.z,Math.atan2(delta.y,Math.hypot(delta.x,delta.z))*.6,dt*3);}
      mesh.position.copy(world);const size=.70+f.growth*.0023;mesh.scale.setScalar(size);mesh.userData.animate(this.time+f.phase,target?1.3:1);
    }
    this.food=this.food.filter(f=>{if(f.y>.96||f.age>30){this.scene.remove(f.mesh);this.state.quality=clamp(this.state.quality-.5,0,100);return false;}return true;});
    this.ripples.forEach(r=>r.age+=dt);this.ripples=this.ripples.filter(r=>r.age<5);
    this.habitat.update(this.time,this.state.plantPositions);
    const pos=this.particles.geometry.attributes.position;for(let i=0;i<this.particleSeeds.length;i++){const seed=this.particleSeeds[i];pos.setXYZ(i,(seed.x-.5)*6+Math.sin(this.time*.08+i)*.05,(seed.y*LEVEL+this.time*.016)%LEVEL,(seed.z-.5)*2.4);}pos.needsUpdate=true;
    for(let i=0;i<24;i++){this.dummy.position.set(2.78+Math.sin(this.time+i)*.045,(i*.17+this.time*.29)%2.94,-.80+Math.cos(i)*.04);this.dummy.scale.setScalar(.4+(i%5)*.22);this.dummy.updateMatrix();this.bubbles.setMatrixAt(i,this.dummy.matrix);}this.bubbles.instanceMatrix.needsUpdate=true;
  }
  render(){
    if(this.contextLost)return;
    this.particles.geometry.setDrawRange(0,Math.round((100-this.state.quality)*1.1));
    this.controls.update();
    const day=this.state.light;
    this.sun.intensity=day?2.4:.12;this.fill.intensity=day?1.3:.35;this.ambient.intensity=day?.65:.3;this.led.visible=day;
    this.camera.updateMatrixWorld();this.optics.update(this.time,this.ripples,day,this.state.quality,this.camera,this.waveScale,this.reflection);
    this.selectionRing.visible=!!this.selected;const selected=this.fishMeshes.get(this.selected);if(selected){this.selectionRing.position.copy(selected.position);this.selectionRing.quaternion.copy(this.camera.quaternion);}
    this.optics.renderCaustics();
    this.waterGroup.visible=false;this.renderer.setRenderTarget(this.optics.refractionTarget);this.renderer.render(this.scene,this.camera);
    this.waterGroup.visible=true;this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
    this.canvas.dataset.renderer='webgl2';
  }
}
