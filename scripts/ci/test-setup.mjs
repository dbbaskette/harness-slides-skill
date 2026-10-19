#!/usr/bin/env node
// Test dependencies stay in repository-private state; never alter system Python.
import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const dir=resolve('.harness-slides','test-python');await mkdir(resolve('.harness-slides'),{recursive:true});
execFileSync('python3',['-m','venv',dir],{stdio:'inherit'});
execFileSync(join(dir,'bin','python'),['-m','pip','install','-r','scripts/ci/requirements.txt'],{stdio:'inherit'});
console.log('Test Python ready. npm test uses this environment automatically.');
