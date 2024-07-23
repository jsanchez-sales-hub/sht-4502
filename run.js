const Fs = require('fs');
const Path = require('path');
const ReadLine = require('node:readline');
const { Client: scpClient } = require('node-scp');
const Decompress = require('decompress');
const ChildProcess = require('child_process');
const SSHClient = require('ssh2').Client;
require('dotenv').config();

const log_storage_path = Path.join(__dirname, 'logs-storage');
const all_time_log_path = Path.join(log_storage_path, 'all-time.log');
const current_log_path = Path.join(log_storage_path, 'current.log');
const previous_instances_log_path = Path.join(
	log_storage_path,
	'previous-instances.log'
);
const output_path = Path.join(__dirname, 'results', 'cards-info.csv');
const pem_filepath = process.env.PEM_FILEPATH ?? 'ubuntu.pem';
const pnm_report_filepath = process.env.PNM_REPORT_FILEPATH ?? null;
const isZip = process.env.ZIP_FILE === 'Y';

const ssh = {
	host: '18.117.248.41',
	port: 22,
	username: 'ubuntu',
	privateKey: Fs.readFileSync(pem_filepath)
};

/**
 * Sets the amount of logs to be output. Try not to use "all"; the sheer amount of logs
 * can make the whole script much slower.
 * @type { 'mid' | 'all' | 'none' }
 */
const LOG = 'mid';

/**
 * Extracts Card Number, Exp Date, CVV, and other data from a log element. If cardData doesn't exist
 * in the object, returns null.
 * @param {any} log
 * @returns {{ cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string } | null}
 */
function extractCardData(log) {
	if (log.cardData) {
		return log.cardData;
	}
	return null;
}

/**
 * Converts array of objects into CSV string
 * @param { any[] } array
 * @returns
 */
function arrayToCSV(array) {
	// Get all unique keys from the array of objects
	const headers = Array.from(new Set(array.flatMap(Object.keys)));

	// Create the CSV string with headers
	const csv = [
		headers.join(','), // Join headers with commas
		...array.map(
			row =>
				headers
					.map(
						header => JSON.stringify(row[header] || '') // Convert undefined values to empty strings and escape values
					)
					.join(',') // Join each value in the row with commas
		)
	].join('\n'); // Join each row with new lines

	return csv;
}

/**
 * Converts CSV string into array of objects
 * @param {string} csv
 * @returns { any[] }
 */
function csvToArray(csv) {
	// Split the CSV string into lines
	const lines = csv.trim().split('\n');

	// Extract the headers from the first line
	const headers = lines[0].split(',');

	// Initialize an array to hold the resulting objects
	const result = [];

	// Process each line after the headers
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].split(',');

		// Create an object for the current line
		const obj = {};
		for (let j = 0; j < headers.length; j++) {
			obj[headers[j]] = line[j];
		}

		// Add the object to the result array
		result.push(obj);
	}

	return result;
}

/**
 * Executes line command via SSH session.
 * @param {string} command
 * @returns
 */
async function executeSSH(command) {
	return new Promise((resolve, reject) => {
		console.log(`Executing command "${command}" via SSH...`);

		// Create a new SSH client instance
		const sshClient = new SSHClient();
		// Configure the connection parameters
		const connectionParams = {
			host: ssh.host,
			username: ssh.username,
			privateKey: ssh.privateKey
		};
		// Connect to the SSH server
		sshClient.connect(connectionParams);

		sshClient.on('ready', () => {
			console.log('Connected via SSH');
			sshClient.exec(command, (err, stream) => {
				if (err) return reject(err);

				let stdout = '';
				let stderr = '';

				stream
					.on('close', (code, signal) => {
						console.log(
							`Command execution closed with code ${code} and signal ${signal}.`
						);
						sshClient.end();
						if (code === 0) {
							resolve(stdout);
						} else {
							reject(new Error(stderr));
						}
					})
					.on('data', data => {
						stdout += data.toString();
					})
					.stderr.on('data', data => {
						stderr += data.toString();
					});
			});
		});

		sshClient.on('error', err => {
			console.error('Error connecting via SSH:', err);
			reject(err);
		});
	});
}

/**
 * Downloads current instance's log file to ./logs-storage/current.log.
 * @param {boolean} zip
 */
async function downloadFromCurrentSrv(zip = false) {
	console.log(`Downloading current log file...`);

	const remote_log_path =
		'/home/ubuntu/app/card-payment-generator/logs/all.log';
	const remote_zip_path =
		'/home/ubuntu/app/card-payment-generator/logs/all-logs.zip';
	const local_log_path = current_log_path;
	const local_zip_path = Path.join(
		__dirname,
		'logs-storage',
		'current-logs.zip'
	);
	let remote_path;
	let local_path;
	if (zip) {
		// Zip file via SSH session.
		await executeSSH(`zip "${remote_zip_path}" "${remote_log_path}"`);
		remote_path = remote_zip_path;
		local_path = local_zip_path;
	} else {
		remote_path = remote_log_path;
		local_path = local_log_path;
	}

	const client = await scpClient({
		host: ssh.host,
		port: ssh.port,
		username: ssh.username,
		privateKey: ssh.privateKey
	});

	await client.downloadFile(remote_path, local_path);

	client.close();

	console.log(`Downloaded current log file.`);

	if (zip) {
		console.log(`Unzipping current log file...`);
		const output_dir = log_storage_path;
		await Decompress(local_path, output_dir, {
			map: file => {
				file.path = `current.log`;
				return file;
			}
		});
		// Remove compressed file (Just as cleanup)
		Fs.unlinkSync(local_path);
		console.log(`Unzipped current log file.`);
	}

	console.log(`Merging current log and previous instances' logs...`);
	// Create new all-time.log file with previous-instances.log file.
	Fs.copyFileSync(previous_instances_log_path, all_time_log_path);
	// Concatenate current.log file into all-time.log. Now we have the full log file.
	ChildProcess.execSync(`cat ${current_log_path} >> ${all_time_log_path}`);

	console.log(`Merged current log and previous instances' logs.`);
}

/**
 * Reads Logs files, finds only the logs with the run_id's to be evaluated and returns matches as array of objects
 * @param { Set<string> } run_ids_set
 * @returns
 */
async function generateLogsArr(run_ids_set) {
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

		if (json.runId && run_ids_set.has(json.runId)) logs_arr.push(json);

		line++;
	}

	console.log(`Generated All Logs Array.`);

	return logs_arr;
}

function logMemoryUsage() {
	const formatMemoryUsage = data =>
		`${Math.round((data / 1024 / 1024) * 100) / 100} MB`;
	const formatPerc = num => `${Math.round(num * 10000) / 100}%`;
	const memoryData = process.memoryUsage();

	const memoryUsage = {
		rss: `${formatMemoryUsage(memoryData.rss)} -> Resident Set Size - total memory allocated for the process execution`,
		heapTotal: `${formatMemoryUsage(memoryData.heapTotal)} -> total size of the allocated heap`,
		heapUsed: `${formatMemoryUsage(memoryData.heapUsed)} -> actual memory used during the execution`,
		external: `${formatMemoryUsage(memoryData.external)} -> V8 external memory`,
		heapUsagePerc: `${formatPerc(memoryData.heapUsed / memoryData.heapTotal)} -> memory usage percentage`
	};
	console.log(memoryUsage);
}

/**
 * Creates set of strings of logs' run_id only where a payment attempt was reached
 * (Successful or not).
 * @returns
 */
async function generateRunIdsSet() {
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
			console.error(`Log in position ${line} is not JSON-able: ${log}`);
			break;
		}

		if (json.runId && json.method === 'payOnLandingPagePnm') {
			run_ids_set.add(json.runId);
		}

		line++;
	}

	console.log(`Generated Run IDs Set.`);

	return run_ids_set;
}

/**
 * Loops through run_ids set, collects all logs from each run_id, and checks if the logs include a payment attempt
 * failure (msg: 'Error while making Requests'). If it finds one, it includes all the logs related to that run_id
 * in the returning array. It returns the array sorted by time ascendently.
 * @param { any[] } logs_arr
 * @param { Set<string> } run_ids_set
 */
function generateLogsWithFailedPaymentsArr(logs_arr, run_ids_set) {
	console.log(`Generating Logs With Failed Payments as Array...`);
	const total = run_ids_set.size;
	let index = 1;
	const logs_with_failed_payments = [];
	for (const run_id of run_ids_set) {
		if (LOG === 'all' || (LOG === 'mid' && index % 100 === 0)) {
			logMemoryUsage();
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
}

/**
 * Generates array of objects with only the cardData property of the logs, its timestamp in readable ISOString format,
 * the Run ID, and the Order ID. It removes any duplicate of card numbers, including only the most recent instance of
 * the card.
 * @param { any[] } logs_arr
 * @returns { { run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string }[] }
 */
function generateCardsInfoArray(logs_arr) {
	console.log(`Generating Cards Info Array...`);
	let cards_info = logs_arr.map(l => ({
		run_id: l.runId,
		order_id: l.orderId ?? 'Unknown',
		timestamp: new Date(l.time).toISOString(),
		...l.cardData
	}));

	// Now we sort it descendingly by "time" (Which should be possible by just reversing) to remove duplicates
	// and keep the most recent instances.
	console.log(`Sorting Cards Info...`);
	let aux_cards_info = [];
	cards_info.reverse().forEach(c => {
		if (!aux_cards_info.find(aux_c => aux_c.cardNumber === c.cardNumber)) {
			aux_cards_info.push(c);
		}
	});
	cards_info = aux_cards_info;

	console.log(`Generated Cards Info Array.`);

	return cards_info;
}

/**
 * Returns a logs array filtered to include only the ones that have cardData
 * @param { any[] } logs_arr
 * @returns
 */
function filterLogsWithCardInfo(logs_arr) {
	console.log(`Filtering Logs with Cards Info...`);
	const logs_with_card_info = logs_arr.filter(l => !!l.cardData);
	console.log(`Filtered Logs with Cards Info...`);
	return logs_with_card_info;
}

/**
 * For each card in cards_info_arr, it checks if that same card number was used later in a successful payment.
 * If it was, it does not return this card in the return value, since it turns out that that card was in fact
 * used.
 * @param { { run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string }[] } cards_info_arr
 * @param { any[] } all_logs
 * @returns { { run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string }[] }
 */
function removeFalsePaymentFailures(cards_info_arr, all_logs) {
	console.log(`Removing False Payment Failures...`);
	const return_array = [];
	const total = cards_info_arr.length;
	for (let [index, card_info] of cards_info_arr.entries()) {
		if (LOG === 'all' || (LOG === 'mid' && index % 100 === 0)) {
			logMemoryUsage();
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
}

/**
 * Receives array of cards information and array of objects containing payments reported by PNM. If a card is found on PNM (Going by Order ID),
 * it excludes that card. It returns the resulting array after the filtering.
 * @param { { run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string }[] } cards_info_arr
 * @param { { Name: string, Account: string, 'Payment Date': string, Status: string, 'Net Customer Payment': string, 'Payment Method': string, 'Payment Type': string }[] } pnm_report_arr
 * @returns {{ run_id: string, order_id: string, timestamp: string, cardNumber: string, expirationDate: string, cvv: string, lastKnownIp: string }[]}
 */
function removePnmReportedPaid(cards_info_arr, pnm_report_arr) {
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
}

const asyncMain = async () => {
	// Automatically download and merge current log.
	await downloadFromCurrentSrv(isZip);

	/**
	 * Set of only run_id's of logs that present a payment attempt (successful or not)
	 * @type { Set<string> }
	 */
	const run_ids_set = await generateRunIdsSet();

	/**
	 * Array of objects for all logs with the run_id's we care about; so only logs that
	 * present a payment attempt (successful or not)
	 * @type { any[] }
	 */
	const all_logs = await generateLogsArr(run_ids_set);

	/**
	 * Subset of logs from all_logs that present a failed payment attempt.
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
	 * }[]}
	 */
	const cards_info = generateCardsInfoArray(logs_with_card_info);

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

	// // Uncomment if you wish to store cards_info as JSON (I don't recommend it, it becomes too large)
	// Fs.writeFileSync(
	// 	Path.join(__dirname, 'results', 'cards-info.json'),
	// 	await Prettier.format(JSON.stringify(cards_info), {
	// 		semi: false,
	// 		parser: 'babel'
	// 	})
	// );
};

asyncMain()
	.then(() => console.log('Finished'))
	.catch(err => {
		console.error(`General Error:`, err);
	});
