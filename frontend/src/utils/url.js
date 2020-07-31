import { PROTOO_PORT } from './constants';

export function getProtooUrl({ roomId, peerId }) {
	const hostname = window.location.hostname;

	return `wss://${hostname}:${PROTOO_PORT}/?roomId=${roomId}&peerId=${peerId}`;
}
