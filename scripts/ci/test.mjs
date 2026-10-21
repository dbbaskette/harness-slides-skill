#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const python=resolve('.harness-slides','test-python','bin','python'),env={...process.env};
if(!env.HARNESS_IMAGE_TEST_PYTHON&&existsSync(python))env.HARNESS_IMAGE_TEST_PYTHON=python;
// Tests never reach this computer's preview pool: each run gets its own empty pool state.
const poolState=env.HARNESS_PREVIEW_POOL_STATE?null:mkdtempSync(join(tmpdir(),'harness-pool-state-'));if(poolState)env.HARNESS_PREVIEW_POOL_STATE=poolState;
if(process.argv.includes('--native')){env.HARNESS_BROWSER_TESTS='1';env.HARNESS_RENDER_TESTS='1';}
const tests=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).map(name=>'tests/'+name);
const result=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit',env});process.exitCode=result.status??1;
if(poolState)rmSync(poolState,{recursive:true,force:true});
