import { h, Component } from 'preact';
import { connect } from 'react-redux';

import * as stateActions from '../../redux/actions/stateActions';
import Stream from '../stream';


class Me extends Component {
	constructor(props) {
		super(props);
	}

	render() {
		const {
			roomClient,
			connected,
			me,
			screen,
			audioProducer,
			videoProducer,
			faceDetection,
			onSetStatsPeerId
		} = this.props;

		const videoVisible = Boolean(videoProducer) && !videoProducer.paused;

		console.log(videoProducer);

		return (
			<Stream
				me={!screen}
				peer={me}
				videoProducerId={videoProducer ? videoProducer.id : null}
				videoRtpParameters={videoProducer ? videoProducer.rtpParameters : null}
				videoTrack={videoProducer ? videoProducer.track : null}
				videoVisible={videoVisible}
				videoCodec={videoProducer ? videoProducer.codec : null}
				videoScore={videoProducer ? videoProducer.score : null}
			/>
		);
	}
}

const mapStateToProps = (state, { screen }) => {
	const producersArray = Object.values(state.producers);
	const videoProducer =
		producersArray.filter((producer) => producer.track.kind === 'video');

	return {
		connected: state.room.state === 'connected',
		me: state.me,
		videoProducer: videoProducer[screen ? 1 : 0]
	};
};

const connectedMe = connect(
	mapStateToProps
)(Me);

export default connectedMe;
