'use strict';

const VALID_STATUSES = ['todo', 'doing', 'done'];

/**
 * Valideerib story loomise/muutmise sisendi.
 * Tagastab { errors } kus errors on massiiv inimloetavatest veateadetest.
 * Tühi massiiv tähendab, et sisend on korras.
 */
function validateStoryInput(input, { partial = false } = {}) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    return { errors: ['Päring peab sisaldama JSON objekti.'] };
  }

  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  // title
  if (!partial || has('title')) {
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      errors.push('Pealkiri on kohustuslik ja ei tohi olla tühi.');
    } else if (input.title.length > 200) {
      errors.push('Pealkiri on liiga pikk (maksimaalselt 200 tähemärki).');
    }
  }

  // description
  if (!partial || has('description')) {
    if (typeof input.description !== 'string') {
      errors.push('Kirjeldus peab olema tekst.');
    }
  }

  // status
  if (has('status')) {
    if (!VALID_STATUSES.includes(input.status)) {
      errors.push(`Staatus peab olema üks järgnevatest: ${VALID_STATUSES.join(', ')}.`);
    }
  } else if (!partial) {
    errors.push('Staatus on kohustuslik.');
  }

  // points
  if (!partial || has('points')) {
    const points = input.points;
    if (points === undefined || points === null || points === '') {
      errors.push('Punktid on kohustuslikud.');
    } else if (typeof points !== 'number' || !Number.isInteger(points)) {
      errors.push('Punktid peavad olema täisarv.');
    } else if (points < 0) {
      errors.push('Punktid ei tohi olla negatiivsed.');
    } else if (points > 1000) {
      errors.push('Punktid ei tohi olla suuremad kui 1000.');
    }
  }

  // acceptanceCriteria
  if (!partial || has('acceptanceCriteria')) {
    const ac = input.acceptanceCriteria;
    if (!Array.isArray(ac) || ac.length === 0 || ac.some((c) => typeof c !== 'string' || c.trim().length === 0)) {
      errors.push('Vähemalt üks vastuvõtutingimus on kohustuslik.');
    } else if (ac.some((c) => c.length > 300)) {
      errors.push('Vastuvõtutingimus on liiga pikk (maksimaalselt 300 tähemärki).');
    }
  }

  return { errors };
}

function validateComment(input) {
  const errors = [];
  if (!input || typeof input.text !== 'string' || input.text.trim().length === 0) {
    errors.push('Kommentaari tekst on kohustuslik ja ei tohi olla tühi.');
  } else if (input.text.length > 2000) {
    errors.push('Kommentaar on liiga pikk (maksimaalselt 2000 tähemärki).');
  }
  return { errors };
}

module.exports = { VALID_STATUSES, validateStoryInput, validateComment };
