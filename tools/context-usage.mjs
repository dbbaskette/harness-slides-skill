import { readFile, writeFile, readdir } from 'node:fs/promises';
import { Tiktoken } from 'js-tiktoken/lite';
import ranks from 'js-tiktoken/ranks/cl100k_base';
const root=new URL('../',import.meta.url),encoder=new Tiktoken(ranks),count=s=>encoder.encode(s).length;
const paths=['bootstrap/SKILL.md', 'SKILL.md',...(await readdir(new URL('references/',root))).filter(s=>s.endsWith('.md')).sort().map(s=>'references/'+s)];
const counts=Object.fromEntries(await Promise.all(paths.map(async p=>[p,count(await readFile(new URL(p,root),'utf8'))])));
const entry=await readFile(new URL('SKILL.md',root),'utf8'),front=entry.split('---')[1];
const routes={
  'Discovery metadata':count(front),
  'Installed bootstrap':counts['bootstrap/SKILL.md'],
  'Bootstrap + current guidance entry':counts['bootstrap/SKILL.md']+counts['SKILL.md'],
  'Scoped PPTX edit + final review':counts['bootstrap/SKILL.md']+counts['SKILL.md']+counts['references/editing.md']+counts['references/review.md'],
  'New PPTX deck + final review':counts['bootstrap/SKILL.md']+counts['SKILL.md']+counts['references/design.md']+counts['references/authoring.md']+counts['references/review.md'],
  'New Google deck + final review':counts['bootstrap/SKILL.md']+counts['SKILL.md']+counts['references/design.md']+counts['references/authoring.md']+counts['references/google-slides.md']+counts['references/review.md'],
};
const report='Measured with `cl100k_base`; cumulative whole-file instruction counts.\n\n| Reading path | Tokens |\n| --- | ---: |\n'+Object.entries(routes).map(([k,v])=>`| ${k} | ${v.toLocaleString('en-US')} |`).join('\n')+'\n\nIntake, workspace and brand integration guides load only when needed; brand\ncontracts and query results add task-dependent context.\n';
const url=new URL('README.md',root),readme=await readFile(url,'utf8'),pattern=/<!-- CONTEXT-USAGE:START -->[\s\S]*?<!-- CONTEXT-USAGE:END -->/;
if(!pattern.test(readme))throw new Error('Missing context report markers');
const next=readme.replace(pattern,`<!-- CONTEXT-USAGE:START -->\n${report}<!-- CONTEXT-USAGE:END -->`);
if(process.argv.includes('--write'))await writeFile(url,next);else if(next!==readme){console.error('Context counts changed; run npm run context:update');process.exitCode=1;}
console.log(JSON.stringify({routes,files:counts},null,2));
