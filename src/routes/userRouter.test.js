const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database');

function randomName() {
	return Math.random().toString(36).substring(2, 12);
}

async function createUser() {
	let user = { password: 'toomanysecrets', roles: [{ role: Role.Diner }] };
	user.name = randomName();
	user.email = user.name + '@user.com';

	user = await DB.addUser(user);
	return { ...user, password: 'toomanysecrets' };
}

async function createAdminUser() {
	let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
	user.name = randomName();
	user.email = user.name + '@admin.com';

	user = await DB.addUser(user);
	return { ...user, password: 'toomanysecrets' };
}

let userA, userB, admin;

beforeAll(async () => {
	userA = await createUser();
	userB = await createUser();
	admin = await createAdminUser();
});

test('get authenticated user (me)', async () => {
	const loginRes = await request(app).put('/api/auth').send({ email: userA.email, password: userA.password });
	const token = loginRes.body.token;

	const res = await request(app)
		.get('/api/user/me')
		.set('Authorization', `Bearer ${token}`)
		.send();

	expect(res.status).toBe(200);
	expect(res.body).toMatchObject({ id: userA.id, name: userA.name, email: userA.email });
	expect(Array.isArray(res.body.roles)).toBe(true);
});

test('update own user', async () => {
	const loginRes = await request(app).put('/api/auth').send({ email: userA.email, password: userA.password });
	const token = loginRes.body.token;

	const newName = randomName();
	const newEmail = newName + '@changed.com';
	const newPassword = 'newsecret';

	const res = await request(app)
		.put(`/api/user/${userA.id}`)
		.set('Authorization', `Bearer ${token}`)
		.send({ name: newName, email: newEmail, password: newPassword });

	expect(res.status).toBe(200);
	expect(res.body.user).toHaveProperty('id');
	expect(res.body.user.name).toBe(newName);
	expect(res.body.user.email).toBe(newEmail);
	expect(res.body).toHaveProperty('token');
});

test('unauthorized update of another user returns 403', async () => {
	const attacker = await createUser();
	const loginRes = await request(app).put('/api/auth').send({ email: attacker.email, password: attacker.password });
	const token = loginRes.body.token;

	const res = await request(app)
		.put(`/api/user/${userB.id}`)
		.set('Authorization', `Bearer ${token}`)
		.send({ name: 'hacker' });

	expect(res.status).toBe(403);
	expect(res.body).toMatchObject({ message: 'unauthorized' });
});

test('admin can update another user', async () => {
	const loginRes = await request(app).put('/api/auth').send({ email: admin.email, password: admin.password });
	const token = loginRes.body.token;

	const newName = randomName();

	const res = await request(app)
		.put(`/api/user/${userB.id}`)
		.set('Authorization', `Bearer ${token}`)
		.send({ name: newName, email: userB.email });

	expect(res.status).toBe(200);
	expect(res.body.user).toHaveProperty('id');
	expect(res.body.user.name).toBe(newName);
	expect(res.body).toHaveProperty('token');
});

test('list users unauthorized', async () => {
	const listUsersRes = await request(app).get('/api/user');
	expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
	const name = randomName();
	const [user, userToken] = await registerUser(name, request(app));
	const listUsersRes = await request(app)
		.get(`/api/user?page=0&limit=10&name=${name}`)
		.set('Authorization', 'Bearer ' + userToken);
	expect(listUsersRes.status).toBe(200);
	const [users, more] = listUsersRes.body;
	expect(more).toBe(false);
	expect(users.length).toBeGreaterThanOrEqual(1);
	expect(users[0].id).toBe(user.id);
	expect(users[0].name).toBe(user.name);
	expect(users[0].email).toBe(user.email);
	expect(users[0].roles).toMatchObject([
		{
			role: "diner",
		},
	]);
});

async function registerUser(name, service) {
	const testUser = {
		name,
		email: `${randomName()}@test.com`,
		password: 'a',
	};
	const registerRes = await service.post('/api/auth').send(testUser);
	registerRes.body.user.password = testUser.password;

	return [registerRes.body.user, registerRes.body.token];
}
