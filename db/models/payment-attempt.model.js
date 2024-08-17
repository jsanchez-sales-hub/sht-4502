module.exports = class PaymentAttempt {
	/**
	 * @type { number }
	 */
	id

	/**
	 * @type { string }
	 */
	run_id

	/**
	 * @type { string }
	 */
	attempted_at

	/**
	 * @type { string | null }
	 */
	order_id

	/**
	 * @type { number }
	 */
	card_id

	/**
	 * @type { string }
	 */
	created_at

	/**
	 * @type { string }
	 */
	updated_at
}
