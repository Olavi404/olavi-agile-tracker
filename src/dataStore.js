'use strict';

const fs = require('fs');
const path = require('path');

const { DatabaseSync } = require('node:sqlite');

// Keep the existing JSON source as a migration backup.
// A sibling SQLite file is the authoritative store after first initialization.
function createStore(filePath) {
  const dbPath = filePath + '.sqlite';
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL)');
  function transaction(operation) {
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
  transaction(() => {
    if (database.prepare('SELECT id FROM app_state WHERE id=1').get()) return;
    const initial = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
      : { stories: [], nextId: 1, nextCommentId: 1 };
    if (!Array.isArray(initial.stories) || !Number.isSafeInteger(initial.nextId) ||
        !Number.isSafeInteger(initial.nextCommentId) || initial.nextId < 1 || initial.nextCommentId < 1 ||
        initial.stories.some(s => !Number.isSafeInteger(s.id) || s.id < 1 || !Array.isArray(s.comments) ||
          s.id >= initial.nextId || s.comments.some(c => !Number.isSafeInteger(c.id) || c.id < 1 || c.id >= initial.nextCommentId)) ||
        new Set(initial.stories.map(s => s.id)).size !== initial.stories.length ||
        new Set(initial.stories.flatMap(s => s.comments.map(c => c.id))).size !== initial.stories.flatMap(s => s.comments).length) {
      throw new Error('Invalid legacy JSON; original file left untouched');
    }
    database.prepare('INSERT INTO app_state(id,payload) VALUES(1,?)').run(JSON.stringify(initial));
  });
  function read() {
    return JSON.parse(database.prepare('SELECT payload FROM app_state WHERE id=1').get().payload);
  }
  function write(db) {
    database.prepare('UPDATE app_state SET payload=? WHERE id=1').run(JSON.stringify(db));
  }
  function getAll() {
    return read().stories;
  }

  function getById(id) {
    return read().stories.find((s) => s.id === Number(id));
  }

  function create(input) {
    const db = read();
    const now = new Date().toISOString();
    const maxPriority = db.stories.reduce((max, s) => Math.max(max, s.priority || 0), 0);
    const story = {
      id: db.nextId,
      title: input.title.trim(),
      description: (input.description || '').trim(),
      status: input.status || 'todo',
      points: input.points,
      priority: maxPriority + 1,
      acceptanceCriteria: input.acceptanceCriteria,
      comments: [],
      createdAt: now,
      updatedAt: now,
    };
    db.stories.push(story);
    db.nextId += 1;
    write(db);
    return story;
  }

  function update(id, input) {
    const db = read();
    const story = db.stories.find((s) => s.id === Number(id));
    if (!story) return null;
    if (input.title !== undefined) story.title = input.title.trim();
    if (input.description !== undefined) story.description = input.description.trim();
    if (input.status !== undefined) story.status = input.status;
    if (input.points !== undefined) story.points = input.points;
    if (input.acceptanceCriteria !== undefined) story.acceptanceCriteria = input.acceptanceCriteria;
    story.updatedAt = new Date().toISOString();
    write(db);
    return story;
  }

  function remove(id) {
    const db = read();
    const idx = db.stories.findIndex((s) => s.id === Number(id));
    if (idx === -1) return false;
    db.stories.splice(idx, 1);
    write(db);
    return true;
  }

  function updateStatus(id, status) {
    const db = read();
    const story = db.stories.find((s) => s.id === Number(id));
    if (!story) return null;
    story.status = status;
    story.updatedAt = new Date().toISOString();
    write(db);
    return story;
  }

  /**
   * Uuendab story'de järjekorra (priority välja) vastavalt etteantud
   * ID-de nimekirjale. Esimene ID nimekirjas saab prioriteedi 1 jne.
   * Järjekord säilib, kuna see kirjutatakse kettale, mitte mällu.
   */
  function reorder(orderedIds) {
    const db = read();
    orderedIds.forEach((id, index) => {
      const story = db.stories.find((s) => s.id === Number(id));
      if (story) story.priority = index + 1;
    });
    write(db);
    return db.stories;
  }

  function addComment(storyId, text) {
    const db = read();
    const story = db.stories.find((s) => s.id === Number(storyId));
    if (!story) return null;
    const comment = {
      id: db.nextCommentId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    story.comments.push(comment);
    db.nextCommentId += 1;
    story.updatedAt = new Date().toISOString();
    write(db);
    return comment;
  }

  function removeComment(storyId, commentId) {
    const db = read();
    const story = db.stories.find((s) => s.id === Number(storyId));
    if (!story) return null;
    const idx = story.comments.findIndex((c) => c.id === Number(commentId));
    if (idx === -1) return false;
    story.comments.splice(idx, 1);
    story.updatedAt = new Date().toISOString();
    write(db);
    return true;
  }

  return {
    close: () => database.close(),
    getAll,
    getById,
    create: (...args) => transaction(() => create(...args)),
    update: (...args) => transaction(() => update(...args)),
    remove: (...args) => transaction(() => remove(...args)),
    updateStatus: (...args) => transaction(() => updateStatus(...args)),
    reorder: (...args) => transaction(() => reorder(...args)),
    addComment: (...args) => transaction(() => addComment(...args)),
    removeComment: (...args) => transaction(() => removeComment(...args)),
  };
}

module.exports = { createStore };
