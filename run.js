const Fs = require('fs');
const Path = require('path');
const { Client: scpClient } = require('node-scp');
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

const pem_filepath = process.env.PEM_FILEPATH ?? 'ubuntu.pem';
const isZip = process.env.ZIP_FILE === 'Y';
const downloadCurrentLogs = process.env.DOWNLOAD_CURRENT_LOGS == 'Y';

const ssh = {
	host: '18.117.248.41',
	port: 22,
	username: 'ubuntu',
	privateKey: Fs.readFileSync(pem_filepath)
};

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

	let remote_path;
	let local_path;
	if (zip) {
		// Zip file via SSH session.
		const remote_zip_dir = '/home/ubuntu/app/card-payment-generator/logs';
		await executeSSH(`cd ${remote_zip_dir} && zip all-logs.zip all.log`);
		remote_path = '/home/ubuntu/app/card-payment-generator/logs/all-logs.zip';
		local_path = Path.join(__dirname, 'logs-storage', 'current-logs.zip');
	} else {
		remote_path = '/home/ubuntu/app/card-payment-generator/logs/all.log';
		local_path = current_log_path;
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
		// Unzips to {output_dir}/all.log
		ChildProcess.execSync(`unzip ${local_path} -d ${output_dir}`);
		// Renames file to current.log
		ChildProcess.execSync(
			`mv ${Path.join(output_dir, 'all.log')} ${Path.join(output_dir, 'current.log')}`
		);
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
 *
 * @param {'unused-cards-report' | 'payment-attempts-report'} script
 */
const startPm2 = async script => {
	const PM2 = require('pm2');

	return new Promise((resolve, reject) => {
		PM2.connect(connect_err => {
			if (connect_err) return reject(connect_err);

			const json_config_file = Path.join(
				__dirname,
				script === 'unused-cards-report'
					? 'unused-cards.config.js'
					: 'payment-attempts.config.js'
			);

			PM2.start(json_config_file, (start_err, apps) => {
				if (start_err) {
					PM2.disconnect();
					return reject(start_err);
				}

				return resolve(null);
			});
		});
	});
};

const asyncMain = async () => {
	// Automatically download and merge current log.
	if (downloadCurrentLogs) await downloadFromCurrentSrv(isZip);

	await startPm2('payment-attempts-report');
	await startPm2('unused-cards-report');
};

asyncMain()
	.then(() => console.log('Started processes'))
	.catch(err => {
		console.error(`General Error:`, err);
	});
