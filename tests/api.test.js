'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

// Iga test saab oma ajutise andmefaili, et testid ei mõjutaks üksteist
// ega päris rakenduse andmeid (data/stories.json).
function startTestServer() {
  const tmpFile = path.join(os.tmpdir(), `agile-tracker-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const app = createApp(tmpFile);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        cleanup: () => {
          server.close();
          if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        },
      });
    });
  });
}

test('GET /api/stories tagastab tühja nimekirja alguses', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/stories`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, []);
  } finally {
    cleanup();
  }
});

test('POST /api/stories loob uue story korrektse sisendiga', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test story',
        description: 'Kirjeldus',
        status: 'todo',
        points: 5,
        acceptanceCriteria: ['Tingimus 1'],
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.title, 'Test story');
    assert.equal(body.points, 5);
    assert.ok(Number.isInteger(body.id));
    assert.deepEqual(body.comments, []);
  } finally {
    cleanup();
  }
});

test('POST /api/stories tagastab 400 vigaste punktidega (negatiivne)', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Vigane story',
        description: '',
        status: 'todo',
        points: -3,
        acceptanceCriteria: ['x'],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => e.includes('negatiivsed')));
  } finally {
    cleanup();
  }
});

test('POST /api/stories tagastab 400 kui vastuvõtutingimused puuduvad', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Story ilma tingimusteta',
        description: 'x',
        status: 'todo',
        points: 2,
        acceptanceCriteria: [],
      }),
    });
    assert.equal(res.status, 400);
  } finally {
    cleanup();
  }
});

test('GET /api/stories/:id tagastab 404 tundmatu ID korral', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/stories/9999`);
    assert.equal(res.status, 404);
  } finally {
    cleanup();
  }
});

test('PATCH /api/stories/:id/status muudab staatust', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const createRes = await fetch(`${baseUrl}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Story',
        description: 'x',
        status: 'todo',
        points: 1,
        acceptanceCriteria: ['x'],
      }),
    });
    const created = await createRes.json();

    const patchRes = await fetch(`${baseUrl}/api/stories/${created.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    assert.equal(patchRes.status, 200);
    const updated = await patchRes.json();
    assert.equal(updated.status, 'done');
  } finally {
    cleanup();
  }
});

test('PATCH /api/stories/:id/status tagastab 400 vigase staatusega', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const createRes = await fetch(`${baseUrl}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Story',
        description: 'x',
        status: 'todo',
        points: 1,
        acceptanceCriteria: ['x'],
      }),
    });
    const created = await createRes.json();
    const patchRes = await fetch(`${baseUrl}/api/stories/${created.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'blocked' }),
    });
    assert.equal(patchRes.status, 400);
  } finally {
    cleanup();
  }
});

test('PATCH /api/stories/reorder salvestab uue järjekorra', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const ids = [];
    for (const title of ['A', 'B', 'C']) {
      const res = await fetch(`${baseUrl}/api/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: 'x', status: 'todo', points: 1, acceptanceCriteria: ['x'] }),
      });
      const story = await res.json();
      ids.push(story.id);
    }
    const reversed = [...ids].reverse();
    const reorderRes = await fetch(`${baseUrl}/api/stories/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: reversed }),
    });
    assert.equal(reorderRes.status, 200);

    const listRes = await fetch(`${baseUrl}/api/stories`);
    const list = await listRes.json();
    const sortedIds = list.sort((a, b) => a.priority - b.priority).map((s) => s.id);
    assert.deepEqual(sortedIds, reversed);
  } finally {
    cleanup();
  }
});

test('POST /api/stories/:id/comments lisab kommentaari koos ajaga', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const createRes = await fetch(`${baseUrl}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Story', description: 'x', status: 'todo', points: 1, acceptanceCriteria: ['x'] }),
    });
    const created = await createRes.json();

    const commentRes = await fetch(`${baseUrl}/api/stories/${created.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Väga hea!' }),
    });
    assert.equal(commentRes.status, 201);
    const comment = await commentRes.json();
    assert.equal(comment.text, 'Väga hea!');
    assert.ok(comment.createdAt);

    const getRes = await fetch(`${baseUrl}/api/stories/${created.id}`);
    const story = await getRes.json();
    assert.equal(story.comments.length, 1);
  } finally {
    cleanup();
  }
});

test('DELETE /api/stories/:id kustutab story', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const createRes = await fetch(`${baseUrl}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Story', description: 'x', status: 'todo', points: 1, acceptanceCriteria: ['x'] }),
    });
    const created = await createRes.json();

    const delRes = await fetch(`${baseUrl}/api/stories/${created.id}`, { method: 'DELETE' });
    assert.equal(delRes.status, 204);

    const getRes = await fetch(`${baseUrl}/api/stories/${created.id}`);
    assert.equal(getRes.status, 404);
  } finally {
    cleanup();
  }
});
