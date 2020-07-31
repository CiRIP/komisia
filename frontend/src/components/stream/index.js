import { h, Component, createRef, Fragment } from 'preact';
import style from './style';

export default class Stream extends Component {
	constructor(props) {
		super(props);
		
		this.state = {
			audioVolume: 10,
			showInfo: window.SHOW_INFO || false,
			videoResolutionWidth: null,
			videoResolutionHeight: null,
			videoCanPlay: false,
			videoElemPaused: false,
			maxSpatialLayer: null
		};

		this.video = createRef();
		this.audio = createRef();
	}

	componentDidMount() {
		this._setTracks(this.props.audioTrack, this.props.videoTrack);
	}

	componentDidUpdate() {
		this._setTracks(this.props.audioTrack, this.props.videoTrack);
	}

	_setTracks(audioTrack, videoTrack) {
		const audio = this.audio.current;
		const video = this.video.current;

		if (this._audioTrack === audioTrack && this._videoTrack === videoTrack)
			return;

		this._audioTrack = audioTrack;
		this._videoTrack = videoTrack;

		if (audioTrack) {
			const stream = new MediaStream;

			stream.addTrack(audioTrack);
			audio.srcObject = stream;

			audio.play()
				.catch((error) => {});
		} else {
			audio.srcObject = null;
		}

		if (videoTrack) {
			const stream = new MediaStream;

			stream.addTrack(videoTrack);
			video.srcObject = stream;

			video.oncanplay = () => this.setState({ videoCanPlay: true });

			video.onplay = () => {
				this.setState({ videoElemPaused: false });

				audio.play()
					.catch((error) => {});
			};

			video.onpause = () => this.setState({ videoElemPaused: true });

			video.play()
				.catch((error) => {});
		} else {
			video.srcObject = null;
		}

		console.log(video.srcObject);
	}

	render() {
		return (
			<Fragment>
				<video
					class={(this.props.me ? style.me : "") + " bg-gray-600"}
					autoPlay
					playsInline
					muted
					controls={false}
					ref={this.video}
				/>

				<audio
					autoPlay
					playsInline
					// muted={isMe || audioMuted}
					controls={false}
					ref={this.audio}
				/>
			</Fragment>
		);
	}
}
