import { cp, copyFile, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));

export async function build(){
  const output=path.resolve(projectRoot,'dist');
  // Only replace this project's generated output, never a symlinked directory.
  if(path.relative(projectRoot,output)!=='dist')throw new Error('Invalid output directory');
  const existing=await lstat(output).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
  if(existing?.isSymbolicLink())throw new Error('Build output must not be a symbolic link');
  await rm(output,{recursive:true,force:true});
  await mkdir(output,{recursive:true});

  const html=await readFile(path.join(projectRoot,'index.html'),'utf8');
  const importMapPattern=/<script type="importmap">([\s\S]*?)<\/script>/;
  const match=html.match(importMapPattern);
  if(!match)throw new Error('Missing browser import map');
  const importMap=JSON.parse(match[1]);
  importMap.imports.three='./vendor/three/three.module.js';
  importMap.imports['three/addons/']='./vendor/three/addons/';
  await writeFile(path.join(output,'index.html'),html.replace(importMapPattern,`<script type="importmap">${JSON.stringify(importMap)}</script>`));
  await cp(path.join(projectRoot,'src'),path.join(output,'src'),{recursive:true});

  const threeRoot=path.join(projectRoot,'node_modules','three');
  const files=[
    ['build/three.module.js','three.module.js'],
    ['build/three.core.js','three.core.js'],
    ['examples/jsm/controls/OrbitControls.js','addons/controls/OrbitControls.js'],
    ['examples/jsm/environments/RoomEnvironment.js','addons/environments/RoomEnvironment.js'],
    ['examples/jsm/utils/BufferGeometryUtils.js','addons/utils/BufferGeometryUtils.js'],
    ['LICENSE','LICENSE'],
  ];
  for(const [source,destination] of files){
    const target=path.join(output,'vendor','three',destination);
    await mkdir(path.dirname(target),{recursive:true});
    await copyFile(path.join(threeRoot,source),target);
  }
  return output;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  console.log(`Static aquarium ready: ${await build()}`);
}
