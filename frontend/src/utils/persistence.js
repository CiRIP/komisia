const USER_KEY = 'komisia.user';
const DEVICES_KEY = 'komisia.devices';

export function getUser() {
	return JSON.parse(localStorage.getItem(USER_KEY));
}

export function setUser({ displayName }) {
	localStorage.setItem(USER_KEY, JSON.stringify({ displayName }))
}

export function getDevices() {
	return JSON.parse(localStorage.getItem(DEVICES_KEY));
}

export function setDevices({ webcamEnabled }) {
	localStorage.setItem(DEVICES_KEY, JSON.stringify({ webcamEnabled }));
}
