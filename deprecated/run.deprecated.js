const Fs = require('fs');
const Path = require('path');
const ReadLine = require('node:readline');
const { Client: scpClient } = require('node-scp');

// Deprecated
function chunkObject(obj, n) {
	const keys = Object.keys(obj);
	const chunkSize = Math.ceil(keys.length / n);
	const chunks = Array.from({ length: n }, () => ({}));

	keys.forEach((key, index) => {
		const chunkIndex = Math.floor(index / chunkSize);
		chunks[chunkIndex][key] = obj[key];
	});

	return chunks;
}

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

async function downloadFromCurrentSrv(zip = false) {
	// TODO - zip before downloading and unzip on download finish; file is just too big.
	const host = '18.117.248.41',
		port = 22,
		username = 'ubuntu',
		privateKey = Fs.readFileSync(
			'/Users/juliosanchez/Documents/ssh-access/pems/card-payment-generator-ec2/ubuntu.pem'
		);
	let remote_path;
	let local_path;
	if (zip) {
		remote_path = '/home/ubuntu/app/card-payment-generator/logs/all-logs.zip';
		local_path = Path.join(__dirname, 'logs', 'current-logs.zip');
	} else {
		remote_path = '/home/ubuntu/app/card-payment-generator/logs/all.log';
		local_path = Path.join(__dirname, 'logs', 'current.log');
	}

	const client = await scpClient({
		host,
		port,
		username,
		privateKey
	});

	await client.downloadFile(remote_path, local_path);

	client.close();

	if (zip) {
		// TODO - unzip file if zip was downloaded.
	}

	// TODO - Create new all-time.log file maybe ?
}

/**
 * Reads Logs files and returns as array of objects
 * @returns
 */
async function generateLogsArr() {
	/**
	 * Array of objects for all logs (no filter)
	 * @type { any[] }
	 */
	const all_logs = [];

	// Read through file and fill all_logs array
	let fileStream = Fs.createReadStream(log_path);
	let rl = ReadLine.createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});
	let line = 1;
	for await (const log of rl) {
		console.log(`[First Reading] Log ${line}...`);

		let json;
		try {
			json = JSON.parse(log);
		} catch (err) {
			console.error(`Log in position ${line} is not JSON-able: ${log}`);
			break;
		}
		all_logs.push(json);

		line++;
	}

	return all_logs;
}

const log_path = Path.join(__dirname, 'logs', 'all-time.log');
const curr_log_path = Path.join(__dirname, 'logs', 'current.log');

const asyncMain = async () => {
	// TODO - Automatically download and merge current log.
	// await downloadFromCurrentSrv(true);

	/**
	 * Set of only run_id's
	 * @type { Set<string> }
	 */
	const run_ids_set = new Set();

	/**
	 * Array of objects for all logs (no filter)
	 * @type { any[] }
	 */
	const all_logs = await generateLogsArr();

	/**
	 * Chronologically ordered list of logs as JSON-ed objects
	 * @type { any[] }
	 */
	const chronological_logs = [];

	// Only check logs for payment attempts and add the run_id's into sets.
	all_logs
		.filter(l => {
			return (
				l.method === 'payOnLandingPagePnm' &&
				l.runId &&
				typeof l.runId === 'string'
			);
		})
		.forEach(l => run_ids_set.add(l.runId));

	// Create object with run_id as key and value is an array of the logs belonging to it.

	/**
	 * Object with run_id as key and the logs belonging to that run_id in an array of objects
	 * @type { {[key: string]: any[] }}
	 */
	const run_ids_obj = {};

	all_logs
		.filter(l => typeof l.runId === 'string' && run_ids_set.has(l.runId))
		.forEach(l => {
			const run_id = l.runId;

			// Object with keys equal to run_id's, with array of logs.
			// Log arrays will ordered chronologically, as they are in the log files.
			if (run_ids_obj[run_id]) run_ids_obj[run_id].push(l);
			else run_ids_obj[run_id] = [l];

			// Also push into plain list of logs
			chronological_logs.push(l);
		});

	/**
	 * Object to_be_stored will contain only the logs belonging to the runId's that had a method of 'payOnLandingPagePnm'
	 * and also had a subsequent log of msg 'Error while making Requests'. runId is the object key. It will have all the
	 * logs belonging to the runId's matched.
	 * @type { {[key: string]: any[] }}
	 */
	const to_be_stored = {};

	for (let key in run_ids_obj) {
		const obj = run_ids_obj[key];
		if (obj.some(o => o.msg === 'Error while making Requests')) {
			to_be_stored[key] = obj;
		}
	}

	/**
	 * @type { any[] }
	 */
	const cards_info = [];

	/**
	 * Object with card numbers as keys, and each property contains all the run_id's that use that card number.
	 * @type {{ [key: string]: string[] }}
	 */
	const cards_obj = {};

	// Look for card information
	for (let key in to_be_stored) {
		const obj = to_be_stored[key];
		const obj_with_carddata = obj.find(o => o.cardData);

		if (obj_with_carddata) {
			const order_id = obj_with_carddata.orderId ?? 'Unknown';
			const timestamp = new Date(obj_with_carddata.time).toISOString();
			cards_info.push({ timestamp, ...obj_with_carddata.cardData, order_id });

			// Fill cards_obj object with run_id
			const { cardNumber } = obj_with_carddata.cardData;
			if (cards_obj[cardNumber]) {
				const card_obj = cards_obj[cardNumber];
				if (!card_obj.find(c => c === key)) card_obj.push(key);
			} else {
				cards_obj[cardNumber] = [key];
			}
		}
	}

	const cards_info_csv = arrayToCSV(cards_info);

	Fs.writeFileSync(
		Path.join(__dirname, 'results', 'cards-info.csv'),
		cards_info_csv
	);

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
	.catch(err => console.error(err));
