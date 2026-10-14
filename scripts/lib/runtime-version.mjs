// Report the executing package, never the content project's package or current pointer.
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
// What this code supports, for callers that cannot tell from the version alone. A name is added with the feature, is never
// renamed, removed or reused, and is documented in docs/specs/2026-10-14-design-integration-contract.md.
export const capabilities=Object.freeze(['assets','canonical-digests','compose-review','compose-section','design-batch','design-schema-2','json-refusals','native-charts','relative-records']);
const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
export async function runtimeVersion(runtime=packageRoot){
  runtime=await realpath(runtime);const pkg=JSON.parse(await readFile(join(runtime,'package.json'),'utf8'));
  if(!['harness-slides','harness-research-skill'].includes(pkg.name)||!/^\d+\.\d+\.\d+$/.test(pkg.version??''))throw new Error('Unrecognized runtime package/version');
  return {package:pkg.name,runtimeVersion:pkg.version,runtime};
}
