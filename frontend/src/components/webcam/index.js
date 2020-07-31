import { h, Component } from 'preact';

import Stream from '../stream';

export default class Webcam extends Component {
	constructor(props) {
		super(props);

		this.state = {
			videoSrc: null,
			audioSrc: null
		};
	}

	requestUserMedia() {
		const { props } = this;

		const sourceSelected = (audioConstraints, videoConstraints) => {
			const constraints = {
				video: typeof videoConstraints !== "undefined" ? videoConstraints : true
			};

			if (props.audio) {
				constraints.audio =
					typeof audioConstraints !== "undefined" ? audioConstraints : true;
			}

			navigator.mediaDevices
				.getUserMedia(constraints)
				.then(stream => {
					this.handleUserMedia(null, stream);
				})
				.catch(e => {
					this.handleUserMedia(e);
				});
		};
		sourceSelected(props.audioConstraints, props.videoConstraints);
	}

	handleUserMedia(err, stream) {
		const { props } = this;

		if (err || !stream) {
			this.setState({ hasUserMedia: false });
			props.onUserMediaError(err);

			return;
		}
		this.setState({
			hasUserMedia: true,
			videoSrc: window.URL.createObjectURL(stream)
		});
	}

	componentDidMount() {
		console.log("b");
		this.requestUserMedia();
	}

	render() {
		return (
			<Stream videoTrack={this.state.videoSrc} />
		);
	}
}
