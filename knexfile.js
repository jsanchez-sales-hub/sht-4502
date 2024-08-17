const { Knex } = require('knex');
const { DateTime } = require('luxon');
require('dotenv').config();

const typeCast = (field, next) => {
	if (field.type == 'NEWDECIMAL' && field.length > 0)
		return parseFloat(field.string());
	if (field.type == 'TINY' && field.length == 1) return field.string() == '1';
	if (field.type == 'DATE' && field.length > 0)
		return DateTime.fromISO(field.string()).toISODate();

	return next();
};

/**
 * @type { Knex.Config }
 */
const settings = {
	client: 'mysql2',
	connection: {
		host: process.env.MYSQL_HOST,
		port: +(process.env.MYSQL_PORT ?? 3306),
		user: process.env.MYSQL_USER,
		password: process.env.MYSQL_PASS,
		database: process.env.MYSQL_DB,
		typeCast
	},
	debug: true
};

module.exports = settings;
