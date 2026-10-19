#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const python=resolve('.harness-slides','test-python','bin','python'),env={...process.env};
if(!env.HARNESS_IMAGE_TEST_PYTHON&&existsSync(python))env.HARNESS_IMAGE_TEST_PYTHON=python;
if(process.argv.includes('--native')){env.HARNESS_BROWSER_TESTS='1';env.HARNESS_RENDER_TESTS='1';}
const tests=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).map(name=>'tests/'+name);
const result=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit',env});process.exitCode=result.status??1;
