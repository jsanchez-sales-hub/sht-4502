const { Knex } = require('knex');
const settings = require('../knexfile');

/**
 * @type { Knex }
 */
const knex = require('knex')(settings);

module.exports = knex;
