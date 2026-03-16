const os = require('os');
const config = require('./config.js').metrics;

const metrics = [];

const requests = {};

const activeUsers = new Map();
const ACTIVE_WINDOW = 5 * 60 * 1000;

let authSuccess = 0;
let authFailure = 0;

let pizzaSaleSuccess = 0;
let pizzaSaleFailure = 0;
let pizzaSaleRevenue = 0;

const requestLatencies = [];
const pizzaServiceLatencies = [];


// Middleware to track requests by their method
function requestMethodTracker(req, res, next) {
	requests[req.method] = (requests[req.method] || 0) + 1;
	next();
}

function activeUserTracker(req, res, next) {
	if (req.user?.id) {
		const userId = req.user.id;
		activeUsers.set(userId, Date.now());
	}
	next();
}

function latencyTracker(req, res, next) {
	const start = process.hrtime.bigint();
	res.on('finish', () => {
		const end = process.hrtime.bigint();
		const durationMs = Number(end - start) / 1_000_000;
		requestLatencies.push(durationMs);
	});
	next();
}

function getAverage(arr) {
	if (arr.length === 0) return 0;
	const sum = arr.reduce((a, b) => a + b, 0);
	return sum / arr.length;
}

function reportAuthAttempt(success) {
	if (success) {
		++authSuccess;
	} else {
		++authFailure;
	}
}

function reportPizzaSale(success, latency, revenue = 0) {
	if (success) {
		++pizzaSaleSuccess;
		pizzaSaleRevenue += revenue;
	} else {
		++pizzaSaleFailure;
	}
	pizzaServiceLatencies.push(latency);
}

function getActiveUserCount() {
	const now = Date.now();
	let count = 0;
	// TODO: this can be slow
	for (const [userId, lastSeen] of activeUsers) {
		if (now - lastSeen < ACTIVE_WINDOW) {
			++count;
		} else {
			activeUsers.delete(userId);
		}
	}
	return count;
}


function getCpuUsagePercentage() {
	const cpuUsage = os.loadavg()[0] / os.cpus().length;
	return +cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
	const totalMemory = os.totalmem();
	const freeMemory = os.freemem();
	const usedMemory = totalMemory - freeMemory;
	const memoryUsage = (usedMemory / totalMemory) * 100;
	return +memoryUsage.toFixed(2);
}

setInterval(() => {
	// http method metrics
	Object.keys(requests).forEach((method) => {
		metrics.push(createMetric('requests', requests[method], '1', 'sum', 'asInt', { method }));
	});

	// active user metrics
	const numActiveUsers = getActiveUserCount();
	metrics.push(createMetric('activeUsers', numActiveUsers, '1', 'gauge', 'asInt', {}));

	// authentication success metrics
	metrics.push(createMetric('authSuccess', authSuccess, '1', 'sum', 'asInt', {}));
	metrics.push(createMetric('authFailure', authFailure, '1', 'sum', 'asInt', {}));

	// cpu and memory usage
	metrics.push(createMetric('cpu', getCpuUsagePercentage(), '%', 'gauge', 'asDouble', {}));
	metrics.push(createMetric('memory', getMemoryUsagePercentage(), '%', 'gauge', 'asDouble', {}));

	// pizza sales
	metrics.push(createMetric('pizzaSaleSuccess', pizzaSaleSuccess, '1', 'sum', 'asInt', {}));
	metrics.push(createMetric('pizzaSaleFailure', pizzaSaleFailure, '1', 'sum', 'asInt', {}));
	metrics.push(createMetric('pizzaSaleRevenue', pizzaSaleRevenue, '1', 'sum', 'asDouble', {}));

	// latency
	metrics.push(createMetric('averageLatency', getAverage(requestLatencies), 'ms', 'gauge', 'asDouble', {}));
	metrics.push(createMetric('pizzaServiceLatency', getAverage(pizzaServiceLatencies), 'ms', 'gauge', 'asDouble', {}));
	requestLatencies.length = 0;

	sendMetricToGrafana(metrics);
	metrics.length = 0;
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

module.exports = { requestMethodTracker, activeUserTracker, latencyTracker, reportAuthAttempt, reportPizzaSale };
