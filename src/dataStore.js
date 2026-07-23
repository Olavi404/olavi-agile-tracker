'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Lihtne fail-põhine (JSON) andmehoidla story'de jaoks.
 * Iga muutus loetakse-kirjutatakse kohe kettale, et andmed säiliksid
 * serveri taaskäivitumisel / lehe uuendamisel.
 *
 * Pärisrakenduses kasutaksime päris andmebaasi (nt SQLite/MariaDB),
 * kuid better-sqlite3 ei kompileerunud kasutatava Node.js versiooniga,
 * seega valisime lihtsama ja töökindlama JSON-faili lahenduse.
 */
function createStore(filePath) {
  ensureFile(filePath);

  function ensureFile(fp) {
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(fp)) {
      fs.writeFileSync(fp, JSON.stringify({ stories: [], nextId: 1, nextCommentId: 1 }, null, 2));
    }
  }

  function read() {
    const raw = fs.readFileSync(filePath, 'utf-8');
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error('Andmefail on rikutud (vigane JSON): ' + err.message);
    }
  }

  function write(db) {
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2));
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
    getAll,
    getById,
    create,
    update,
    remove,
    updateStatus,
    reorder,
    addComment,
    removeComment,
  };
}

module.exports = { createStore };
