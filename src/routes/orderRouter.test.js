const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database');

function randomName() {
	return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
	let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
	user.name = randomName();
	user.email = user.name + '@admin.com';

	user = await DB.addUser(user);
	return { ...user, password: 'toomanysecrets' };
}

async function createUser() {
	let user = { password: 'pleasesecret', roles: [] };
	user.name = randomName();
	user.email = user.name + '@user.com';

	user = await DB.addUser(user);
	return { ...user, password: 'pleasesecret' };
}

let admin, adminToken;

beforeAll(async () => {
	admin = await createAdminUser();
});

beforeEach(async () => {
	const loginRes = await request(app).put('/api/auth').send(admin);
	adminToken = loginRes.body.token;
});

test('GET /api/order/menu returns menu array', async () => {
	const res = await request(app).get('/api/order/menu').send();
	expect(res.status).toBe(200);
	expect(Array.isArray(res.body)).toBe(true);
	if (res.body.length > 0) {
		const item = res.body[0];
		expect(item).toHaveProperty('id');
		expect(item).toHaveProperty('title');
		expect(item).toHaveProperty('price');
	}
});

test('PUT /api/order/menu allowed for admin', async () => {
	const menuItem = { title: randomName(), description: 'test', image: 'img.png', price: 0.0001 };

	const res = await request(app)
		.put('/api/order/menu')
		.set('Authorization', `Bearer ${adminToken}`)
		.send(menuItem);

	expect(res.status).toBe(200);
	expect(Array.isArray(res.body)).toBe(true);
	expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ title: menuItem.title })]));
});

test('PUT /api/order/menu forbidden for non-admin', async () => {
	const user = await createUser();
	const login = await request(app).put('/api/auth').send(user);
	const token = login.body.token;

	const menuItem = { title: randomName(), description: 'test', image: 'img.png', price: 0.0001 };

	const res = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${token}`).send(menuItem);
	expect(res.status).toBe(403);
});

test('POST /api/order creates order and returns jwt', async () => {
	const fakeFactory = { reportUrl: 'http://r', jwt: 'factory-jwt' };
	global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeFactory });

	const user = await createUser();
	const login = await request(app).put('/api/auth').send(user);
	const token = login.body.token;

	const orderReq = { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }] };

	const res = await request(app).post('/api/order').set('Authorization', `Bearer ${token}`).send(orderReq);
	expect(res.status).toBe(200);
	expect(res.body).toHaveProperty('order');
	expect(res.body).toHaveProperty('jwt', fakeFactory.jwt);
	expect(res.body.order).toHaveProperty('id');

	global.fetch = undefined;
});

test('GET /api/order returns user orders', async () => {
	const fakeFactory = { reportUrl: 'http://r', jwt: 'factory-jwt' };
	global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeFactory });

	const user = await createUser();
	const login = await request(app).put('/api/auth').send(user);
	const token = login.body.token;

	const orderReq = { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }] };
	const postRes = await request(app).post('/api/order').set('Authorization', `Bearer ${token}`).send(orderReq);
	expect(postRes.status).toBe(200);
	const createdOrderId = postRes.body.order.id;

	const getRes = await request(app).get('/api/order').set('Authorization', `Bearer ${token}`).send();
	expect(getRes.status).toBe(200);
	if (getRes.body && Array.isArray(getRes.body.orders)) {
		expect(getRes.body.orders).toEqual(expect.arrayContaining([expect.objectContaining({ id: createdOrderId })]));
	} else {
		expect(Array.isArray(getRes.body)).toBe(true);
		expect(getRes.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: createdOrderId })]));
	}

	global.fetch = undefined;
});
