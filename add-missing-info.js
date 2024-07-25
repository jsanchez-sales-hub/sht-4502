const Fs = require('fs');
const Path = require('path');
const ChildProcess = require('child_process');

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
			// @ts-ignore
			const item = line[j].replaceAll(/^"|"$/g, '');
			obj[headers[j]] = item;
		}

		// Add the object to the result array
		result.push(obj);
	}

	return result;
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
 * Looks up Trucentive Link from logs array
 * @param { any[] } logs_arr
 * @param { string } run_id
 * @returns { string | null }
 */
function getTrucentiveLink(logs_arr, run_id) {
	console.log(`Getting Trucentive Link for Run ID ${run_id}...`);
	const trucentiveLinkMsgRegex =
		/^Initial card data stored for trucentiveLink: /;
	let hasTrucentiveLinkProp = false;
	let hasTrucentiveLinkMsg = false;
	let hasDeepTrucentiveLinkProp = false;
	const item = logs_arr.find(l => {
		if (!l) return false;
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
}

/**
 * Looks up Card Balance from logs array.
 * @param { any[] } logs_arr
 * @param { string } run_id
 */
function getCardBalance(logs_arr, run_id) {
	console.log(`Getting Card Balance for Run ID ${run_id}...`);

	let balance;
	const item = logs_arr.find(
		l =>
			!!l && l.runId === run_id && l.msg === 'Response from getAmountToCollect'
	);

	if (item && !isNaN(item.amountData.amount)) {
		balance = item.amountData.amount;
	}

	console.log(`Got Card Balance for Run ID ${run_id}: ${balance ?? 'N/A'}.`);
	return balance;
}

async function processItem(card_info) {
	return new Promise((resolve, reject) => {
		console.log(`Starting promise for Run ID: ${card_info.run_id}...`);
		ChildProcess.exec(
			`grep ${card_info.run_id} ./logs-storage/all-time.log`,
			(err, stdout, stderr) => {
				if (err) return reject(err);

				const grep_result = stdout;

				const arr = grep_result.split('\n');
				const obj_arr = arr.map(log => {
					try {
						return JSON.parse(log);
					} catch (err) {
						return null;
					}
				});

				const run_id = card_info.run_id.replaceAll(/^"|"$/g, '');

				const trucentiveLink = getTrucentiveLink(obj_arr, run_id);
				const balance = getCardBalance(obj_arr, run_id);

				if (trucentiveLink) card_info.trucentiveLink = trucentiveLink;
				if (balance) card_info.balance = balance;

				console.log(card_info);

				console.log(`Finished promise for Run ID: ${card_info.run_id}.`);

				return resolve(card_info);
			}
		);
	});
}

const asyncMain = async () => {
	const cards_info = Fs.readFileSync('./results/cards-info.csv').toString();
	const cards_info_arr = csvToArray(cards_info);

	const parallel_threads = 20;
	const total = cards_info_arr.length;

	for (let index = 0; index < total; true) {
		// for (let [index, card_info] of cards_info_arr.entries()) {

		const promises_arr = [];
		for (let i = 0; i < parallel_threads && index < total; i++) {
			const card_info = cards_info_arr[index];
			console.log(
				`Card Info Run ID: ${card_info.run_id} (${index + 1} of ${total})`
			);
			promises_arr.push(processItem(card_info));
			index++;
		}

		await Promise.all(promises_arr);

		// const card_info = cards_info_arr[index]
		// try {
		// 	const grep_result = ChildProcess.execSync(
		// 		`grep ${card_info.run_id} ./logs-storage/all-time.log`
		// 	).toString();

		// 	const arr = grep_result.split('\n');
		// 	const obj_arr = arr.map(log => {
		// 		try {
		// 			return JSON.parse(log);
		// 		} catch (err) {
		// 			return null;
		// 		}
		// 	});

		// 	const run_id = card_info.run_id.replaceAll(/^"|"$/g, '');

		// 	const trucentiveLink = getTrucentiveLink(obj_arr, run_id);
		// 	const balance = getCardBalance(obj_arr, run_id);

		// 	if (trucentiveLink) card_info.trucentiveLink = trucentiveLink;
		// 	if (balance) card_info.balance = balance;

		// 	console.log(card_info);
		// } catch (err) {
		// 	console.error(`Error:`, err);
		// 	break;
		// }
	}

	const new_cards_info_csv = arrayToCSV(cards_info_arr);
	Fs.writeFileSync('./results/cards-info-new.csv', new_cards_info_csv);

	console.log('Finished.');
};

asyncMain();
