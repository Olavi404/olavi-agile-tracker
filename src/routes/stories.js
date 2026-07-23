'use strict';

const express = require('express');
const { validateStoryInput, validateComment, VALID_STATUSES } = require('../validation');

/**
 * Loob story'de REST API router'i, mis kasutab etteantud andmehoidlat (store).
 * Router on eraldi funktsioon, et seda saaks testides kasutada
 * koos ajutise (test-only) andmefailiga.
 */
function createStoriesRouter(store) {
  const router = express.Router();

  function notFound(res, id) {
    return res.status(404).json({ error: `Story ID-ga ${id} ei leitud.` });
  }

  // GET /api/stories - kõikide story'de nimekiri, valikuliste filtritega
  router.get('/', (req, res) => {
    let stories = store.getAll();
    const { status, search, minPoints, maxPoints } = req.query;

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Vigane staatuse filter. Lubatud: ${VALID_STATUSES.join(', ')}.` });
      }
      stories = stories.filter((s) => s.status === status);
    }

    if (search) {
      const needle = String(search).toLowerCase();
      stories = stories.filter(
        (s) => s.title.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle)
      );
    }

    if (minPoints !== undefined) {
      const min = Number(minPoints);
      if (Number.isNaN(min)) return res.status(400).json({ error: 'minPoints peab olema number.' });
      stories = stories.filter((s) => s.points >= min);
    }

    if (maxPoints !== undefined) {
      const max = Number(maxPoints);
      if (Number.isNaN(max)) return res.status(400).json({ error: 'maxPoints peab olema number.' });
      stories = stories.filter((s) => s.points <= max);
    }

    stories = [...stories].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    res.status(200).json(stories);
  });

  // GET /api/stories/:id - ühe story detailid
  router.get('/:id', (req, res) => {
    const story = store.getById(req.params.id);
    if (!story) return notFound(res, req.params.id);
    res.status(200).json(story);
  });

  // POST /api/stories - uue story loomine
  router.post('/', (req, res) => {
    const { errors } = validateStoryInput(req.body, { partial: false });
    if (errors.length > 0) return res.status(400).json({ errors });
    const story = store.create(req.body);
    res.status(201).json(story);
  });

  // PUT /api/stories/:id - story täielik muutmine
  router.put('/:id', (req, res) => {
    const existing = store.getById(req.params.id);
    if (!existing) return notFound(res, req.params.id);
    const { errors } = validateStoryInput(req.body, { partial: true });
    if (errors.length > 0) return res.status(400).json({ errors });
    const story = store.update(req.params.id, req.body);
    res.status(200).json(story);
  });

  // DELETE /api/stories/:id - story kustutamine
  router.delete('/:id', (req, res) => {
    const ok = store.remove(req.params.id);
    if (!ok) return notFound(res, req.params.id);
    res.status(204).send();
  });

  // PATCH /api/stories/reorder - backlogi järjekorra uuendamine
  // Body: { "orderedIds": [4, 1, 3, 2] }
  router.patch('/reorder', (req, res) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds peab olema mittetühi ID-de massiiv.' });
    }
    const stories = store.reorder(orderedIds);
    res.status(200).json(stories);
  });

  // PATCH /api/stories/:id/status - story staatuse muutmine
  router.patch('/:id/status', (req, res) => {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Staatus peab olema üks järgnevatest: ${VALID_STATUSES.join(', ')}.` });
    }
    const story = store.updateStatus(req.params.id, status);
    if (!story) return notFound(res, req.params.id);
    res.status(200).json(story);
  });

  // POST /api/stories/:id/comments - kommentaari lisamine
  router.post('/:id/comments', (req, res) => {
    const { errors } = validateComment(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });
    const comment = store.addComment(req.params.id, req.body.text);
    if (!comment) return notFound(res, req.params.id);
    res.status(201).json(comment);
  });

  // DELETE /api/stories/:id/comments/:commentId - kommentaari kustutamine (lisavõimalus)
  router.delete('/:id/comments/:commentId', (req, res) => {
    const story = store.getById(req.params.id);
    if (!story) return notFound(res, req.params.id);
    const ok = store.removeComment(req.params.id, req.params.commentId);
    if (!ok) return res.status(404).json({ error: `Kommentaari ID-ga ${req.params.commentId} ei leitud.` });
    res.status(204).send();
  });

  return router;
}

module.exports = { createStoriesRouter };
