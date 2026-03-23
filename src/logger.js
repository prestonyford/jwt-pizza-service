function sendLogToGrafana(event) {
	const body = JSON.stringify(event);
	fetch(`${config.url}`, {
		method: 'post',
		body: body,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.accountId}:${config.apiKey}`,
		},
	}).then((res) => {
		if (!res.ok) console.log('Failed to send log to Grafana');
	});
}

module.exports = { sendLogToGrafana }
