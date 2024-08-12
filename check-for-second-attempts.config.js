module.exports = {
	apps: [
		{
			name: 'SHT-4502 | Check for Second Attempts',
			script: './check-for-second-attempts.js',
			autorestart: false,
			time: true,
			log_file: './pm2/check-for-second-attempts-out.log'
		}
	]
};
