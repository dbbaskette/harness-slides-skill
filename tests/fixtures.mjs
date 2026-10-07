import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { json } from '../scripts/lib/common.mjs';
export const sceneFixture=async()=>{const scene=await json(new URL('../examples/scene.json',import.meta.url));scene.slides=scene.slides.slice(0,2);for(const s of scene.slides)delete s.notes;return scene;};
export async function temporary(t){const dir=await mkdtemp(join(tmpdir(),'harness-engine-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
