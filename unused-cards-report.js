const Fs = require('fs');
const Path = require('path');
const ReadLine = require('node:readline');
const { arrayToCSV, csvToArray, waitFor } = require('./utils');

const log_storage_path = Path.join(__dirname, 'logs-storage');
const all_time_log_path = Path.join(log_storage_path, 'all-time.log');
const output_path = Path.join(__dirname, 'results', 'cards-info.csv');

const pnm_report_filepath = process.env.PNM_REPORT_FILEPATH ?? null;

/**
 * Sets the amount of logs to be output. Try not to use "all"; the sheer amount of logs
 * can make the whole script much slower.
 * @type { string }
 */
const LOG = 'mid';

/**
 * Creates set of strings of logs' run_id only where the program reached a point of logging a card's information.
 * @param boolean filter
 * @returns
 */
const generateRunIdsSet = async (filter = true) => {
	console.log(`Generating Run IDs Set...`);
	/**
	 * Set of run_id's
	 * @type { Set<string> }
	 */
	const run_ids_set = new Set();

	// Read through file and adds run_id to run_ids_set
	// TODO - Use grep for this possibly
	let fileStream = Fs.createReadStream(all_time_log_path);
	let rl = ReadLine.createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});
	let line = 1;
	for await (const log of rl) {
		if (LOG === 'all' || (LOG === 'mid' && line % 100 === 0)) {
			console.log(`[generateRunIdsSet] Log ${line}...`);
		}

		let json;
		try {
			json = JSON.parse(log);
		} catch (err) {
			// This shouldn't happen, as all logs are supposed to be objects.
			console.error(`Log in position ${line} is not JSON-able: ${log}`);
			break;
		}

		// Add to set only if Filtering is being ignored OR msg coincides with
		// either of these two msg values (which indicate a log of cardData). runId must also exist.
		if (json.runId && !filter) {
			run_ids_set.add(json.runId);
		} else if (
			json.runId &&
			(json.msg === 'Response from processCard' ||
				json.msg === 'Card stored to use')
		) {
			run_ids_set.add(json.runId);
		}

		line++;
	}

	console.log(`Generated Run IDs Set.`);

	return run_ids_set;
};

/**
 * Reads Logs files, finds only the logs with the run_id's to be evaluated and returns matches as array of objects
 * @param { Set<string> | null } run_ids_set
 * @returns
 */
const generateLogsArr = async (run_ids_set = null) => {
	console.log(`Generating All Logs Array...`);
	/**
	 * Array of objects for all logs (no filter)
	 * @type { any[] }
	 */
	const logs_arr = [];

	// Read through file and fill logs_arr array
	let fileStream = Fs.createReadStream(all_time_log_path);
	let rl = ReadLine.createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});
	let line = 1;
	for await (const log of rl) {
		if (LOG === 'all' || (LOG === 'mid' && line % 100 === 0)) {
			console.log(`[generateLogsArr] Log ${line}...`);
		}

		let json;
		try {
			json = JSON.parse(log);
		} catch (err) {
			console.error(`Log in position ${line} is not JSON-able: ${log}`);
			break;
		}

		// Only pushes into array if log has runId AND
		// run_ids_set is null or includes said runId.
		if (json.runId && run_ids_set === null) logs_arr.push(json);
		else if (json.runId && run_ids_set?.has(json.runId)) logs_arr.push(json);

		line++;
	}

	console.log(`Generated All Logs Array.`);

	return logs_arr;
};

/**
 * Loops through run_ids set, collects all logs from each run_id, and checks if the logs include an error during
 * makeRequests function (msg: 'Error while making Requests'). If it finds one, it includes all the logs related
 * to that run_id in the returning array. It returns the array sorted by time ascendently.
 * @param { any[] } logs_arr
 * @param { Set<string> } run_ids_set
 */
const generateLogsWithFailedPaymentsArr = (logs_arr, run_ids_set) => {
	console.log(`Generating Logs With Failed Payments as Array...`);
	const total = run_ids_set.size;
	let index = 1;
	const logs_with_failed_payments = [];
	for (const run_id of run_ids_set) {
		if (LOG === 'all' || (LOG === 'mid' && index % 100 === 0)) {
			console.log(`Evaluating Run ID ${run_id} (${index} of ${total})...`);
		}
		const logs_with_run_id = logs_arr.filter(l => l.runId === run_id);
		if (logs_with_run_id.some(l => l.msg === 'Error while making Requests')) {
			logs_with_failed_payments.push(...logs_with_run_id);
		}
		index++;
	}
	// Sort them by time again (It should not be that necessary but to be safe)
	console.log(`Sorting by time...`);
	logs_with_failed_payments.sort((a, b) => a.time - b.time);

	console.log(`Generated Logs With Failed Payments as Array.`);

	return logs_with_failed_payments;
};

/**
 * Looks up Trucentive Link from logs array
 * @param { any[] } logs_arr
 * @param { string } run_id
 * @returns { string | null }
 */
const getTrucentiveLink = (logs_arr, run_id) => {
	console.log(`Getting Trucentive Link for Run ID ${run_id}...`);
	const trucentiveLinkMsgRegex =
		/^Initial card data stored for trucentiveLink: /;
	let hasTrucentiveLinkProp = false;
	let hasTrucentiveLinkMsg = false;
	let hasDeepTrucentiveLinkProp = false;
	const item = logs_arr.find(l => {
		hasTrucentiveLinkProp = !!l.trucentiveLink;
		hasTrucentiveLinkMsg = trucentiveLinkMsgRegex.test(l.msg);
		hasDeepTrucentiveLinkProp = !!l?.availableStoredCard?.trucentiveLink;
		return (
			l.runId === run_id &&
			(hasTrucentiveLinkProp ||
				hasTrucentiveLinkMsg ||
				hasDeepTrucentiveLinkProp)
		);
	});

	/**
	 * @type { string | null }
	 */
	let trucentiveLink = null;

	if (hasTrucentiveLinkProp) {
		trucentiveLink = item.trucentiveLink;
	} else if (hasTrucentiveLinkMsg) {
		trucentiveLink = item.msg.replace(trucentiveLinkMsgRegex, '');
	} else if (hasDeepTrucentiveLinkProp) {
		trucentiveLink = item.availableStoredCard.trucentiveLink;
	}

	console.log(
		`Got Trucentive Link for Run ID ${run_id}: ${trucentiveLink ?? 'N/A'}.`
	);

	return trucentiveLink;
};

/**
 * Looks up Card Balance from logs array.
 * @param { any[] } logs_arr
 * @param { string } run_id
 */
const getCardBalance = (logs_arr, run_id) => {
	console.log(`Getting Card Balance for Run ID ${run_id}...`);

	let balance;
	const item = logs_arr.find(
		l => l.runId === run_id && l.msg === 'Response from getAmountToCollect'
	);

	if (item && !isNaN(item.amountData.amount)) {
		balance = item.amountData.amount;
	}

	console.log(`Got Card Balance for Run ID ${run_id}: ${balance ?? 'N/A'}.`);
	return balance;
};

/**
 * Generates array of objects with only the cardData property of the logs, its timestamp in readable ISOString format,
 * the Run ID, and the Order ID. It removes any duplicate of card numbers and includes only the most recent instance of
 * the card. It also obtains the trucentive link and card balance by looking up in all the logs.
 * @param { any[] } logs_with_cards
 * @param { any[] } all_logs
 * @returns { { run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string, trucentiveLink: string, balance: string | number, }[] }
 */
const generateCardsInfoArray = (logs_with_cards, all_logs) => {
	console.log(`Generating Cards Info Array...`);
	let cards_info = logs_with_cards.map(l => ({
		run_id: l.runId,
		order_id: l.orderId ?? 'Unknown',
		timestamp: new Date(l.time).toISOString(),
		...l.cardData
	}));

	// Now we sort it descendingly by "time" (Which should be possible by just reversing) to then remove duplicates
	// and keep the most recent instances.
	console.log(`Sorting Cards Info...`);
	let aux_cards_info = [];
	cards_info.reverse().forEach(c => {
		if (!aux_cards_info.find(aux_c => aux_c.cardNumber === c.cardNumber)) {
			const pkg = {
				...c,
				trucentiveLink: getTrucentiveLink(all_logs, c.run_id) ?? 'Unknown',
				balance: getCardBalance(all_logs, c.run_id) ?? 'Unknown'
			};

			aux_cards_info.push(pkg);
		}
	});
	cards_info = aux_cards_info;

	console.log(`Generated Cards Info Array.`);

	return cards_info;
};

/**
 * Returns a logs array filtered to include only the ones that have cardData
 * @param { any[] } logs_arr
 * @returns
 */
const filterLogsWithCardInfo = logs_arr => {
	console.log(`Filtering Logs with Cards Info...`);
	const logs_with_card_info = logs_arr.filter(l => !!l.cardData);
	console.log(`Filtered Logs with Cards Info...`);
	return logs_with_card_info;
};

/**
 * Extracts Card Number, Exp Date, CVV, and other data from a log element. If cardData doesn't exist
 * in the object, returns null.
 * @param {any} log
 * @returns {{ cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string } | null}
 */
const extractCardData = log => {
	// First Attempt logs property "cardData" with all info.
	if (log.cardData) return log.cardData;

	if (log.availableStoredCard) {
		// Second Attempt logs property "availableStoredCard" with information more scattered.
		const card_info = log.availableStoredCard;
		return {
			cardNumber: card_info.cardNumber,
			expirationDate: card_info.expirationDate,
			cvv: card_info,
			lastKnownIp: ''
		};
	}

	return null;
};

/**
 * For each card in cards_info_arr, it checks if that same card number was used later in a successful payment.
 * If it was, it does not return this card in the return value, since it turns out that that card was in fact
 * used.
 * @param { { run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string, trucentiveLink: string, balance: string | number }[] } cards_info_arr
 * @param { any[] } all_logs
 * @returns { { run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string, trucentiveLink: string, balance: string | number }[] }
 */
const removeFalsePaymentFailures = (cards_info_arr, all_logs) => {
	console.log(`Removing False Payment Failures...`);
	const return_array = [];
	const total = cards_info_arr.length;
	for (let [index, card_info] of cards_info_arr.entries()) {
		if (LOG === 'all' || (LOG === 'mid' && index % 100 === 0)) {
			console.log(`Evaluating Card Info ${index + 1} of ${total}...`);
		}

		// Get the index on which this card's run_id shows up in all_logs. Since all_logs are ordered
		// chronologically, we can assume we're finding the first instance by time.
		const card_run_id = card_info.run_id;
		const card_run_id_idx = all_logs.findIndex(l => l.runId === card_run_id);

		// This shouldn't happen; all logs seem to have a run_id
		if (card_run_id_idx < 0) throw 'Run ID Not found.';

		// Run ID's that should not be evaluated in the loop
		// This could be a single value instead of an array.
		const ignore_run_ids = [card_run_id];

		// Var that indicates if the card was actually used for a successful payment.
		let was_successful = false;

		// Loop through all_logs starting from the index found + 1.
		for (let i = card_run_id_idx + 1; i < all_logs.length; i++) {
			// Log being evaluated on this lap
			const log = all_logs[i];
			const log_run_id = log.runId;

			// If run_id should be ignored, continue.
			if (ignore_run_ids.includes(log_run_id)) continue;

			// Extract cardData from log and compare to card_info. If it doesn't have cardData
			// or it doesn't match, continue.
			const log_card_data = extractCardData(log);
			if (!log_card_data || log_card_data.cardNumber !== card_info.cardNumber)
				continue;

			// Checks all the logs that share run_id with the current log being evaluated.
			was_successful = all_logs
				.filter(l => {
					// Only the adequate run_id
					return l.runId === log_run_id;
				})
				.some(l => {
					// Check if any of the other logs shows that the run was ultimately successful
					return l.msg === 'Response from payOnLandingPagePnm' && l.isSuccess;
				});

			if (was_successful) {
				console.log(
					`Card Number ${card_info.cardNumber} (${index + 1} of ${total}) was successfully used after all.`
				);
				break;
			}

			// Since we already checked all the logs with this run_id, we can omit checking that run_id
			// It doesn't matter if the card was actually successful or not.
			ignore_run_ids.push(log_run_id);
		}

		if (!was_successful) return_array.push(card_info);
	}

	console.log(`Removed False Payment Failures.`);
	return return_array;
};

/**
 * Receives array of cards information and array of objects containing payments reported by PNM. If a card is found on PNM (Going by Order ID),
 * it excludes that card. It returns the resulting array after the filtering.
 * @param { { run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string, trucentiveLink: string, balance: string | number }[] } cards_info_arr
 * @param { { Name: string, Account: string, 'Payment Date': string, Status: string, 'Net Customer Payment': string, 'Payment Method': string, 'Payment Type': string }[] } pnm_report_arr
 * @returns {{ run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string, trucentiveLink: string, balance: string | number }[]}
 */
const removePnmReportedPaid = (cards_info_arr, pnm_report_arr) => {
	console.log(`Removing PNM Reported as Paid...`);
	const total = cards_info_arr.length;
	const return_arr = cards_info_arr.filter((card_info, index) => {
		const found_index = pnm_report_arr.findIndex(
			p => p.Account.trim() === card_info.order_id.trim()
		);
		if (found_index < 0) return true;
		console.log(
			`Card Number ${card_info.cardNumber} (${index + 1} of ${total}) was successfully used after all.`
		);
		return false;
	});

	console.log(`Removed PNM Reported as Paid.`);

	return return_arr;
};

const asyncMain = async () => {
	console.log(`Starting Unused Cards Report...`);
	/**
	 * Set of only run_id's of logs that present a card data log.
	 * @type { Set<string> }
	 */
	const run_ids_set = await generateRunIdsSet(true);

	/**
	 * Array of objects for all logs with the run_id's we care about; so only logs that
	 * present a card data log.
	 * @type { any[] }
	 */
	const all_logs = await generateLogsArr(run_ids_set);

	/**
	 * Subset of logs from all_logs that present a failed makeRequests function execution. Meaning, payment
	 * failed or something else failed.
	 * @type { any[] }
	 */
	const logs_with_failed_payments = generateLogsWithFailedPaymentsArr(
		all_logs,
		run_ids_set
	);

	/**
	 * Logs from logs_with_failed_payments that have cardData property.
	 * @type { any[] }
	 */
	const logs_with_card_info = filterLogsWithCardInfo(logs_with_failed_payments);

	/**
	 * Array of objects containing info related to the cards. Array will already omit duplicates.
	 * @type {{
	 * 	run_id: string;
	 * 	order_id: string;
	 * 	timestamp: string;
	 * 	cardNumber: string;
	 * 	expirationDate: string;
	 * 	cvv: string;
	 * 	lastKnownIp: string;
	 * 	trucentiveLink: string;
	 * 	balance: string | number;
	 * }[]}
	 */
	const cards_info = generateCardsInfoArray(logs_with_card_info, all_logs);

	/**
	 * Array of objects containing cards info, excluding the ones that were found to be later use successfuly.
	 * This is most likely what we'll share in a CSV file.
	 * @type {{
	 * 	run_id: string;
	 * 	order_id: string;
	 * 	timestamp: string;
	 * 	cardNumber: string;
	 * 	expirationDate: string;
	 * 	cvv: string;
	 * 	lastKnownIp: string;
	 * 	trucentiveLink: string;
	 * 	balance: string | number;
	 * }[]}
	 */
	const cards_info_wo_false_failures = removeFalsePaymentFailures(
		cards_info,
		all_logs
	);

	let cards_info_output = cards_info_wo_false_failures;
	if (pnm_report_filepath) {
		if (!Fs.existsSync(pnm_report_filepath)) {
			console.log(`PNM Report file does not exist.`);
		} else {
			const pnm_report_csv_string =
				Fs.readFileSync(pnm_report_filepath).toString();
			const pnm_report_data = csvToArray(pnm_report_csv_string);
			cards_info_output = removePnmReportedPaid(
				cards_info_output,
				pnm_report_data
			);
		}
	} else {
		console.log(`Will not use PNM Report data.`);
	}

	/**
	 * CSV-formatted string of final cards info array.
	 * @type { string }
	 */
	const cards_info_csv = arrayToCSV(cards_info_output);

	Fs.writeFileSync(output_path, cards_info_csv);

	console.log(`Finished Unused Cards Report.`);
};

asyncMain()
	.then(() => console.log('Unused Cards Report Finished'))
	.catch(err => {
		console.error(`General Error:`, err);
	});
