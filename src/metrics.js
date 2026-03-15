const os = require('os');
const config = require('./config.js').metrics;

const requests = {};
const httpMetrics = [];

// Middleware to track requests by their method
function requestTracker(req, res, next) {
	requests[req.method] = (requests[req.method] || 0) + 1;
	next();
}

setInterval(() => {
	Object.keys(requests).forEach((method) => {
		httpMetrics.push(createMetric('requests', requests[method], '1', 'sum', 'asInt', { method }));
	});

	sendMetricToGrafana(httpMetrics);
}, 10000);

function createMetric(metricName, metricValue, metricUnit, metricType, valueType, attributes) {
	attributes = { ...attributes, source: config.source };

	const metric = {
		name: metricName,
		unit: metricUnit,
		[metricType]: {
			dataPoints: [
				{
					[valueType]: metricValue,
					timeUnixNano: Date.now() * 1000000,
					attributes: [],
				},
			],
		},
	};

	Object.keys(attributes).forEach((key) => {
		metric[metricType].dataPoints[0].attributes.push({
			key: key,
			value: { stringValue: attributes[key] },
		});
	});

	if (metricType === 'sum') {
		metric[metricType].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
		metric[metricType].isMonotonic = true;
	}

	return metric;
}

function sendMetricToGrafana(metrics) {
	const body = {
		resourceMetrics: [
			{
				scopeMetrics: [
					{
						metrics,
					},
				],
			},
		],
	};

	fetch(`${config.endpointUrl}`, {
		method: 'POST',
		body: JSON.stringify(body),
		headers: { Authorization: `Bearer ${config.accountId}:${config.apiKey}`, 'Content-Type': 'application/json' },
	})
		.then((response) => {
			if (!response.ok) {
				throw new Error(`HTTP status: ${response.status}`);
			}
		})
		.catch((error) => {
			console.error('Error pushing metrics:', error);
		});
}

module.exports = { requestTracker };
