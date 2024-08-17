const knx = require('./db');
const Card = require('./models/card.model');
const PaymentAttempt = require('./models/payment-attempt.model');

class DbService {
	knx = knx;

	/**
	 *
	 * @param {number} id
	 * @returns {Promise<Card>}
	 */
	async findCardById(id) {
		return this.knx('cards').select('*').where('id', id).first();
	}

	/**
	 *
	 * @param {string} run_id
	 * @param {string} order_id
	 * @param {string} timestamp
	 * @param {string} card_number
	 * @param {string} expiration_date
	 * @param {string} cvv
	 * @param {string} last_known_ip
	 * @param {string} trucentive_link
	 * @param {number} balance
	 * @returns {Promise<Card>}
	 */
	async saveCard(
		run_id,
		order_id,
		timestamp,
		card_number,
		expiration_date,
		cvv,
		last_known_ip,
		trucentive_link,
		balance
	) {
		const [id] = await this.knx('cards')
			.insert({
				card_number,
				expiration_date,
				cvv,
				order_id,
				trucentive_link,
				balance,
				last_known_ip,
				last_run_id: run_id,
				was_attempted: true,
				was_successful: false,
				is_past_run: true
			})
			.onConflict('card_number')
			.ignore();
		// If source project already stored this info,
		// default to the existing record.

		return this.findCardById(id);
	}

	/**
	 *
	 * @param {number} id
	 * @returns {Promise<PaymentAttempt>}
	 */
	async findPaymentAttemptById(id) {
		return this.knx('payment_attempts').select('*').where('id', id).first();
	}

	/**
	 *
	 * @param {string} run_id
	 * @param {number} card_id
	 * @param {string | undefined} order_id
	 * @returns {Promise<PaymentAttempt>}
	 */
	async savePaymentAttempt(run_id, card_id, order_id = undefined) {
		const [id] = await this.knx('payment_attempts')
			.insert({
				run_id,
				order_id,
				card_id
			})
			.onConflict('run_id')
			.ignore();
		// If source project already stored this info,
		// default to the existing record.

		return this.findPaymentAttemptById(id);
	}
}

module.exports = new DbService();
