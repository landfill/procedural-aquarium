import * as THREE from 'three';

// The same analytic surface drives geometry, refraction and the photon pass.
// Caustic density follows the area-ratio approach described by caustic-volume.
export const waveGLSL = /* glsl */`
uniform float uTime;
uniform vec4 uRipples[8];
vec3 surface(vec2 p) {
  vec3 result = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float fi = float(i), angle = fi * 2.399963;
    vec2 d = vec2(cos(angle), sin(angle));
    float k = 3.3 + fi * 2.5;
    float a = 0.55 / (k * k);
    float phase = dot(p, d) * k + uTime * (0.55 + fi * 0.11) + fi * 1.7;
    vec2 sideways = vec2(-d.y, d.x);
    float bend = dot(p, sideways) * k * 0.3 + uTime * 0.24;
    phase += 1.1 * sin(bend);
    result.x += sin(phase) * a;
    result.yz += cos(phase) * a * k * (d + 0.33 * cos(bend) * sideways);
  }
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipples[i];
    vec2 delta = p - r.xy;
    float distance = length(delta) + 0.001;
    float front = distance - r.z * 0.85;
    float envelope = exp(-front * front * 12.0) * exp(-r.z * 0.8) * r.w;
    result.x += sin(front * 23.0) * envelope * 0.016;
    result.yz += delta / distance * cos(front * 23.0) * envelope * 0.28;
  }
  return result;
}`;

export function makeOptics(renderer, width, depth, level) {
  const uniforms = {
    uTime: { value: 0 },
    uRipples: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0,0,0,0)) },
    uDay: { value: 1 },
    uSize: { value: new THREE.Vector2(width, depth) },
    uLevel: { value: level },
  };
  const targetType=renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
  const causticTarget = new THREE.WebGLRenderTarget(768, 384, {type:targetType, depthBuffer:false});
  const causticScene = new THREE.Scene();
  const causticCamera = new THREE.Camera();
  const grid = new THREE.PlaneGeometry(width,depth,230,120);
  grid.rotateX(-Math.PI/2);
  const causticMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: waveGLSL + /* glsl */`
      uniform vec2 uSize;
      uniform float uLevel;
      varying vec2 vSource;
      varying vec2 vHit;
      void main() {
        vec2 p = position.xz;
        vec3 w = surface(p);
        vec3 n = normalize(vec3(-w.y, 1.0, -w.z));
        vec3 ray = refract(normalize(vec3(-0.16,-1.0,0.08)), n, 1.0/1.333);
        vec2 hit = p + ray.xz * (uLevel + w.x) / -ray.y;
        vSource = p;
        vHit = hit;
        gl_Position = vec4(hit.x / (uSize.x*0.5), hit.y / (uSize.y*0.5), 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vSource;
      varying vec2 vHit;
      void main() {
        vec2 a = dFdx(vSource), b = dFdy(vSource);
        vec2 c = dFdx(vHit), d = dFdy(vHit);
        float originalArea = abs(a.x*b.y-a.y*b.x);
        float refractedArea = max(abs(c.x*d.y-c.y*d.x), 0.0000001);
        float density = clamp(originalArea/refractedArea,0.0,12.0);
        gl_FragColor = vec4(vec3(density*0.2),1.0);
      }`,
    transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
  });
  const causticMesh = new THREE.Mesh(grid,causticMaterial);
  causticMesh.frustumCulled=false;
  causticScene.add(causticMesh);
  const refractionTarget = new THREE.WebGLRenderTarget(1,1,{type:targetType});
  refractionTarget.depthTexture = new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const waterUniforms = {
    ...uniforms,
    uScene: {value:refractionTarget.texture},
    uDepth: {value:refractionTarget.depthTexture},
    uResolution: {value:new THREE.Vector2(1,1)},
    uNear: {value:0.1}, uFar: {value:80},
    uTurbidity: {value:0},
  };
  function waterMaterial(top) {
    return new THREE.ShaderMaterial({
      uniforms:{...waterUniforms,uTop:{value:top?1:0}},
      vertexShader: waveGLSL + /* glsl */`
        uniform float uTop;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vViewZ;
        void main() {
          vec3 p = position;
          vec3 norm = normal;
          if(uTop>0.5) { vec3 w = surface(p.xz); p.y += w.x; norm = normalize(vec3(-w.y,1.0,-w.z)); }
          vec4 wp = modelMatrix*vec4(p,1.0);
          vWorld = wp.xyz;
          vNormalW = normalize(mat3(modelMatrix)*norm);
          vec4 vp = viewMatrix*wp;
          vViewZ=vp.z;
          gl_Position=projectionMatrix*vp;
        }`,
      fragmentShader: waveGLSL + /* glsl */`
        #include <packing>
        uniform sampler2D uScene;
        uniform sampler2D uDepth;
        uniform vec2 uResolution;
        uniform float uNear, uFar, uTop, uDay, uTurbidity;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vViewZ;
        vec3 roomReflection(vec3 r) {
          vec3 sky=mix(vec3(0.05,0.10,0.12),vec3(0.38,0.50,0.49),smoothstep(-0.2,0.8,r.y));
          float strip = smoothstep(0.958,0.979,dot(r,normalize(vec3(-0.45,1.0,0.08))));
          float window = smoothstep(0.986,0.996,dot(r,normalize(vec3(0.6,0.35,0.6))));
          return sky+vec3(1.9,2.1,1.85)*strip+vec3(2.0)*window;
        }
        void main() {
          vec3 n = normalize(vNormalW);
          if(uTop>0.5) { vec3 w=surface(vWorld.xz); n=normalize(vec3(-w.y,1.0,-w.z)); }
          if(!gl_FrontFacing)n=-n;
          vec3 view=normalize(cameraPosition-vWorld);
          float facing=abs(dot(n,view));
          float fresnel=0.0204+0.9796*pow(1.0-facing,5.0);
          vec2 uv=gl_FragCoord.xy/uResolution;
          vec3 vn=mat3(viewMatrix)*n;
          vec2 offset=vn.xy*(uTop>0.5?0.035:0.0025);
          vec2 sampleUV=clamp(uv+offset,vec2(0.002),vec2(0.998));
          float rawDepth=texture2D(uDepth,sampleUV).x;
          float depth=perspectiveDepthToViewZ(rawDepth,uNear,uFar);
          float distance=clamp(vViewZ-depth,0.0,6.5);
          vec3 absorption=vec3(0.14,0.035,0.018)+vec3(0.14,0.08,0.12)*uTurbidity;
          vec3 transmission=exp(-absorption*distance);
          vec3 base=texture2D(uScene,sampleUV).rgb*transmission;
          base+=vec3(0.015,0.09,0.09)*(1.0-transmission)*uDay;
          vec3 reflected=roomReflection(reflect(-view,n))*(0.15+0.85*uDay);
          vec3 color=mix(base,reflected,clamp(fresnel,0.0,uTop>0.5?0.85:0.2));
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side:THREE.FrontSide,
    });
  }
  function lightMaterial(material, options={}) {
    const original=material.onBeforeCompile.bind(material);
    material.onBeforeCompile=(shader)=>{
      original(shader);
      shader.uniforms.uCaustics={value:causticTarget.texture};
      shader.uniforms.uCausticDay=uniforms.uDay;
      shader.vertexShader='varying vec3 vCausticWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 causticWorld=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
        causticWorld=instanceMatrix*causticWorld;
        #endif
        vCausticWorld=(modelMatrix*causticWorld).xyz;`);
      shader.fragmentShader='uniform sampler2D uCaustics; uniform float uCausticDay; varying vec3 vCausticWorld;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec2 cuv=vCausticWorld.xz/vec2(${width.toFixed(2)},${depth.toFixed(2)})+0.5;
        float inside=step(0.0,cuv.x)*step(cuv.x,1.0)*step(0.0,cuv.y)*step(cuv.y,1.0)*step(vCausticWorld.y,${level.toFixed(2)});
        float caustic=texture2D(uCaustics,cuv).r;
        outgoingLight+=diffuseColor.rgb*max(0.0,caustic-0.15)*${(options.strength??1.5).toFixed(2)}*inside*uCausticDay;
        #include <opaque_fragment>`);
    };
    return material;
  }
  return {
    uniforms,waterUniforms,refractionTarget,causticTarget,waterMaterial,lightMaterial,
    resize(w,h){refractionTarget.setSize(w,h);waterUniforms.uResolution.value.set(w,h);},
    update(time,ripples,day,quality){uniforms.uTime.value=time;uniforms.uDay.value=day?1:.1;waterUniforms.uTurbidity.value=(100-quality)/100;uniforms.uRipples.value.forEach((v,i)=>{const r=ripples[i];r?v.set(r.wx,r.wz,r.age,1):v.set(0,0,0,0);});},
    renderCaustics(){const bg=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();renderer.setClearColor(0x000000,0);renderer.setRenderTarget(causticTarget);renderer.clear();renderer.render(causticScene,causticCamera);renderer.setRenderTarget(null);renderer.setClearColor(bg,alpha);},
  };
}

