module.exports = {
	apps: [
		{
			name: 'SHT-4502',
			script: './run.js',
			autorestart: false,
			time: true,
			log_file: './pm2/out.log',
			args: ['--max-old-space-size=6144'],
			env: {
				NODE_OPTIONS: '--max-old-space-size=6144'
			}
		}
	]
};
