import * as THREE from 'three';

// Deterministic spectrum: neighbouring wavelengths travel in different directions.
// All water passes sample one GPU-generated height/slope field each frame.
export function createSpectrum() {
  let seed=8317;
  const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  return Array.from({length:24},(_,i)=>{
    const wavelength=1.85*Math.pow(.12,i/23);
    const k=2*Math.PI/wavelength,angle=i*2.399963+(random()-.5)*.45;
    return {kx:Math.cos(angle)*k,kz:Math.sin(angle)*k,speed:Math.sqrt(9.81*k)*.56,phase:random()*Math.PI*2,amplitude:.43/(k*k)*(.72+random()*.46)};
  });
}

export function makeWaterSurface(renderer,width,depth,targetType) {
  const canSimulate=targetType===THREE.HalfFloatType;
  const spectrum=createSpectrum();
  const waves=new Float32Array(24*4),amplitudes=new Float32Array(24);
  spectrum.forEach((w,i)=>{waves.set([w.kx,w.kz,w.speed,w.phase],i*4);amplitudes[i]=w.amplitude;});
  const options={type:targetType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter};
  const field=new THREE.WebGLRenderTarget(512,288,options);
  const targets=[new THREE.WebGLRenderTarget(192,108,options),new THREE.WebGLRenderTarget(192,108,options)];
  const scene=new THREE.Scene(),camera=new THREE.Camera(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));scene.add(quad);quad.frustumCulled=false;
  const common={uSize:{value:new THREE.Vector2(width,depth)},uPrevious:{value:targets[0].texture},uDrop:{value:new THREE.Vector4(0,0,0,0)}};
  const vertexShader='varying vec2 vUV;void main(){vUV=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
  const step=new THREE.ShaderMaterial({uniforms:common,vertexShader,fragmentShader:/* glsl */`
    varying vec2 vUV;
    uniform sampler2D uPrevious;
    uniform vec2 uSize;
    uniform vec4 uDrop;
    float heightAt(vec2 uv){return texture2D(uPrevious,clamp(uv,vec2(0.002),vec2(0.998))).r;}
    void main(){
      vec2 cell=vec2(1.0/192.0,1.0/108.0);
      vec2 current=texture2D(uPrevious,vUV).rg;
      float h=current.r,velocity=current.g;
      float laplacian=heightAt(vUV+vec2(cell.x,0.0))+heightAt(vUV-vec2(cell.x,0.0))
        +heightAt(vUV+vec2(0.0,cell.y))+heightAt(vUV-vec2(0.0,cell.y))-4.0*h;
      velocity=(velocity+laplacian*0.23)*0.994;
      h=(h+velocity)*0.9995;
      vec2 p=(vUV-0.5)*uSize;
      float radius=max(uDrop.z,0.01);
      h+=uDrop.w*exp(-dot(p-uDrop.xy,p-uDrop.xy)/(radius*radius));
      gl_FragColor=vec4(clamp(h,-0.16,0.16),clamp(velocity,-0.05,0.05),0.0,1.0);
    }`,depthTest:false,depthWrite:false});
  const uniforms={uTime:{value:0},uScale:{value:1},uSize:common.uSize,uRipple:{value:targets[0].texture},uWaves:{value:waves},uAmplitudes:{value:amplitudes},uSimulation:{value:canSimulate?1:0}};
  const fieldMaterial=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader:/* glsl */`
    varying vec2 vUV;
    uniform sampler2D uRipple;
    uniform vec2 uSize;
    uniform float uTime,uScale,uSimulation;
    uniform vec4 uWaves[24];
    uniform float uAmplitudes[24];
    void main(){
      vec2 p=(vUV-.5)*uSize;
      vec3 w=vec3(0.0);
      for(int i=0;i<24;i++){
        vec4 wave=uWaves[i];float fi=float(i),k=length(wave.xy);
        vec2 side=vec2(-wave.y,wave.x)/k;
        float bend=dot(p,side)*k*.31+uTime*.47+fi*1.9;
        float phase=dot(p,wave.xy)-wave.z*uTime+wave.w+1.35*sin(bend);
        float a=uAmplitudes[i]*(1.0+.23*sin(uTime*(.21+fi*.012)+fi))*uScale;
        w.x+=sin(phase)*a;
        w.yz+=cos(phase)*a*(wave.xy+1.35*cos(bend)*side*k*.31);
      }
      vec2 cell=vec2(1.0/192.0,1.0/108.0);
      float h=texture2D(uRipple,vUV).r*uSimulation;
      float dx=(texture2D(uRipple,vUV+vec2(cell.x,0.0)).r-texture2D(uRipple,vUV-vec2(cell.x,0.0)).r)/(2.0*cell.x*uSize.x)*uSimulation;
      float dz=(texture2D(uRipple,vUV+vec2(0.0,cell.y)).r-texture2D(uRipple,vUV-vec2(0.0,cell.y)).r)/(2.0*cell.y*uSize.y)*uSimulation;
      // Encoded field also works in an unsigned-byte target on older GPUs.
      gl_FragColor=vec4(.5+(w.x+h)*2.0,.5+(w.yz+vec2(dx,dz))*.30,1.0);
    }`,depthTest:false,depthWrite:false});
  let active=0,accumulator=0,lastTime=0,lastPump=-1;
  const pending=[];
  const savedColor=renderer.getClearColor(new THREE.Color()),savedAlpha=renderer.getClearAlpha();
  renderer.setClearColor(0,0);for(const target of targets){renderer.setRenderTarget(target);renderer.clear();}renderer.setRenderTarget(null);renderer.setClearColor(savedColor,savedAlpha);
  return {
    texture:field.texture,
    uniforms,
    disturb(x,z,radius=.12,height=.037){pending.push(new THREE.Vector4(x,z,radius,height));if(pending.length>16)pending.shift();},
    update(time,scale=1){
      const dt=Math.max(0,Math.min(.1,time-lastTime));lastTime=time;uniforms.uTime.value=time;uniforms.uScale.value=scale;
      if(canSimulate){
        // A small filter outflow keeps the water moving without user input.
        const pump=Math.floor(time*1.7);
        if(pump!==lastPump&&dt>0){lastPump=pump;pending.push(new THREE.Vector4(width*.43,depth*-.39,.07,.005*scale));}
        accumulator+=dt;
        for(let i=0;accumulator>=1/60&&i<6;i++,accumulator-=1/60){
          common.uPrevious.value=targets[active].texture;common.uDrop.value.copy(pending.shift()||new THREE.Vector4(0,0,1,0));
          quad.material=step;renderer.setRenderTarget(targets[1-active]);renderer.render(scene,camera);active=1-active;
        }
        uniforms.uRipple.value=targets[active].texture;
      }
      quad.material=fieldMaterial;renderer.setRenderTarget(field);renderer.render(scene,camera);renderer.setRenderTarget(null);
    },
  };
}
