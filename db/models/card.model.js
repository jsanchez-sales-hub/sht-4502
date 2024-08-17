module.exports = class Card {
	/**
	 * @type { number }
	 */
	id

	/**
	 * @type { string }
	 */
	card_number

	/**
	 * @type { string }
	 */
	expiration_date

	/**
	 * @type { string }
	 */
	cvv

	/**
	 * @type { string | null }
	 */
	order_id

	/**
	 * @type { string | null }
	 */
	trucentive_link

	/**
	 * @type { number }
	 */
	balance

	/**
	 * @type { string | null }
	 */
	last_known_ip

	/**
	 * @type { string | null }
	 */
	last_run_id

	/**
	 * @type { boolean }
	 */
	was_attempted

	/**
	 * @type { number }
	 */
	payment_attempts

	/**
	 * @type { boolean | null }
	 */
	was_successful

	/**
	 * @type { string | null }
	 */
	success_at

	/**
	 * @type { boolean }
	 */
	is_past_run

	/**
	 * @type { string }
	 */
	created_at

	/**
	 * @type { string }
	 */
	updated_at
}
