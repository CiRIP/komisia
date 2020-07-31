const config = require('../../config');

module.exports = function (Room, logger) {
	/**
	 * Create a Broadcaster. This is for HTTP API requests (see server.js).
	 *
	 * @async
	 *
	 * @type {String} id - Broadcaster id.
	 * @type {String} displayName - Descriptive name.
	 * @type {Object} [device] - Additional info with name, version and flags fields.
	 * @type {RTCRtpCapabilities} [rtpCapabilities] - Device RTP capabilities.
	 */
	Room.prototype.createBroadcaster = async function ({ id, displayName, device = {}, rtpCapabilities }) {
		if (typeof id !== 'string' || !id)
			throw new TypeError('missing body.id');
		else if (typeof displayName !== 'string' || !displayName)
			throw new TypeError('missing body.displayName');
		else if (typeof device.name !== 'string' || !device.name)
			throw new TypeError('missing body.device.name');
		else if (rtpCapabilities && typeof rtpCapabilities !== 'object')
			throw new TypeError('wrong body.rtpCapabilities');

		if (this._broadcasters.has(id))
			throw new Error(`broadcaster with id "${id}" already exists`);

		const broadcaster =
		{
			id,
			data:
			{
				displayName,
				device:
				{
					flag: 'broadcaster',
					name: device.name || 'Unknown device',
					version: device.version
				},
				rtpCapabilities,
				transports: new Map(),
				producers: new Map(),
				consumers: new Map(),
				dataProducers: new Map(),
				dataConsumers: new Map()
			}
		};

		// Store the Broadcaster into the map.
		this._broadcasters.set(broadcaster.id, broadcaster);

		// Notify the new Broadcaster to all Peers.
		for (const otherPeer of this._getJoinedPeers()) {
			otherPeer.notify(
				'newPeer',
				{
					id: broadcaster.id,
					displayName: broadcaster.data.displayName,
					device: broadcaster.data.device
				})
				.catch(() => { });
		}

		// Reply with the list of Peers and their Producers.
		const peerInfos = [];
		const joinedPeers = this._getJoinedPeers();

		// Just fill the list of Peers if the Broadcaster provided its rtpCapabilities.
		if (rtpCapabilities) {
			for (const joinedPeer of joinedPeers) {
				const peerInfo =
				{
					id: joinedPeer.id,
					displayName: joinedPeer.data.displayName,
					device: joinedPeer.data.device,
					producers: []
				};

				for (const producer of joinedPeer.data.producers.values()) {
					// Ignore Producers that the Broadcaster cannot consume.
					if (
						!this._mediasoupRouter.canConsume(
							{
								producerId: producer.id,
								rtpCapabilities
							})
					) {
						continue;
					}

					peerInfo.producers.push(
						{
							id: producer.id,
							kind: producer.kind
						});
				}

				peerInfos.push(peerInfo);
			}
		}

		return { peers: peerInfos };
	}

	/**
	 * Delete a Broadcaster.
	 *
	 * @type {String} broadcasterId
	 */
	Room.prototype.deleteBroadcaster = function ({ broadcasterId }) {
		const broadcaster = this._broadcasters.get(broadcasterId);

		if (!broadcaster)
			throw new Error(`broadcaster with id "${broadcasterId}" does not exist`);

		for (const transport of broadcaster.data.transports.values()) {
			transport.close();
		}

		this._broadcasters.delete(broadcasterId);

		for (const peer of this._getJoinedPeers()) {
			peer.notify('peerClosed', { peerId: broadcasterId })
				.catch(() => { });
		}
	}

	/**
	 * Create a mediasoup Transport associated to a Broadcaster. It can be a
	 * PlainTransport or a WebRtcTransport.
	 *
	 * @async
	 *
	 * @type {String} broadcasterId
	 * @type {String} type - Can be 'plain' (PlainTransport) or 'webrtc'
	 *   (WebRtcTransport).
	 * @type {Boolean} [rtcpMux=false] - Just for PlainTransport, use RTCP mux.
	 * @type {Boolean} [comedia=true] - Just for PlainTransport, enable remote IP:port
	 *   autodetection.
	 * @type {Object} [sctpCapabilities] - SCTP capabilities
	 */
	Room.prototype.createBroadcasterTransport = async function (
		{
			broadcasterId,
			type,
			rtcpMux = false,
			comedia = true,
			sctpCapabilities
		}) {
		const broadcaster = this._broadcasters.get(broadcasterId);

		if (!broadcaster)
			throw new Error(`broadcaster with id "${broadcasterId}" does not exist`);

		switch (type) {
			case 'webrtc':
				{
					const webRtcTransportOptions =
					{
						...config.mediasoup.webRtcTransportOptions,
						enableSctp: Boolean(sctpCapabilities),
						numSctpStreams: (sctpCapabilities || {}).numStreams
					};

					const transport = await this._mediasoupRouter.createWebRtcTransport(
						webRtcTransportOptions);

					// Store it.
					broadcaster.data.transports.set(transport.id, transport);

					return {
						id: transport.id,
						iceParameters: transport.iceParameters,
						iceCandidates: transport.iceCandidates,
						dtlsParameters: transport.dtlsParameters,
						sctpParameters: transport.sctpParameters
					};
				}

			case 'plain':
				{
					const plainTransportOptions =
					{
						...config.mediasoup.plainTransportOptions,
						rtcpMux: rtcpMux,
						comedia: comedia
					};

					const transport = await this._mediasoupRouter.createPlainTransport(
						plainTransportOptions);

					// Store it.
					broadcaster.data.transports.set(transport.id, transport);

					return {
						id: transport.id,
						ip: transport.tuple.localIp,
						port: transport.tuple.localPort,
						rtcpPort: transport.rtcpTuple ? transport.rtcpTuple.localPort : undefined
					};
				}

			default:
				{
					throw new TypeError('invalid type');
				}
		}
	}

	/**
	 * Connect a Broadcaster mediasoup WebRtcTransport.
	 *
	 * @async
	 *
	 * @type {String} broadcasterId
	 * @type {String} transportId
	 * @type {RTCDtlsParameters} dtlsParameters - Remote DTLS parameters.
	 */
	Room.prototype.connectBroadcasterTransport = async function (
		{
			broadcasterId,
			transportId,
			dtlsParameters
		}
	) {
		const broadcaster = this._broadcasters.get(broadcasterId);

		if (!broadcaster)
			throw new Error(`broadcaster with id "${broadcasterId}" does not exist`);

		const transport = broadcaster.data.transports.get(transportId);

		if (!transport)
			throw new Error(`transport with id "${transportId}" does not exist`);

		if (transport.constructor.name !== 'WebRtcTransport') {
			throw new Error(
				`transport with id "${transportId}" is not a WebRtcTransport`);
		}

		await transport.connect({ dtlsParameters });
	}

	/**
	 * Create a mediasoup Producer associated to a Broadcaster.
	 *
	 * @async
	 *
	 * @type {String} broadcasterId
	 * @type {String} transportId
	 * @type {String} kind - 'audio' or 'video' kind for the Producer.
	 * @type {RTCRtpParameters} rtpParameters - RTP parameters for the Producer.
	 */
	Room.prototype.createBroadcasterProducer = async function (
		{
			broadcasterId,
			transportId,
			kind,
			rtpParameters
		}
	) {
		const broadcaster = this._broadcasters.get(broadcasterId);

		if (!broadcaster)
			throw new Error(`broadcaster with id "${broadcasterId}" does not exist`);

		const transport = broadcaster.data.transports.get(transportId);

		if (!transport)
			throw new Error(`transport with id "${transportId}" does not exist`);

		const producer =
			await transport.produce({ kind, rtpParameters });

		// Store it.
		broadcaster.data.producers.set(producer.id, producer);

		// Set Producer events.
		// producer.on('score', (score) =>
		// {
		// 	logger.debug(
		// 		'broadcaster producer "score" event [producerId:%s, score:%o]',
		// 		producer.id, score);
		// });

		producer.on('videoorientationchange', (videoOrientation) => {
			logger.debug(
				'broadcaster producer "videoorientationchange" event [producerId:%s, videoOrientation:%o]',
				producer.id, videoOrientation);
		});

		// Optimization: Create a server-side Consumer for each Peer.
		for (const peer of this._getJoinedPeers()) {
			this._createConsumer(
				{
					consumerPeer: peer,
					producerPeer: broadcaster,
					producer
				});
		}

		// Add into the audioLevelObserver.
		if (producer.kind === 'audio') {
			this._audioLevelObserver.addProducer({ producerId: producer.id })
				.catch(() => { });
		}

		return { id: producer.id };
	}

	/**
	 * Create a mediasoup Consumer associated to a Broadcaster.
	 *
	 * @async
	 *
	 * @type {String} broadcasterId
	 * @type {String} transportId
	 * @type {String} producerId
	 */
	Room.prototype.createBroadcasterConsumer = async function (
		{
			broadcasterId,
			transportId,
			producerId
		}
	) {
		const broadcaster = this._broadcasters.get(broadcasterId);

		if (!broadcaster)
			throw new Error(`broadcaster with id "${broadcasterId}" does not exist`);

		if (!broadcaster.data.rtpCapabilities)
			throw new Error('broadcaster does not have rtpCapabilities');

		const transport = broadcaster.data.transports.get(transportId);

		if (!transport)
			throw new Error(`transport with id "${transportId}" does not exist`);

		const consumer = await transport.consume(
			{
				producerId,
				rtpCapabilities: broadcaster.data.rtpCapabilities
			});

		// Store it.
		broadcaster.data.consumers.set(consumer.id, consumer);

		// Set Consumer events.
		consumer.on('transportclose', () => {
			// Remove from its map.
			broadcaster.data.consumers.delete(consumer.id);
		});

		consumer.on('producerclose', () => {
			// Remove from its map.
			broadcaster.data.consumers.delete(consumer.id);
		});

		return {
			id: consumer.id,
			producerId,
			kind: consumer.kind,
			rtpParameters: consumer.rtpParameters,
			type: consumer.type
		};
	}

	/**
	 * Create a mediasoup DataConsumer associated to a Broadcaster.
	 *
	 * @async
	 *
	 * @type {String} broadcasterId
	 * @type {String} transportId
	 * @type {String} dataProducerId
	 */
	Room.prototype.createBroadcasterDataConsumer = async function (
		{
			broadcasterId,
			transportId,
			dataProducerId
		}
	) {
		const broadcaster = this._broadcasters.get(broadcasterId);

		if (!broadcaster)
			throw new Error(`broadcaster with id "${broadcasterId}" does not exist`);

		if (!broadcaster.data.rtpCapabilities)
			throw new Error('broadcaster does not have rtpCapabilities');

		const transport = broadcaster.data.transports.get(transportId);

		if (!transport)
			throw new Error(`transport with id "${transportId}" does not exist`);

		const dataConsumer = await transport.consumeData(
			{
				dataProducerId
			});

		// Store it.
		broadcaster.data.dataConsumers.set(consumer.id, consumer);

		// Set Consumer events.
		dataConsumer.on('transportclose', () => {
			// Remove from its map.
			broadcaster.data.dataConsumers.delete(consumer.id);
		});

		dataConsumer.on('dataproducerclose', () => {
			// Remove from its map.
			broadcaster.data.dataConsumers.delete(consumer.id);
		});

		return {
			id: dataConsumer.id
		};
	}

	/**
	 * Create a mediasoup DataProducer associated to a Broadcaster.
	 *
	 * @async
	 *
	 * @type {String} broadcasterId
	 * @type {String} transportId
	 */
	Room.prototype.createBroadcasterDataProducer = async function (
		{
			broadcasterId,
			transportId,
			label,
			protocol,
			sctpStreamParameters,
			appData
		}
	) {
		const broadcaster = this._broadcasters.get(broadcasterId);

		if (!broadcaster)
			throw new Error(`broadcaster with id "${broadcasterId}" does not exist`);

		// if (!broadcaster.data.sctpCapabilities)
		// 	throw new Error('broadcaster does not have sctpCapabilities');

		const transport = broadcaster.data.transports.get(transportId);

		if (!transport)
			throw new Error(`transport with id "${transportId}" does not exist`);

		const dataProducer = await transport.produceData(
			{
				sctpStreamParameters,
				label,
				protocol,
				appData
			});

		// Store it.
		broadcaster.data.dataProducers.set(consumer.id, consumer);

		// Set Consumer events.
		dataProducer.on('transportclose', () => {
			// Remove from its map.
			broadcaster.data.dataProducers.delete(consumer.id);
		});

		// // Optimization: Create a server-side Consumer for each Peer.
		// for (const peer of this._getJoinedPeers())
		// {
		// 	this._createDataConsumer(
		// 		{
		// 			dataConsumerPeer : peer,
		// 			dataProducerPeer : broadcaster,
		// 			dataProducer: dataProducer
		// 		});
		// }

		return {
			id: dataProducer.id
		};
	}
};
