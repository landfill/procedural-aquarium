import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from '../scripts/build.js';

test('production build serves the entry point and local dependencies without node_modules',async()=>{
  const output=await build();
  const html=await readFile(path.join(output,'index.html'),'utf8');
  const map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.equal(map.imports.three,'./vendor/three/three.module.js');
  assert.equal(map.imports['three/addons/'],'./vendor/three/addons/');
  assert.ok(!html.includes('node_modules'));
  for(const file of ['src/main.js','src/style.css','src/water-surface.js','vendor/three/three.module.js','vendor/three/three.core.js','vendor/three/addons/controls/OrbitControls.js','vendor/three/addons/environments/RoomEnvironment.js','vendor/three/addons/utils/BufferGeometryUtils.js','vendor/three/LICENSE'])await access(path.join(output,file));
  assert.deepEqual((await readdir(output)).sort(),['index.html','src','vendor']);
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.outputDirectory,'dist');assert.equal(config.buildCommand,'npm run build');assert.equal(config.framework,null);
});
