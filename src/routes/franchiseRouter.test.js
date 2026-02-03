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

let admin, adminToken;

beforeAll(async () => {
	admin = await createAdminUser();
});

beforeEach(async () => {
	const loginRes = await request(app).put('/api/auth').send(admin);
	adminToken = loginRes.body.token;
});

test('create franchise', async () => {
	const franchiseName = randomName()
	const res = await request(app)
		.post('/api/franchise')
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ name: franchiseName, admins: [admin] });

	expect(res.status).toBe(200);
	expect(res.body).toHaveProperty('id');
	expect(res.body.name).toBe(franchiseName);
	expect(Array.isArray(res.body.admins)).toBe(true);
	expect(res.body.admins[0]).toMatchObject(admin);
});

test('get franchises', async () => {
	const franchiseName = randomName()
	await request(app)
		.post('/api/franchise')
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ name: franchiseName, admins: [admin] });

	const getRes = await request(app)
		.get('/api/franchise')
		.query({
			page: 0,
			limit: 1,
			name: franchiseName
		})
		.send();

	expect(getRes.status).toBe(200);
	expect(getRes.body.franchises).toContainEqual(expect.objectContaining({ name: franchiseName }));
});

test('get user franchises', async () => {
	const franchiseName = randomName()
	await request(app)
		.post('/api/franchise')
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ name: franchiseName, admins: [admin] });

	const getRes = await request(app)
		.get(`/api/franchise/${admin.id}`)
		.set('Authorization', `Bearer ${adminToken}`)
		.send();

	expect(getRes.body).toContainEqual(expect.objectContaining(
		{
			name: franchiseName,
			admins: [
				{
					id: admin.id,
					name: admin.name,
					email: admin.email
				},
			],
			stores: []
		}
	));
});

test('delete franchise', async () => {
	const franchiseName = randomName();
	const createRes = await request(app)
		.post('/api/franchise')
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ name: franchiseName, admins: [admin] });

	expect(createRes.status).toBe(200);

	const id = createRes.body.id;
	const delRes = await request(app).delete(`/api/franchise/${id}`).send();

	expect(delRes.status).toBe(200);
	expect(delRes.body).toMatchObject({ message: 'franchise deleted' });
});

test('create store', async () => {
	const franchiseName = randomName();
	const createRes = await request(app)
		.post('/api/franchise')
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ name: franchiseName, admins: [admin] });

	expect(createRes.status).toBe(200);

	const franchiseId = createRes.body.id;
	const storeName = randomName();

	const storeRes = await request(app)
		.post(`/api/franchise/${franchiseId}/store`)
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ name: storeName });

	expect(storeRes.status).toBe(200);
	expect(storeRes.body).toHaveProperty('id');
	expect(storeRes.body.name).toBe(storeName);
});

test('delete store', async () => {
	const franchiseName = randomName();
	const createRes = await request(app)
		.post('/api/franchise')
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ name: franchiseName, admins: [admin] });

	expect(createRes.status).toBe(200);

	const franchiseId = createRes.body.id;
	const storeName = randomName();

	const storeRes = await request(app)
		.post(`/api/franchise/${franchiseId}/store`)
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ name: storeName });

	expect(storeRes.status).toBe(200);

	const storeId = storeRes.body.id;
	const delRes = await request(app)
		.delete(`/api/franchise/${franchiseId}/store/${storeId}`)
		.set('Authorization', `Bearer ${adminToken}`)
		.send();

	expect(delRes.status).toBe(200);
	expect(delRes.body).toMatchObject({ message: 'store deleted' });
});
