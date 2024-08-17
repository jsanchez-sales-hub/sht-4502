module.exports = {
	apps: [
		{
			name: 'SHT-4502 | Unused Cards DB Import',
			script: './unused-cards-report.js',
			autorestart: false,
			time: true,
			log_file: './pm2/unused-cards-report-out.log',
			args: ['--max-old-space-size=6144', '--db'],
			env: {
				NODE_OPTIONS: '--max-old-space-size=6144'
			}
		}
	]
};
