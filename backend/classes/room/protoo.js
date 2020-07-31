const config = require('../../config');

module.exports = function (Room, logger) {
	/**
	 * Handle protoo requests from browsers.
	 *
	 * @async
	 */
	Room.prototype._handleProtooRequest = async function (peer, request, accept, reject) {
		switch (request.method) {
			case 'getRouterRtpCapabilities':
				{
					accept(this._mediasoupRouter.rtpCapabilities);

					break;
				}

			case 'join':
				{
					// Ensure the Peer is not already joined.
					if (peer.data.joined)
						throw new Error('Peer already joined');

					const {
						displayName,
						device,
						rtpCapabilities,
						sctpCapabilities
					} = request.data;

					// Store client data into the protoo Peer data object.
					peer.data.joined = true;
					peer.data.displayName = displayName;
					peer.data.device = device;
					peer.data.rtpCapabilities = rtpCapabilities;
					peer.data.sctpCapabilities = sctpCapabilities;

					// Tell the new Peer about already joined Peers.
					// And also create Consumers for existing Producers.

					const joinedPeers =
						[
							...this._getJoinedPeers(),
							...this._broadcasters.values()
						];

					// Reply now the request with the list of joined peers (all but the new one).
					const peerInfos = joinedPeers
						.filter((joinedPeer) => joinedPeer.id !== peer.id)
						.map((joinedPeer) => ({
							id: joinedPeer.id,
							displayName: joinedPeer.data.displayName,
							device: joinedPeer.data.device
						}));

					accept({ peers: peerInfos });

					// Mark the new Peer as joined.
					peer.data.joined = true;

					for (const joinedPeer of joinedPeers) {
						// Create Consumers for existing Producers.
						for (const producer of joinedPeer.data.producers.values()) {
							this._createConsumer(
								{
									consumerPeer: peer,
									producerPeer: joinedPeer,
									producer
								});
						}

						// Create DataConsumers for existing DataProducers.
						for (const dataProducer of joinedPeer.data.dataProducers.values()) {
							if (dataProducer.label === 'bot')
								continue;

							this._createDataConsumer(
								{
									dataConsumerPeer: peer,
									dataProducerPeer: joinedPeer,
									dataProducer
								});
						}
					}

					// Create DataConsumers for bot DataProducer.
					this._createDataConsumer(
						{
							dataConsumerPeer: peer,
							dataProducerPeer: null,
							dataProducer: this._bot.dataProducer
						});

					// Notify the new Peer to all other Peers.
					for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
						otherPeer.notify(
							'newPeer',
							{
								id: peer.id,
								displayName: peer.data.displayName,
								device: peer.data.device
							})
							.catch(() => { });
					}

					break;
				}

			case 'createWebRtcTransport':
				{
					// NOTE: Don't require that the Peer is joined here, so the client can
					// initiate mediasoup Transports and be ready when he later joins.

					const {
						forceTcp,
						producing,
						consuming,
						sctpCapabilities
					} = request.data;

					const webRtcTransportOptions =
					{
						...config.mediasoup.webRtcTransportOptions,
						enableSctp: Boolean(sctpCapabilities),
						numSctpStreams: (sctpCapabilities || {}).numStreams,
						appData: { producing, consuming }
					};

					if (forceTcp) {
						webRtcTransportOptions.enableUdp = false;
						webRtcTransportOptions.enableTcp = true;
					}

					const transport = await this._mediasoupRouter.createWebRtcTransport(
						webRtcTransportOptions);

					transport.on('sctpstatechange', (sctpState) => {
						logger.debug('WebRtcTransport "sctpstatechange" event [sctpState:%s]', sctpState);
					});

					transport.on('dtlsstatechange', (dtlsState) => {
						if (dtlsState === 'failed' || dtlsState === 'closed')
							logger.warn('WebRtcTransport "dtlsstatechange" event [dtlsState:%s]', dtlsState);
					});

					// NOTE: For testing.
					// await transport.enableTraceEvent([ 'probation', 'bwe' ]);
					await transport.enableTraceEvent(['bwe']);

					transport.on('trace', (trace) => {
						logger.debug(
							'transport "trace" event [transportId:%s, trace.type:%s, trace:%o]',
							transport.id, trace.type, trace);

						if (trace.type === 'bwe' && trace.direction === 'out') {
							peer.notify(
								'downlinkBwe',
								{
									desiredBitrate: trace.info.desiredBitrate,
									effectiveDesiredBitrate: trace.info.effectiveDesiredBitrate,
									availableBitrate: trace.info.availableBitrate
								})
								.catch(() => { });
						}
					});

					// Store the WebRtcTransport into the protoo Peer data Object.
					peer.data.transports.set(transport.id, transport);

					accept(
						{
							id: transport.id,
							iceParameters: transport.iceParameters,
							iceCandidates: transport.iceCandidates,
							dtlsParameters: transport.dtlsParameters,
							sctpParameters: transport.sctpParameters
						});

					const { maxIncomingBitrate } = config.mediasoup.webRtcTransportOptions;

					// If set, apply max incoming bitrate limit.
					if (maxIncomingBitrate) {
						try { await transport.setMaxIncomingBitrate(maxIncomingBitrate); }
						catch (error) { }
					}

					break;
				}

			case 'connectWebRtcTransport':
				{
					const { transportId, dtlsParameters } = request.data;
					const transport = peer.data.transports.get(transportId);

					if (!transport)
						throw new Error(`transport with id "${transportId}" not found`);

					await transport.connect({ dtlsParameters });

					accept();

					break;
				}

			case 'restartIce':
				{
					const { transportId } = request.data;
					const transport = peer.data.transports.get(transportId);

					if (!transport)
						throw new Error(`transport with id "${transportId}" not found`);

					const iceParameters = await transport.restartIce();

					accept(iceParameters);

					break;
				}

			case 'produce':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { transportId, kind, rtpParameters } = request.data;
					let { appData } = request.data;
					const transport = peer.data.transports.get(transportId);

					if (!transport)
						throw new Error(`transport with id "${transportId}" not found`);

					// Add peerId into appData to later get the associated Peer during
					// the 'loudest' event of the audioLevelObserver.
					appData = { ...appData, peerId: peer.id };

					const producer = await transport.produce(
						{
							kind,
							rtpParameters,
							appData
							// keyFrameRequestDelay: 5000
						});

					// Store the Producer into the protoo Peer data Object.
					peer.data.producers.set(producer.id, producer);

					// Set Producer events.
					producer.on('score', (score) => {
						// logger.debug(
						// 	'producer "score" event [producerId:%s, score:%o]',
						// 	producer.id, score);

						peer.notify('producerScore', { producerId: producer.id, score })
							.catch(() => { });
					});

					producer.on('videoorientationchange', (videoOrientation) => {
						logger.debug(
							'producer "videoorientationchange" event [producerId:%s, videoOrientation:%o]',
							producer.id, videoOrientation);
					});

					// NOTE: For testing.
					// await producer.enableTraceEvent([ 'rtp', 'keyframe', 'nack', 'pli', 'fir' ]);
					// await producer.enableTraceEvent([ 'pli', 'fir' ]);
					// await producer.enableTraceEvent([ 'keyframe' ]);

					producer.on('trace', (trace) => {
						logger.debug(
							'producer "trace" event [producerId:%s, trace.type:%s, trace:%o]',
							producer.id, trace.type, trace);
					});

					accept({ id: producer.id });

					// Optimization: Create a server-side Consumer for each Peer.
					for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
						this._createConsumer(
							{
								consumerPeer: otherPeer,
								producerPeer: peer,
								producer
							});
					}

					// Add into the audioLevelObserver.
					if (producer.kind === 'audio') {
						this._audioLevelObserver.addProducer({ producerId: producer.id })
							.catch(() => { });
					}

					break;
				}

			case 'closeProducer':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { producerId } = request.data;
					const producer = peer.data.producers.get(producerId);

					if (!producer)
						throw new Error(`producer with id "${producerId}" not found`);

					producer.close();

					// Remove from its map.
					peer.data.producers.delete(producer.id);

					accept();

					break;
				}

			case 'pauseProducer':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { producerId } = request.data;
					const producer = peer.data.producers.get(producerId);

					if (!producer)
						throw new Error(`producer with id "${producerId}" not found`);

					await producer.pause();

					accept();

					break;
				}

			case 'resumeProducer':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { producerId } = request.data;
					const producer = peer.data.producers.get(producerId);

					if (!producer)
						throw new Error(`producer with id "${producerId}" not found`);

					await producer.resume();

					accept();

					break;
				}

			case 'pauseConsumer':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { consumerId } = request.data;
					const consumer = peer.data.consumers.get(consumerId);

					if (!consumer)
						throw new Error(`consumer with id "${consumerId}" not found`);

					await consumer.pause();

					accept();

					break;
				}

			case 'resumeConsumer':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { consumerId } = request.data;
					const consumer = peer.data.consumers.get(consumerId);

					if (!consumer)
						throw new Error(`consumer with id "${consumerId}" not found`);

					await consumer.resume();

					accept();

					break;
				}

			case 'setConsumerPreferredLayers':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { consumerId, spatialLayer, temporalLayer } = request.data;
					const consumer = peer.data.consumers.get(consumerId);

					if (!consumer)
						throw new Error(`consumer with id "${consumerId}" not found`);

					await consumer.setPreferredLayers({ spatialLayer, temporalLayer });

					accept();

					break;
				}

			case 'setConsumerPriority':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { consumerId, priority } = request.data;
					const consumer = peer.data.consumers.get(consumerId);

					if (!consumer)
						throw new Error(`consumer with id "${consumerId}" not found`);

					await consumer.setPriority(priority);

					accept();

					break;
				}

			case 'requestConsumerKeyFrame':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { consumerId } = request.data;
					const consumer = peer.data.consumers.get(consumerId);

					if (!consumer)
						throw new Error(`consumer with id "${consumerId}" not found`);

					await consumer.requestKeyFrame();

					accept();

					break;
				}

			case 'produceData':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const {
						transportId,
						sctpStreamParameters,
						label,
						protocol,
						appData
					} = request.data;

					const transport = peer.data.transports.get(transportId);

					if (!transport)
						throw new Error(`transport with id "${transportId}" not found`);

					const dataProducer = await transport.produceData(
						{
							sctpStreamParameters,
							label,
							protocol,
							appData
						});

					// Store the Producer into the protoo Peer data Object.
					peer.data.dataProducers.set(dataProducer.id, dataProducer);

					accept({ id: dataProducer.id });

					switch (dataProducer.label) {
						case 'chat':
							{
								// Create a server-side DataConsumer for each Peer.
								for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
									this._createDataConsumer(
										{
											dataConsumerPeer: otherPeer,
											dataProducerPeer: peer,
											dataProducer
										});
								}

								break;
							}

						case 'bot':
							{
								// Pass it to the bot.
								this._bot.handlePeerDataProducer(
									{
										dataProducerId: dataProducer.id,
										peer
									});

								break;
							}
					}

					break;
				}

			case 'changeDisplayName':
				{
					// Ensure the Peer is joined.
					if (!peer.data.joined)
						throw new Error('Peer not yet joined');

					const { displayName } = request.data;
					const oldDisplayName = peer.data.displayName;

					// Store the display name into the custom data Object of the protoo
					// Peer.
					peer.data.displayName = displayName;

					// Notify other joined Peers.
					for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
						otherPeer.notify(
							'peerDisplayNameChanged',
							{
								peerId: peer.id,
								displayName,
								oldDisplayName
							})
							.catch(() => { });
					}

					accept();

					break;
				}

			case 'getTransportStats':
				{
					const { transportId } = request.data;
					const transport = peer.data.transports.get(transportId);

					if (!transport)
						throw new Error(`transport with id "${transportId}" not found`);

					const stats = await transport.getStats();

					accept(stats);

					break;
				}

			case 'getProducerStats':
				{
					const { producerId } = request.data;
					const producer = peer.data.producers.get(producerId);

					if (!producer)
						throw new Error(`producer with id "${producerId}" not found`);

					const stats = await producer.getStats();

					accept(stats);

					break;
				}

			case 'getConsumerStats':
				{
					const { consumerId } = request.data;
					const consumer = peer.data.consumers.get(consumerId);

					if (!consumer)
						throw new Error(`consumer with id "${consumerId}" not found`);

					const stats = await consumer.getStats();

					accept(stats);

					break;
				}

			case 'getDataProducerStats':
				{
					const { dataProducerId } = request.data;
					const dataProducer = peer.data.dataProducers.get(dataProducerId);

					if (!dataProducer)
						throw new Error(`dataProducer with id "${dataProducerId}" not found`);

					const stats = await dataProducer.getStats();

					accept(stats);

					break;
				}

			case 'getDataConsumerStats':
				{
					const { dataConsumerId } = request.data;
					const dataConsumer = peer.data.dataConsumers.get(dataConsumerId);

					if (!dataConsumer)
						throw new Error(`dataConsumer with id "${dataConsumerId}" not found`);

					const stats = await dataConsumer.getStats();

					accept(stats);

					break;
				}

			default:
				{
					logger.error('unknown request.method "%s"', request.method);

					reject(500, `unknown request.method "${request.method}"`);
				}
		}
	}
};
