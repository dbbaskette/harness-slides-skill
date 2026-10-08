// Report the executing package, never the content project's package or current pointer.
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
export async function runtimeVersion(runtime=packageRoot){
  runtime=await realpath(runtime);const pkg=JSON.parse(await readFile(join(runtime,'package.json'),'utf8'));
  if(!['harness-slides','harness-research-skill'].includes(pkg.name)||!/^\d+\.\d+\.\d+$/.test(pkg.version??''))throw new Error('Unrecognized runtime package/version');
  return {package:pkg.name,runtimeVersion:pkg.version,runtime};
}
