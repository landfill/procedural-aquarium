import * as THREE from 'three';
import { makeWaterSurface } from './water-surface.js';

// The same GPU height/slope field drives all optical passes.
const waveGLSL = /* glsl */`
uniform sampler2D uSurface;
uniform vec2 uSize;
vec3 surface(vec2 p){
  vec3 f=texture2D(uSurface,clamp(p/uSize+.5,vec2(.001),vec2(.999))).rgb-.5;
  return vec3(f.x*.5,f.yz/.30);
}`;

export function makeOptics(renderer,width,depth,level){
  const type=renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
  const waterSurface=makeWaterSurface(renderer,width,depth,type);
  const uniforms={uSurface:{value:waterSurface.texture},uDay:{value:1},uSize:{value:new THREE.Vector2(width,depth)},uLevel:{value:level},uLightDirection:{value:new THREE.Vector3(-.24,.90,-.36).normalize()}};
  const causticTarget=new THREE.WebGLRenderTarget(1024,576,{type,depthBuffer:false});
  const causticScene=new THREE.Scene(),causticCamera=new THREE.Camera();
  const grid=new THREE.PlaneGeometry(width,depth,320,180);grid.rotateX(-Math.PI/2);
  const material=new THREE.ShaderMaterial({uniforms,
    vertexShader:waveGLSL+/* glsl */`
      uniform float uLevel;uniform vec3 uLightDirection;varying vec2 vSource,vHit;
      void main(){
        vec2 p=position.xz;vec3 w=surface(p),n=normalize(vec3(-w.y,1.0,-w.z));
        vec3 ray=refract(-uLightDirection,n,1.0/1.333);
        vHit=p+ray.xz*(uLevel+w.x-.14)/-ray.y;vSource=p;
        gl_Position=vec4(vHit/(uSize*.5),0.0,1.0);
      }`,
    fragmentShader:/* glsl */`
      varying vec2 vSource,vHit;
      void main(){
        vec2 a=dFdx(vSource),b=dFdy(vSource),c=dFdx(vHit),d=dFdy(vHit);
        float density=abs(a.x*b.y-a.y*b.x)/max(abs(c.x*d.y-c.y*d.x),0.0000001);
        gl_FragColor=vec4(vec3(min(density,20.0)*.24),1.0);
      }`,transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
  });
  const mesh=new THREE.Mesh(grid,material);mesh.frustumCulled=false;causticScene.add(mesh);
  const refractionTarget=new THREE.WebGLRenderTarget(1,1,{type});
  refractionTarget.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const waterUniforms={...uniforms,uScene:{value:refractionTarget.texture},uDepth:{value:refractionTarget.depthTexture},uCaustics:{value:causticTarget.texture},uResolution:{value:new THREE.Vector2(1,1)},uNear:{value:.1},uFar:{value:80},uTurbidity:{value:0},uViewProjection:{value:new THREE.Matrix4()},uReflection:{value:1}};
  function waterMaterial(top){return new THREE.ShaderMaterial({uniforms:{...waterUniforms,uTop:{value:top?1:0}},
    vertexShader:waveGLSL+/* glsl */`
      uniform float uTop;varying vec3 vWorld,vNormalW;
      void main(){
        vec3 p=position;if(uTop>.5)p.y+=surface(p.xz).x;
        vec4 world=modelMatrix*vec4(p,1.0);vWorld=world.xyz;vNormalW=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader:waveGLSL+/* glsl */`
      #include <packing>
      uniform sampler2D uScene,uDepth,uCaustics;
      uniform mat4 uViewProjection;
      uniform vec2 uResolution;uniform vec3 uLightDirection;
      uniform float uNear,uFar,uTop,uDay,uTurbidity,uLevel,uReflection;
      varying vec3 vWorld,vNormalW;
      vec2 projectPoint(vec3 p){vec4 q=uViewProjection*vec4(p,1.0);return q.xy/q.w*.5+.5;}
      float cameraDepth(vec3 p){return -(viewMatrix*vec4(p,1.0)).z;}
      float sceneDepth(vec2 uv){return -perspectiveDepthToViewZ(texture2D(uDepth,uv).r,uNear,uFar);}
      float onScreen(vec2 uv){return step(.002,uv.x)*step(uv.x,.998)*step(.002,uv.y)*step(uv.y,.998);}

      // Snell ray marching against scene depth with four-step hit refinement.
      vec4 throughWater(vec3 origin,vec3 direction){
        vec3 inv=1.0/(direction+vec3(.000001));
        vec3 lo=(vec3(-uSize.x*.5,.14,-uSize.y*.5)-origin)*inv;
        vec3 hi=(vec3(uSize.x*.5,uLevel+.18,uSize.y*.5)-origin)*inv;
        vec3 farSide=max(lo,hi);float exitT=clamp(min(farSide.x,min(farSide.y,farSide.z)),.06,9.0);
        vec2 hitUV=projectPoint(origin+direction*exitT);float distance=exitT,previous=.018;
        for(int i=0;i<28;i++){
          float t=.025+exitT*float(i+1)/28.0;vec3 p=origin+direction*t;vec2 uv=projectPoint(p);
          if(onScreen(uv)<.5)break;
          float delta=cameraDepth(p)-sceneDepth(uv);
          if(delta>0.0&&delta<.85){
            float low=previous,high=t;
            for(int j=0;j<4;j++){float middle=(low+high)*.5;vec3 q=origin+direction*middle;if(cameraDepth(q)>sceneDepth(projectPoint(q)))high=middle;else low=middle;}
            distance=(low+high)*.5;hitUV=projectPoint(origin+direction*distance);break;
          }previous=t;
        }
        if(onScreen(hitUV)>.5)return vec4(texture2D(uScene,hitUV).rgb,distance);
        vec3 end=origin+direction*exitT;
        float c=texture2D(uCaustics,clamp(end.xz/uSize+.5,vec2(0.0),vec2(1.0))).r;
        return vec4(vec3(.18,.20,.16)*(.6+c*1.6)*uDay,distance);
      }
      // Asset-free HDR environment: actual ray/plane intersections with a window
      // and the light strip. Wave normals break their reflections into highlights.
      vec3 reflectedRoom(vec3 origin,vec3 ray){
        vec3 sky=mix(vec3(.055,.105,.13),vec3(.68,.88,1.05),smoothstep(-.05,.70,ray.y));
        sky*=.73+(.5+.5*sin(ray.x*12.0+sin(ray.z*9.0))*sin(ray.z*15.0+ray.y*8.0))*.35;
        if(ray.z<-.03){
          vec3 q=origin+ray*((-5.0-origin.z)/ray.z);
          vec2 edge=smoothstep(vec2(0.0),vec2(.08),vec2(4.3,2.0)-abs(q.xy-vec2(-.5,5.7)));
          float bars=(1.0-smoothstep(.022,.055,abs(sin((q.x+.3)*1.3))))+(1.0-smoothstep(.025,.055,abs(q.y-5.7)));
          sky=mix(sky,vec3(1.65,2.10,2.40)*(1.0-clamp(bars,0.0,.90)),edge.x*edge.y);
        }
        if(ray.y>.02){
          vec2 q=(origin+ray*((3.73-origin.y)/ray.y)).xz-vec2(0.0,-1.15);
          float housing=(1.0-smoothstep(2.61,2.65,abs(q.x)))*(1.0-smoothstep(.105,.13,abs(q.y)));
          float led=(1.0-smoothstep(2.48,2.53,abs(q.x)))*(1.0-smoothstep(.048,.08,abs(q.y)));
          sky=mix(sky,vec3(.025),housing)+vec3(6.0,6.1,5.2)*led;
        }
        float sun=max(dot(ray,uLightDirection),0.0);
        return sky+vec3(16.0,14.0,10.0)*smoothstep(.9980,.9998,sun)+vec3(.5,.4,.3)*pow(sun,65.0);
      }
      void main(){
        vec3 w=surface(vWorld.xz);float waterline=uLevel+w.x;
        if(uTop<.5&&vWorld.y>waterline)discard;
        vec3 n=uTop>.5?normalize(vec3(-w.y,1.0,-w.z)):normalize(vNormalW);
        vec3 incoming=normalize(vWorld-cameraPosition);
        if(dot(incoming,n)>-.025)n=normalize(n-incoming*(dot(incoming,n)+.025));
        float facing=clamp(dot(-incoming,n),0.0,1.0),fresnel=.0204+.9796*pow(1.0-facing,5.0);
        vec3 ray=refract(incoming,n,1.0/1.333);float distance=0.0;
        vec3 base;
        if(uTop>.5){vec4 refractedColor=throughWater(vWorld+ray*.012,ray);base=refractedColor.rgb;distance=refractedColor.a;}
        else{
          // A single depth layer cannot reliably reconstruct silhouettes behind
          // flat glass. Preserve the scene there and apply depth-based absorption.
          vec2 uv=gl_FragCoord.xy/uResolution;
          base=texture2D(uScene,uv).rgb;
          distance=clamp(sceneDepth(uv)-cameraDepth(vWorld),0.0,6.5);
        }
        vec3 absorb=vec3(.20,.060,.027)+vec3(.11,.09,.14)*uTurbidity;
        vec3 transmission=exp(-absorb*distance);
        base=base*transmission+vec3(.025,.125,.16)*(1.0-transmission)*uDay;
        vec3 reflected=reflectedRoom(vWorld,reflect(incoming,n))*(.07+.93*uDay)*uReflection;
        vec3 color=mix(base,reflected,clamp(fresnel,0.0,.97));
        if(uTop<.5){float edge=1.0-smoothstep(.001,max(.013,fwidth(vWorld.y)*2.0),waterline-vWorld.y);color+=vec3(.25,.5,.51)*edge*uDay;}
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,side:THREE.FrontSide,
  });}
  function lightMaterial(material,options={}){
    const original=material.onBeforeCompile.bind(material);
    material.onBeforeCompile=shader=>{
      original(shader);shader.uniforms.uCaustics={value:causticTarget.texture};shader.uniforms.uCausticDay=uniforms.uDay;
      shader.vertexShader='varying vec3 vCausticWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 causticWorld=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
        causticWorld=instanceMatrix*causticWorld;
        #endif
        vCausticWorld=(modelMatrix*causticWorld).xyz;`);
      shader.fragmentShader='uniform sampler2D uCaustics;uniform float uCausticDay;varying vec3 vCausticWorld;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec2 cuv=vCausticWorld.xz/vec2(${width.toFixed(2)},${depth.toFixed(2)})+.5;
        float inside=step(0.0,cuv.x)*step(cuv.x,1.0)*step(0.0,cuv.y)*step(cuv.y,1.0)*step(vCausticWorld.y,${level.toFixed(2)});
        float caustic=texture2D(uCaustics,cuv).r;
        outgoingLight+=diffuseColor.rgb*max(0.0,caustic-.16)*${(options.strength??2.8).toFixed(2)}*inside*uCausticDay;
        #include <opaque_fragment>`);
    };return material;
  }
  return {uniforms,waterUniforms,waterSurface,refractionTarget,causticTarget,waterMaterial,lightMaterial,
    resize(w,h){refractionTarget.setSize(w,h);waterUniforms.uResolution.value.set(w,h);},
    update(time,ripples,day,quality,camera,waveScale=0.65,reflection=1){
      uniforms.uDay.value=day?1:.10;waterUniforms.uTurbidity.value=(100-quality)/100;waterUniforms.uReflection.value=reflection;
      waterUniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      for(const r of ripples)if(!r.applied){waterSurface.disturb(r.wx,r.wz,.13,.045);r.applied=true;}
      waterSurface.update(time,waveScale);
    },
    renderCaustics(){const color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();renderer.setClearColor(0,0);renderer.setRenderTarget(causticTarget);renderer.clear();renderer.render(causticScene,causticCamera);renderer.setRenderTarget(null);renderer.setClearColor(color,alpha);},
  };
}
