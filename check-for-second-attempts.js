const Fs = require('fs');
const Path = require('path');
const {
	arrayToCSV,
	csvToArray,
	logMemoryUsage,
	waitFor,
	executeSSH,
	execute
} = require('./utils');
const {
	already_found,
	start_from
} = require('./second-attempts-storage/duplicates');

const log_storage_path = Path.join(__dirname, 'logs-storage');
const all_time_log_path = Path.join(log_storage_path, 'all-time.log');
const cards_info_path = Path.join(__dirname, 'results', 'cards-info.csv');
const output_path = Path.join(__dirname, 'results', 'cards-info-revised.csv');

const asyncMain = async () => {
	const cards_info_csv = Fs.readFileSync(cards_info_path).toString();
	const cards_info_arr = csvToArray(cards_info_csv);
	const total = cards_info_arr.length;

	const new_cards_info_arr = [];

	for (let [index, card_info] of cards_info_arr.entries()) {
		const {
			run_id,
			order_id,
			timestamp,
			cardNumber,
			expirationDate,
			cvv,
			lastKnownIp,
			trucentiveLink,
			balance
		} = card_info;
		console.log(
			`Checking element ${index + 1} of ${total}: Card ${cardNumber}`
		);

		if (cardNumber.length !== 16) {
			console.log(
				`This card number does not have 16 characters. Will include it in new array, but it should be looked over.`
			);
			new_cards_info_arr.push(card_info);
			continue;
		}

		if (index < start_from) {
			console.log(`This element was already processed before.`);
			// If index < start_from, we already evaluated, there's no longer need for grep.
			// If it's in the already_found array, we should not include it in the new array.
			// If it's not in the already_found array, we should include it.
			if (already_found.includes(cardNumber)) {
				console.log(
					`Run ID ${run_id} already processed in the past: It was in the already_found array. Removing it from new array.`
				);
				continue;
			} else {
				console.log(
					`Run ID ${run_id} already processed in the past: It was not in the already_found array. Adding it to new array.`
				);
				new_cards_info_arr.push(card_info);
				continue;
			}
		}

		let grep_command = `grep "${cardNumber}" ${all_time_log_path}`;

		/**
		 * Grep result as string with "\n" characters.
		 * @type { string }
		 */
		let grep_result = await execute(grep_command);

		const grep_arr = grep_result
			? grep_result.split('\n').map(r => {
					try {
						return JSON.parse(r);
					} catch (err) {
						return {};
					}
				})
			: [];

		/**
		 * Run ID's that at some point contain this card number
		 */
		const run_ids_set = new Set();
		// Will start from this card_info's run_id and not before, since it's chronological
		const first_run_id = grep_arr.findIndex(g => g.runId === run_id);
		for (let i = first_run_id + 1; i < grep_arr.length; i++) {
			const log = grep_arr[i];
			if (log.runId) {
				if (log.runId === run_id) continue;

				run_ids_set.add(log.runId);
			}
		}

		// No other Run ID mentioned this card number; skip.
		if (run_ids_set.size === 0) {
			console.log(
				`No other Run ID's show this card number. Adding this to new array and continuing.`
			);
			new_cards_info_arr.push(card_info);
			continue;
		}

		// Look for each of the Run ID's in the all-time.log file.
		grep_command = `grep `;
		for (const this_run_id of run_ids_set) {
			grep_command += `-e "${this_run_id}" `;
		}
		grep_command += ` ${all_time_log_path}`;
		const logs_of_interest = await execute(grep_command);
		// Parse them into JSON.
		const logs_of_interest_arr = logs_of_interest
			? logs_of_interest.split('\n').map(r => {
					try {
						return JSON.parse(r);
					} catch (err) {
						return {};
					}
				})
			: [];

		const successful_attempt = logs_of_interest_arr.find(log => {
			return log.msg === 'Response from payOnLandingPagePnm' && log.isSuccess;
		});

		if (successful_attempt) {
			console.log(
				`Run ID ${successful_attempt.runId} was actually successful with this one. Removing it from new array.`
			);
			continue;
		}

		console.log(
			`Card Number was not successfully used after all it seems. Adding it to new array.`
		);
		new_cards_info_arr.push(card_info);
	}

	/**
	 * CSV-formatted string of final cards info array.
	 * @type { string }
	 */
	const new_cards_info_csv = arrayToCSV(new_cards_info_arr);

	Fs.writeFileSync(output_path, new_cards_info_csv);
	console.log(`Finished Unused Cards Report - Check for second attempts.`);
};

asyncMain()
	.then(() => console.log('Finished'))
	.catch(err => {
		console.error(err);
		console.error('Error');
	});
