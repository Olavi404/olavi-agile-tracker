'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { createStore } = require('../src/dataStore');
test('two workers preserve all writes and unique IDs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'agile-sqlite-'));
  const file = path.join(dir,'stories.json');
  const initial = {stories:[], nextId:1, nextCommentId:1};
  fs.writeFileSync(file, JSON.stringify(initial));
  const store = createStore(file);
  try {
    const run = () => new Promise((resolve,reject) => {
      const w = new Worker(`
        const {workerData} = require('node:worker_threads');
        const {createStore} = require(workerData.module);
        const store = createStore(workerData.file);
        try {
          for(let i=0;i<20;i++) store.create({title:'Test '+i,points:1,acceptanceCriteria:['done']});
        } finally { store.close(); }
      `, {eval:true,workerData:{module:require.resolve('../src/dataStore'),file}});
      w.on('error',reject); w.on('exit',code => code===0?resolve():reject(new Error('worker exit '+code)));
    });
    await Promise.all([run(),run()]);
    assert.equal(store.getAll().length,40);
    assert.equal(new Set(store.getAll().map(s=>s.id)).size,40);
    assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),initial);
  } finally { store.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
test('existing JSON migrated once', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agile-migrate-'));
  const file=path.join(dir,'stories.json');
  fs.writeFileSync(file,JSON.stringify({stories:[{id:1,title:'Legacy',comments:[]}],nextId:2,nextCommentId:1}));
  let store=createStore(file);
  try { assert.equal(store.getAll()[0].title,'Legacy'); store.create({title:'New',points:1,acceptanceCriteria:['done']}); }
  finally { store.close(); }
  store=createStore(file);
  try { assert.equal(store.getAll().length,2); } finally { store.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});

test('deleted story cannot be updated by another connection', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agile-race-'));
  const file=path.join(dir,'stories.json');
  const a=createStore(file), b=createStore(file);
  try {
    const s=a.create({title:'test',points:1,acceptanceCriteria:['done']});
    assert.equal(b.remove(s.id),true);
    assert.equal(a.update(s.id,{title:'changed'}),null);
    assert.equal(a.removeComment(s.id,1),null);
  } finally { a.close(); b.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
