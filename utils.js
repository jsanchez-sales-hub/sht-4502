/**
 * Converts array of objects into CSV string
 * @param { any[] } array
 * @returns
 */
const arrayToCSV = array => {
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
};

/**
 * Converts CSV string into array of objects
 * @param {string} csv
 * @returns { any[] }
 */
const csvToArray = csv => {
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
};

const logMemoryUsage = () => {
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
};

module.exports = { arrayToCSV, csvToArray, logMemoryUsage };
