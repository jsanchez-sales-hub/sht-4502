const Fs = require('fs');
const { exec } = require('child_process');
const SSHClient = require('ssh2').Client;

const pem_filepath = process.env.PEM_FILEPATH ?? 'ubuntu.pem';
const ssh = {
	host: '18.117.248.41',
	port: 22,
	username: 'ubuntu',
	privateKey: Fs.readFileSync(pem_filepath)
};

/**
 *
 * @param {number} ms
 * @returns
 */
const waitFor = async ms => {
	return new Promise((resolve, reject) => {
		setTimeout(resolve, ms);
	});
};

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
			// @ts-ignore
			obj[headers[j]] = line[j].replaceAll(/^"|"$/g, '');
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

/**
 * Executes line command via SSH session.
 * @param {string} command
 * @returns
 */
const executeSSH = async command => {
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
};

/**
 *
 * @param {string} command
 */
const execute = async command => {
	return new Promise((resolve, reject) => {
		console.log(`Executing command: ${command}`);
		exec(command, (err, stdout, stderr) => {
			if (err) {
				//some err occurred
				reject(err);
				return;
			}
			resolve(stdout);
		});
	});
};

module.exports = {
	waitFor,
	arrayToCSV,
	csvToArray,
	logMemoryUsage,
	executeSSH,
	execute
};
