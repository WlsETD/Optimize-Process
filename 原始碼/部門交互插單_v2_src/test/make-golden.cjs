/* 用 v1 原檔的引擎產生黃金結果。只在第一次建立時執行：node test/make-golden.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../../demo-v1/engine.js');
const { SAMPLES, summarize } = require('./cases.cjs');
const out = {};
for (const s of SAMPLES) out[s.key] = summarize(E, s);
fs.writeFileSync(path.join(__dirname, 'golden.json'), JSON.stringify(out, null, 2) + '\n');
console.log('已寫入 golden.json');
