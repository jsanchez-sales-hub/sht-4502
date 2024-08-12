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

const log_storage_path = Path.join(__dirname, 'logs-storage');
const all_time_log_path = Path.join(log_storage_path, 'all-time.log');
const cards_info_path = Path.join(__dirname, 'results', 'cards-info.csv');
const output_path = Path.join(__dirname, 'results', 'cards-info-revised.csv');

const asyncMain = async () => {
	const cards_info_csv = Fs.readFileSync(cards_info_path).toString();
	const cards_info_arr = csvToArray(cards_info_csv);
	const total = cards_info_arr.length;

	for (let [index, card_info] of cards_info_arr.entries()) {
		console.log(
			`Checking element ${index + 1} of ${total}: Card ${card_info.cardNumber}`
		);

		const card_number = card_info.cardNumber;

		const grep_command = `grep "${card_number}" ${all_time_log_path}`;

		const grep_result = await execute(grep_command);

		console.log(grep_result);
		break;
	}
};

asyncMain()
	.then(() => console.log('Finished'))
	.catch(err => {
		console.error(err);
		console.error('Error');
	});
