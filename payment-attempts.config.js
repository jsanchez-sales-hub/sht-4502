module.exports = {
	apps: [
		{
			name: 'SHT-4502 | Payment Attempts Report',
			script: './payment-attempts-report.js',
			autorestart: false,
			time: true,
			log_file: './pm2/payment-attempts-report-out.log',
			args: ['--max-old-space-size=6144'],
			env: {
				NODE_OPTIONS: '--max-old-space-size=6144'
			}
		}
	]
};
