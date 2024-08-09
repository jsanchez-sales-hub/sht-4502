const ReadLine = require('node:readline');
const Fs = require('fs');
const Path = require('path');

const { logMemoryUsage, arrayToCSV, waitFor } = require('./utils');

const log_storage_path = Path.join(__dirname, 'logs-storage');
const all_time_log_path = Path.join(log_storage_path, 'all-time.log');

const processing_attempts_output_path = Path.join(
	__dirname,
	'results',
	'payment-attempts.csv'
);

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
async function generateRunIdsSet(filter = true) {
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
			logMemoryUsage();
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
}

/**
 * Reads Logs files, finds only the logs with the run_id's to be evaluated and returns matches as array of objects
 * @param { Set<string> | null } run_ids_set
 * @returns
 */
async function generateLogsArr(run_ids_set = null) {
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
			logMemoryUsage();
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
}

/**
 * Generates Report containing all the processing attempts, no matter how far they got. It
 * saves the run_id, timestamp, and Order ID, and stores it in a CSV file.
 */
async function generateAttemptsReport() {
	console.log(`Generating Attempts Report...`);

	const run_ids_set = await generateRunIdsSet(false);

	const logs_arr = await generateLogsArr();

	/**
	 * Array of objects containing info related to processing attempts.
	 * @type {{
	 * 	run_id: string;
	 * 	timestamp: string;
	 * 	order_id: string;
	 * }[]}
	 */
	const processing_attempts = [];
	let index = 1;
	const total = run_ids_set.size;
	for (const run_id of run_ids_set) {
		if (LOG === 'all' || (LOG === 'mid' && index % 100 === 0)) {
			logMemoryUsage();
			console.log(
				`[generateAttemptsReport] Run ID ${run_id} (${index} of ${total})...`
			);
		}

		const timestamp_item = logs_arr.find(l => l.runId === run_id);
		const timestamp = timestamp_item?.time
			? new Date(timestamp_item.time).toISOString()
			: 'Unknown';

		let order_id = 'Unknown';

		if (timestamp_item?.orderId) {
			order_id = timestamp_item.orderId;
		} else {
			const order_id_item = logs_arr.find(
				l => l.runId === run_id && !!l.orderId
			);
			if (order_id_item?.orderId) {
				order_id = order_id_item.orderId;
			}
		}

		/**
		 * @type {{
		 * 	run_id: string;
		 * 	timestamp: string;
		 * 	order_id: string;
		 * }}
		 */
		const obj = { run_id, timestamp, order_id };

		processing_attempts.push(obj);

		index++;
	}

	const processing_attempts_csv = arrayToCSV(processing_attempts);

	Fs.writeFileSync(processing_attempts_output_path, processing_attempts_csv);

	console.log(`Generated Attempts Report.`);
}

generateAttemptsReport()
	.then(() => console.log('Payment Attempts Report Finished'))
	.catch(err => {
		console.error(`General Error:`, err);
	});
