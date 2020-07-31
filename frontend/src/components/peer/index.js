import { h, Component } from 'preact';
import { connect } from 'react-redux';

import * as stateActions from '../../redux/actions/stateActions';
import Stream from '../stream';


class Peer extends Component {
	constructor(props) {
		super(props);
	}

	render() {
		const {
			peer,
			audioConsumer,
			videoConsumer,
			screenConsumer,
			audioMuted
		} = this.props;

		const audioEnabled = (
			Boolean(audioConsumer) &&
			!audioConsumer.locallyPaused &&
			!audioConsumer.remotelyPaused
		);

		const videoVisible = (
			Boolean(videoConsumer) &&
			!videoConsumer.locallyPaused &&
			!videoConsumer.remotelyPaused
		);

		console.log(videoConsumer);

		if (this.props.screen) return (
			<Stream
				peer={peer}
				videoConsumerId={screenConsumer ? screenConsumer.id : null}
				videoRtpParameters={screenConsumer ? screenConsumer.rtpParameters : null}
				consumerSpatialLayers={screenConsumer ? screenConsumer.spatialLayers : null}
				consumerTemporalLayers={screenConsumer ? screenConsumer.temporalLayers : null}
				consumerCurrentSpatialLayer={
					screenConsumer ? screenConsumer.currentSpatialLayer : null
				}
				consumerCurrentTemporalLayer={
					screenConsumer ? screenConsumer.currentTemporalLayer : null
				}
				consumerPreferredSpatialLayer={
					screenConsumer ? screenConsumer.preferredSpatialLayer : null
				}
				consumerPreferredTemporalLayer={
					screenConsumer ? screenConsumer.preferredTemporalLayer : null
				}
				consumerPriority={screenConsumer ? screenConsumer.priority : null}
				videoTrack={screenConsumer ? screenConsumer.track : null}
				audioMuted={true}
				videoVisible={videoVisible}
				videoCodec={screenConsumer ? screenConsumer.codec : null}
				videoScore={screenConsumer ? screenConsumer.score : null}
			/>
		);

		return (
			<Stream
				peer={peer}
				audioConsumerId={audioConsumer ? audioConsumer.id : null}
				videoConsumerId={videoConsumer ? videoConsumer.id : null}
				audioRtpParameters={audioConsumer ? audioConsumer.rtpParameters : null}
				videoRtpParameters={videoConsumer ? videoConsumer.rtpParameters : null}
				consumerSpatialLayers={videoConsumer ? videoConsumer.spatialLayers : null}
				consumerTemporalLayers={videoConsumer ? videoConsumer.temporalLayers : null}
				consumerCurrentSpatialLayer={
					videoConsumer ? videoConsumer.currentSpatialLayer : null
				}
				consumerCurrentTemporalLayer={
					videoConsumer ? videoConsumer.currentTemporalLayer : null
				}
				consumerPreferredSpatialLayer={
					videoConsumer ? videoConsumer.preferredSpatialLayer : null
				}
				consumerPreferredTemporalLayer={
					videoConsumer ? videoConsumer.preferredTemporalLayer : null
				}
				consumerPriority={videoConsumer ? videoConsumer.priority : null}
				audioTrack={audioConsumer ? audioConsumer.track : null}
				videoTrack={videoConsumer ? videoConsumer.track : null}
				audioMuted={audioMuted}
				videoVisible={videoVisible}
				videoMultiLayer={videoConsumer && videoConsumer.type !== 'simple'}
				audioCodec={audioConsumer ? audioConsumer.codec : null}
				videoCodec={videoConsumer ? videoConsumer.codec : null}
				audioScore={audioConsumer ? audioConsumer.score : null}
				videoScore={videoConsumer ? videoConsumer.score : null}
			/>
		);
	}
}

const mapStateToProps = (state, { id }) => {
	const me = state.me;
	const peer = state.peers[id];
	const consumersArray = peer.consumers
		.map((consumerId) => state.consumers[consumerId]);
	const audioConsumer =
		consumersArray.find((consumer) => consumer.track.kind === 'audio');
	const videoConsumer =
		consumersArray.filter((consumer) => consumer.track.kind === 'video');

	return {
		peer,
		audioConsumer,
		videoConsumer: videoConsumer[0],
		screenConsumer: videoConsumer[1],
		audioMuted: me.audioMuted
	};
};

const connectedPeer = connect(
	mapStateToProps
)(Peer);

export default connectedPeer;
