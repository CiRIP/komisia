const EventEmitter = require('events').EventEmitter;
const protoo = require('protoo-server');
const Logger = require('../Logger');
const config = require('../../config');
const Bot = require('../bot');

const logger = new Logger('Room');


class Room extends EventEmitter {
	static async create(mediasoupWorker, roomId) {
		logger.info('create() [roomId:%s]', roomId);

		const protooRoom = new protoo.Room();

		const { mediaCodecs } = config.mediasoup.routerOptions;
		const mediasoupRouter = await mediasoupWorker.createRouter({ mediaCodecs });

		const audioLevelObserver = await mediasoupRouter.createAudioLevelObserver(
			{
				maxEntries: 1,
				threshold: -80,
				interval: 800
			});

		const bot = await Bot.create({ mediasoupRouter });

		return new Room(
			roomId,
			protooRoom,
			mediasoupRouter,
			audioLevelObserver,
			bot
		);
	}

	constructor(roomId, protooRoom, mediasoupRouter, audioLevelObserver, bot) {
		super();
		this.setMaxListeners(Infinity);
		
		this._roomId = roomId;
		this._closed = false;
		this._protooRoom = protooRoom;
		this._broadcasters = new Map();
		this._mediasoupRouter = mediasoupRouter;
		this._audioLevelObserver = audioLevelObserver;
		this._bot = bot;

		this._handleAudioLevelObserver();
	}

	close() {
		logger.debug('close()');

		this._closed = true;

		this._protooRoom.close();
		this._mediasoupRouter.close();
		this._bot.close();

		this.emit('close');
	}

	logStatus() {
		logger.info(
			'logStatus() [roomId:%s, protoo Peers:%s, mediasoup Transports:%s]',
			this._roomId,
			this._protooRoom.peers.length,
			this._mediasoupRouter._transports.size); // NOTE: Private API.
	}

	/**
	 * Called from server.js upon a protoo WebSocket connection request from a
	 * browser.
	 *
	 * @param {String} peerId - The id of the protoo peer to be created.
	 * @param {protoo.WebSocketTransport} protooWebSocketTransport - The associated
	 *   protoo WebSocket transport.
	 * @param {Boolean} consume - Whether this peer wants to consume from others.
	 */
	handleProtooConnection(peerId, protooWebSocketTransport, consume = true) {
		const existingPeer = this._protooRoom.getPeer(peerId);

		if (existingPeer) {
			logger.warn(
				'handleProtooConnection() | there is already a protoo Peer with same peerId, closing it [peerId:%s]',
				peerId);

			existingPeer.close();
		}

		let peer;

		try {
			peer = this._protooRoom.createPeer(peerId, protooWebSocketTransport);
		}
		catch (error) {
			logger.error('protooRoom.createPeer() failed:%o', error);
		}

		peer.data.consume = consume;
		peer.data.joined = false;
		peer.data.displayName = undefined;
		peer.data.device = undefined;
		peer.data.rtpCapabilities = undefined;
		peer.data.sctpCapabilities = undefined;

		peer.data.transports = new Map();
		peer.data.producers = new Map();
		peer.data.consumers = new Map();
		peer.data.dataProducers = new Map();
		peer.data.dataConsumers = new Map();

		peer.on('request', (request, accept, reject) => {
			logger.debug(
				'protoo Peer "request" event [method:%s, peerId:%s]',
				request.method, peer.id
			);

			this._handleProtooRequest(peer, request, accept, reject)
				.catch((error) => {
					logger.error('request failed:%o', error);

					reject(error);
				});
		});

		peer.on('close', () => {
			if (this._closed)
				return;

			logger.debug('protoo Peer "close" event [peerId:%s]', peer.id);

			if (peer.data.joined) {
				for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
					otherPeer.notify('peerClosed', { peerId: peer.id })
						.catch(() => { });
				}
			}

			for (const transport of peer.data.transports.values()) {
				transport.close();
			}

			if (this._protooRoom.peers.length === 0) {
				logger.info(
					'last Peer in the room left, closing the room [roomId:%s]',
					this._roomId);

				this.close();
			}
		});
	}

	getRouterRtpCapabilities() {
		return this._mediasoupRouter.rtpCapabilities;
	}

	_handleAudioLevelObserver() {
		this._audioLevelObserver.on('volumes', (volumes) => {
			const { producer, volume } = volumes[0];

			// logger.debug(
			// 	'audioLevelObserver "volumes" event [producerId:%s, volume:%s]',
			// 	producer.id, volume);

			// Notify all Peers.
			for (const peer of this._getJoinedPeers()) {
				peer.notify(
					'activeSpeaker',
					{
						peerId: producer.appData.peerId,
						volume: volume
					})
					.catch(() => { });
			}
		});

		this._audioLevelObserver.on('silence', () => {
			// logger.debug('audioLevelObserver "silence" event');

			// Notify all Peers.
			for (const peer of this._getJoinedPeers()) {
				peer.notify('activeSpeaker', { peerId: null })
					.catch(() => { });
			}
		});
	}

	/**
	 * Helper to get the list of joined protoo peers.
	 */
	_getJoinedPeers({ excludePeer = undefined } = {}) {
		return this._protooRoom.peers
			.filter((peer) => peer.data.joined && peer !== excludePeer);
	}

	/**
	 * Creates a mediasoup Consumer for the given mediasoup Producer.
	 *
	 * @async
	 */
	async _createConsumer({ consumerPeer, producerPeer, producer }) {
		// Optimization:
		// - Create the server-side Consumer in paused mode.
		// - Tell its Peer about it and wait for its response.
		// - Upon receipt of the response, resume the server-side Consumer.
		// - If video, this will mean a single key frame requested by the
		//   server-side Consumer (when resuming it).
		// - If audio (or video), it will avoid that RTP packets are received by the
		//   remote endpoint *before* the Consumer is locally created in the endpoint
		//   (and before the local SDP O/A procedure ends). If that happens (RTP
		//   packets are received before the SDP O/A is done) the PeerConnection may
		//   fail to associate the RTP stream.

		// NOTE: Don't create the Consumer if the remote Peer cannot consume it.
		if (
			!consumerPeer.data.rtpCapabilities ||
			!this._mediasoupRouter.canConsume(
				{
					producerId: producer.id,
					rtpCapabilities: consumerPeer.data.rtpCapabilities
				})
		) {
			return;
		}

		// Must take the Transport the remote Peer is using for consuming.
		const transport = Array.from(consumerPeer.data.transports.values())
			.find((t) => t.appData.consuming);

		// This should not happen.
		if (!transport) {
			logger.warn('_createConsumer() | Transport for consuming not found');

			return;
		}

		// Create the Consumer in paused mode.
		let consumer;

		try {
			consumer = await transport.consume(
				{
					producerId: producer.id,
					rtpCapabilities: consumerPeer.data.rtpCapabilities,
					paused: true
				});
		}
		catch (error) {
			logger.warn('_createConsumer() | transport.consume():%o', error);

			return;
		}

		// Store the Consumer into the protoo consumerPeer data Object.
		consumerPeer.data.consumers.set(consumer.id, consumer);

		// Set Consumer events.
		consumer.on('transportclose', () => {
			// Remove from its map.
			consumerPeer.data.consumers.delete(consumer.id);
		});

		consumer.on('producerclose', () => {
			// Remove from its map.
			consumerPeer.data.consumers.delete(consumer.id);

			consumerPeer.notify('consumerClosed', { consumerId: consumer.id })
				.catch(() => { });
		});

		consumer.on('producerpause', () => {
			consumerPeer.notify('consumerPaused', { consumerId: consumer.id })
				.catch(() => { });
		});

		consumer.on('producerresume', () => {
			consumerPeer.notify('consumerResumed', { consumerId: consumer.id })
				.catch(() => { });
		});

		consumer.on('score', (score) => {
			// logger.debug(
			// 	'consumer "score" event [consumerId:%s, score:%o]',
			// 	consumer.id, score);

			consumerPeer.notify('consumerScore', { consumerId: consumer.id, score })
				.catch(() => { });
		});

		consumer.on('layerschange', (layers) => {
			consumerPeer.notify(
				'consumerLayersChanged',
				{
					consumerId: consumer.id,
					spatialLayer: layers ? layers.spatialLayer : null,
					temporalLayer: layers ? layers.temporalLayer : null
				})
				.catch(() => { });
		});

		// NOTE: For testing.
		// await consumer.enableTraceEvent([ 'rtp', 'keyframe', 'nack', 'pli', 'fir' ]);
		// await consumer.enableTraceEvent([ 'pli', 'fir' ]);
		// await consumer.enableTraceEvent([ 'keyframe' ]);

		consumer.on('trace', (trace) => {
			logger.debug(
				'consumer "trace" event [producerId:%s, trace.type:%s, trace:%o]',
				consumer.id, trace.type, trace);
		});

		// Send a protoo request to the remote Peer with Consumer parameters.
		try {
			await consumerPeer.request(
				'newConsumer',
				{
					peerId: producerPeer.id,
					producerId: producer.id,
					id: consumer.id,
					kind: consumer.kind,
					rtpParameters: consumer.rtpParameters,
					type: consumer.type,
					appData: producer.appData,
					producerPaused: consumer.producerPaused
				});

			// Now that we got the positive response from the remote endpoint, resume
			// the Consumer so the remote endpoint will receive the a first RTP packet
			// of this new stream once its PeerConnection is already ready to process
			// and associate it.
			await consumer.resume();

			consumerPeer.notify(
				'consumerScore',
				{
					consumerId: consumer.id,
					score: consumer.score
				})
				.catch(() => { });
		}
		catch (error) {
			logger.warn('_createConsumer() | failed:%o', error);
		}
	}

	/**
	 * Creates a mediasoup DataConsumer for the given mediasoup DataProducer.
	 *
	 * @async
	 */
	async _createDataConsumer(
		{
			dataConsumerPeer,
			dataProducerPeer = null, // This is null for the bot DataProducer.
			dataProducer
		}) {
		// NOTE: Don't create the DataConsumer if the remote Peer cannot consume it.
		if (!dataConsumerPeer.data.sctpCapabilities)
			return;

		// Must take the Transport the remote Peer is using for consuming.
		const transport = Array.from(dataConsumerPeer.data.transports.values())
			.find((t) => t.appData.consuming);

		// This should not happen.
		if (!transport) {
			logger.warn('_createDataConsumer() | Transport for consuming not found');

			return;
		}

		// Create the DataConsumer.
		let dataConsumer;

		try {
			dataConsumer = await transport.consumeData(
				{
					dataProducerId: dataProducer.id
				});
		}
		catch (error) {
			logger.warn('_createDataConsumer() | transport.consumeData():%o', error);

			return;
		}

		// Store the DataConsumer into the protoo dataConsumerPeer data Object.
		dataConsumerPeer.data.dataConsumers.set(dataConsumer.id, dataConsumer);

		// Set DataConsumer events.
		dataConsumer.on('transportclose', () => {
			// Remove from its map.
			dataConsumerPeer.data.dataConsumers.delete(dataConsumer.id);
		});

		dataConsumer.on('dataproducerclose', () => {
			// Remove from its map.
			dataConsumerPeer.data.dataConsumers.delete(dataConsumer.id);

			dataConsumerPeer.notify(
				'dataConsumerClosed', { dataConsumerId: dataConsumer.id })
				.catch(() => { });
		});

		// Send a protoo request to the remote Peer with Consumer parameters.
		try {
			await dataConsumerPeer.request(
				'newDataConsumer',
				{
					// This is null for bot DataProducer.
					peerId: dataProducerPeer ? dataProducerPeer.id : null,
					dataProducerId: dataProducer.id,
					id: dataConsumer.id,
					sctpStreamParameters: dataConsumer.sctpStreamParameters,
					label: dataConsumer.label,
					protocol: dataConsumer.protocol,
					appData: dataProducer.appData
				});
		}
		catch (error) {
			logger.warn('_createDataConsumer() | failed:%o', error);
		}
	}
}

require('./rest')(Room, logger);
require('./protoo')(Room, logger);

module.exports = Room;
